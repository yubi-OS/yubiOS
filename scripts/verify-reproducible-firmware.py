#!/usr/bin/env python3

"""Compare two isolated ARM64 firmware builds at the intended-subject boundary."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys


BOARDS = ("qemu-arm64", "rockpro64-rk3399", "pinetab2-rk3566", "rock5b-rk3588")
COMMON_REQUIRED = (
    "stmm/BL32_AP_MM.fd",
    "firmware/BL32_AP_MM.fd",
    "firmware/firmware-manifest.txt",
    "firmware/u-boot/u-boot.bin",
)
OPTEE_REQUIRED = (
    "tee-header_v2.bin",
    "tee-pager_v2.bin",
    "tee-pageable_v2.bin",
    "tee.bin",
    "tee.elf",
)
ROCKCHIP_IMAGE_NAMES = (
    "idbloader.img",
    "u-boot.itb",
    "u-boot-rockchip.bin",
    "u-boot-rockchip-spi.bin",
)
SIGNED_QEMU_REASON = (
    "QEMU TF-A CREATE_KEYS=1 certificate and signature envelope; "
    "compared separately from unsigned components"
)
DIAGNOSTIC_PATHS = {
    "firmware/u-boot-build.log",
    "firmware/u-boot-config-summary.txt",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare two isolated yubiOS firmware artifact trees."
    )
    parser.add_argument("board", choices=BOARDS)
    parser.add_argument("primary", type=Path)
    parser.add_argument("rebuild", type=Path)
    parser.add_argument("report", type=Path)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def selected_path(relative: str) -> bool:
    return (
        relative.startswith(("stmm/", "firmware/"))
        and relative not in DIAGNOSTIC_PATHS
    )


def discover(root: Path) -> dict[str, Path]:
    if not root.is_dir():
        raise ValueError(f"artifact tree does not exist: {root}")
    return {
        path.relative_to(root).as_posix(): path
        for path in root.rglob("*")
        if path.is_file() and selected_path(path.relative_to(root).as_posix())
    }


def parse_manifest(root: Path) -> dict[str, str]:
    manifest = root / "firmware/firmware-manifest.txt"
    if not manifest.is_file():
        return {}
    values: dict[str, str] = {}
    for line in manifest.read_text(errors="replace").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    return values


def required_errors(
    board: str, paths: set[str], manifest: dict[str, str], label: str
) -> list[str]:
    errors = [
        f"{label} is missing required firmware subject: {required}"
        for required in COMMON_REQUIRED
        if required not in paths
    ]
    for filename in OPTEE_REQUIRED:
        if not any(path.endswith(f"/{filename}") for path in paths):
            errors.append(f"{label} is missing required OP-TEE subject: {filename}")

    if board == "qemu-arm64":
        for filename in ("fip.bin", "bl1.bin", "bl31.elf"):
            if not any(
                path.startswith("firmware/arm-trusted-firmware/")
                and path.endswith(f"/{filename}")
                for path in paths
            ):
                errors.append(f"{label} is missing QEMU TF-A envelope: {filename}")
        if "firmware/fip-info.txt" not in paths:
            errors.append(f"{label} is missing QEMU FIP inventory")
    else:
        if not any(path.endswith("/bl31.elf") for path in paths):
            errors.append(f"{label} is missing Rockchip TF-A BL31")
        tpl_provided = manifest.get("rockchip_tpl_provided") == "true"
        if board in ("rockpro64-rk3399", "pinetab2-rk3566") or tpl_provided:
            for filename in ROCKCHIP_IMAGE_NAMES:
                if not any(path.endswith(f"/{filename}") for path in paths):
                    errors.append(
                        f"{label} is missing bootable Rockchip subject: {filename}"
                    )
        elif "firmware/rk-tpl-required.txt" not in paths:
            errors.append(f"{label} is missing the RK3588 external-TPL gate record")
    return errors


def metadata_errors(
    board: str,
    manifest: dict[str, str],
    label: str,
    source: str,
    epoch: str,
) -> list[str]:
    expected = {
        "board": board,
        "arch": "arm64",
        "yubios_commit": source,
        "source_date_epoch": epoch,
    }
    errors = [
        f"{label} manifest has {key}={manifest.get(key)!r}, expected {value!r}"
        for key, value in expected.items()
        if manifest.get(key) != value
    ]
    if board == "qemu-arm64" and manifest.get("signature_envelope") != (
        "TF-A CREATE_KEYS=1; excluded from byte-for-byte proof"
    ):
        errors.append(f"{label} manifest does not declare the QEMU signing boundary")
    return errors


def is_excluded(board: str, relative: str) -> bool:
    return board == "qemu-arm64" and (
        relative.startswith("firmware/arm-trusted-firmware/")
        or relative == "firmware/fip-info.txt"
    )


def main() -> int:
    args = parse_args()
    source = os.environ.get("GIT_SHA", "")
    epoch = os.environ.get("SOURCE_DATE_EPOCH", "")
    if not re.fullmatch(r"[0-9a-f]{40}", source):
        raise SystemExit("GIT_SHA must be a full lowercase Git commit SHA")
    if not epoch.isdigit():
        raise SystemExit("SOURCE_DATE_EPOCH must be an integer")

    errors: list[str] = []
    try:
        primary = discover(args.primary)
        rebuild = discover(args.rebuild)
    except ValueError as error:
        raise SystemExit(str(error)) from error

    primary_manifest = parse_manifest(args.primary)
    rebuild_manifest = parse_manifest(args.rebuild)
    errors.extend(required_errors(args.board, set(primary), primary_manifest, "primary"))
    errors.extend(required_errors(args.board, set(rebuild), rebuild_manifest, "rebuild"))
    errors.extend(metadata_errors(args.board, primary_manifest, "primary", source, epoch))
    errors.extend(metadata_errors(args.board, rebuild_manifest, "rebuild", source, epoch))

    primary_paths = set(primary)
    rebuild_paths = set(rebuild)
    for missing in sorted(primary_paths - rebuild_paths):
        errors.append(f"rebuild is missing selected path: {missing}")
    for missing in sorted(rebuild_paths - primary_paths):
        errors.append(f"primary is missing selected path: {missing}")

    compared = []
    excluded = []
    for relative in sorted(primary_paths & rebuild_paths):
        primary_digest = sha256(primary[relative])
        rebuild_digest = sha256(rebuild[relative])
        primary_size = primary[relative].stat().st_size
        rebuild_size = rebuild[relative].stat().st_size
        if is_excluded(args.board, relative):
            excluded.append(
                {
                    "path": relative,
                    "reason": SIGNED_QEMU_REASON,
                    "primary_sha256": primary_digest,
                    "rebuild_sha256": rebuild_digest,
                    "matched": primary_digest == rebuild_digest,
                }
            )
            continue
        matched = primary_digest == rebuild_digest and primary_size == rebuild_size
        compared.append(
            {
                "path": relative,
                "sha256": primary_digest,
                "size": primary_size,
                "matched": matched,
            }
        )
        if not matched:
            errors.append(
                f"firmware subject differs: {relative} "
                f"(primary {primary_digest}/{primary_size}, "
                f"rebuild {rebuild_digest}/{rebuild_size})"
            )

    report = {
        "schema": 1,
        "source": source,
        "source_date_epoch": int(epoch),
        "architecture": "arm64",
        "board": args.board,
        "isolated_builds": 2,
        "build_variants": ["arm64", "arm64-repro"],
        "scope": "intended unsigned firmware components",
        "result": "match" if not errors else "mismatch",
        "compared": compared,
        "excluded": excluded,
        "errors": errors,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")

    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    print(
        f"PASS: {args.board} matched across two isolated ARM64 builds "
        f"({len(compared)} compared files, {len(excluded)} signed-envelope files recorded)"
    )
    print(f"Evidence: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
