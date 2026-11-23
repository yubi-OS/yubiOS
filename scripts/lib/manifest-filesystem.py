#!/usr/bin/env python3

"""Emit a canonical JSON-lines or UAPI.16 JSON-SEQ manifest for a mounted filesystem tree."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys


UAPI16_MEDIA_TYPE = "application/vnd.uapi.16.manifest"
UAPI16_RS = "\x1e"

UAPI16_TYPE_MAP = {
    "file": "reg",
    "directory": "dir",
    "symlink": "lnk",
    "char-device": "chr",
    "block-device": "blk",
    "fifo": "fifo",
    "socket": "sock",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Record filesystem contents and intended POSIX metadata."
    )
    parser.add_argument(
        "--exclude-content",
        action="append",
        default=[],
        metavar="RELATIVE_PATH",
        help=(
            "retain a regular file's path and metadata while declaring its "
            "signature-bearing content outside the equality subject"
        ),
    )
    parser.add_argument(
        "--format",
        choices=("yubios", "uapi16"),
        default="yubios",
        help="manifest output format: 'yubios' (default JSONL) or 'uapi16' (RFC 7464 JSON-SEQ)",
    )
    parser.add_argument("root", type=Path)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def collect(root: Path) -> list[tuple[str, Path, os.stat_result]]:
    entries: list[tuple[str, Path, os.stat_result]] = [(".", root, root.lstat())]

    def visit(directory: Path, relative: str) -> None:
        with os.scandir(directory) as stream:
            children = sorted(stream, key=lambda entry: os.fsencode(entry.name))
        for child in children:
            child_relative = child.name if relative == "." else f"{relative}/{child.name}"
            child_path = directory / child.name
            status = child.stat(follow_symlinks=False)
            entries.append((child_relative, child_path, status))
            if stat.S_ISDIR(status.st_mode):
                visit(child_path, child_relative)

    visit(root, ".")
    return entries


def file_type(mode: int) -> str:
    if stat.S_ISREG(mode):
        return "file"
    if stat.S_ISDIR(mode):
        return "directory"
    if stat.S_ISLNK(mode):
        return "symlink"
    if stat.S_ISCHR(mode):
        return "char-device"
    if stat.S_ISBLK(mode):
        return "block-device"
    if stat.S_ISFIFO(mode):
        return "fifo"
    if stat.S_ISSOCK(mode):
        return "socket"
    return "unknown"


def read_xattrs(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for name in sorted(
        os.listxattr(path, follow_symlinks=False), key=os.fsencode
    ):
        value = os.getxattr(path, name, follow_symlinks=False)
        values[name] = base64.b64encode(value).decode("ascii")
    return values


def normalize_content_exclusions(values: list[str]) -> set[str]:
    exclusions: set[str] = set()
    for value in values:
        relative = PurePosixPath(value)
        if (
            not value
            or relative.is_absolute()
            or str(relative) != value
            or ".." in relative.parts
            or value in exclusions
        ):
            raise ValueError(f"invalid or duplicate content exclusion: {value!r}")
        exclusions.add(value)
    return exclusions


def emit_uapi16(
    entries: list[tuple[str, Path, os.stat_result]],
    content_exclusions: set[str],
    hardlink_tokens: dict[tuple[int, int], int],
    digest_cache: dict[tuple[int, int], str],
) -> int:
    for relative, path, status in entries:
        kind = file_type(status.st_mode)
        uapi_type = UAPI16_TYPE_MAP.get(kind, "reg")
        record: dict[str, object] = {
            "type": uapi_type,
            "mode": stat.S_IMODE(status.st_mode),
            "uid": status.st_uid,
            "gid": status.st_gid,
            "mTimeNSec": status.st_mtime_ns,
        }
        if relative == ".":
            record["mediaType"] = UAPI16_MEDIA_TYPE
        else:
            record["name"] = relative
        xattrs = read_xattrs(path)
        if xattrs:
            record["extendedAttributes"] = {
                k: {"base64": v} for k, v in xattrs.items()
            }
        if kind == "file":
            identity = (status.st_dev, status.st_ino)
            record["size"] = status.st_size
            token = hardlink_tokens.get(identity)
            if token is not None:
                record["inodeToken"] = token
            if relative not in content_exclusions:
                digest = digest_cache.get(identity)
                if digest is None:
                    digest = sha256(path)
                    digest_cache[identity] = digest
                record["sha256"] = digest
                record["contents"] = [{"file": relative}]
        elif kind == "symlink":
            target_bytes = os.readlink(path).encode("utf-8", errors="surrogateescape")
            record["contents"] = [
                {"literal": base64.b64encode(target_bytes).decode("ascii")}
            ]
        elif kind in {"char-device", "block-device"}:
            record["major"] = os.major(status.st_rdev)
            record["minor"] = os.minor(status.st_rdev)
        sys.stdout.write(
            f"{UAPI16_RS}{json.dumps(record, sort_keys=True, separators=(',', ':'))}\n"
        )
    return 0


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        raise SystemExit(f"filesystem root does not exist: {root}")

    content_exclusions = normalize_content_exclusions(args.exclude_content)
    entries = collect(root)
    by_relative = {relative: status for relative, _path, status in entries}
    for relative in sorted(content_exclusions, key=os.fsencode):
        status = by_relative.get(relative)
        if status is None:
            raise ValueError(f"content exclusion does not exist: {relative}")
        if not stat.S_ISREG(status.st_mode):
            raise ValueError(f"content exclusion is not a regular file: {relative}")

    hardlinks: dict[tuple[int, int], list[str]] = {}
    for relative, _path, status in entries:
        if stat.S_ISREG(status.st_mode) and status.st_nlink > 1:
            hardlinks.setdefault((status.st_dev, status.st_ino), []).append(relative)
    hardlink_first = {
        identity: sorted(paths, key=os.fsencode)[0]
        for identity, paths in hardlinks.items()
    }
    hardlink_tokens = {
        identity: idx + 1
        for idx, (identity, _first) in enumerate(
            sorted(hardlink_first.items(), key=lambda kv: os.fsencode(kv[1]))
        )
    }
    digest_cache: dict[tuple[int, int], str] = {}

    if args.format == "uapi16":
        return emit_uapi16(entries, content_exclusions, hardlink_tokens, digest_cache)

    print(
        json.dumps(
            {
                "content_exclusions": sorted(content_exclusions, key=os.fsencode),
                "kind": "yubiOS-root-filesystem-manifest",
                "schema": 2,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    for relative, path, status in entries:
        kind = file_type(status.st_mode)
        record: dict[str, object] = {
            "gid": status.st_gid,
            "mode": f"{stat.S_IMODE(status.st_mode):04o}",
            "mtime_ns": status.st_mtime_ns,
            "path": relative,
            "type": kind,
            "uid": status.st_uid,
            "xattrs": read_xattrs(path),
        }
        if kind == "file":
            identity = (status.st_dev, status.st_ino)
            record["size"] = status.st_size
            first = hardlink_first.get(identity)
            if first is not None and first != relative:
                record["hardlink_to"] = first
            if relative in content_exclusions:
                record["content_compared"] = False
            else:
                digest = digest_cache.get(identity)
                if digest is None:
                    digest = sha256(path)
                    digest_cache[identity] = digest
                record["sha256"] = digest
        elif kind == "symlink":
            record["target"] = os.readlink(path)
        elif kind in {"char-device", "block-device"}:
            record["major"] = os.major(status.st_rdev)
            record["minor"] = os.minor(status.st_rdev)
        print(json.dumps(record, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"filesystem-manifest: {error}", file=sys.stderr)
        raise SystemExit(1) from error
