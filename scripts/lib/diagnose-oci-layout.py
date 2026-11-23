#!/usr/bin/env python3
"""Explain byte differences between two OCI image-layout directories."""

from __future__ import annotations

import difflib
import gzip
import hashlib
import io
import json
import lzma
import struct
import subprocess
import sys
import tarfile
from itertools import zip_longest
from pathlib import Path
from typing import Any, NoReturn


MAX_DIFF_LINES = 500
TEXT_PE_SECTIONS = {".cmdline", ".osrel", ".uname", ".sbat"}


def die(message: str) -> NoReturn:
    raise SystemExit(f"diagnose-oci-layout: {message}")


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as stream:
        return json.load(stream)


def blob_path(layout: Path, digest: str) -> Path:
    algorithm, separator, value = digest.partition(":")
    if separator != ":" or algorithm != "sha256" or len(value) != 64:
        die(f"unsupported digest {digest!r}")
    return layout / "blobs" / algorithm / value


def resolve_image_descriptors(layout: Path) -> tuple[Any, str, Any, str, Any]:
    index = read_json(layout / "index.json")
    manifests = index.get("manifests", [])
    if not manifests:
        die(f"{layout} has no image manifest")
    descriptor = manifests[0]
    manifest = read_json(blob_path(layout, descriptor["digest"]))
    # BUILDKIT_MULTI_PLATFORM=1 emits a top-level OCI index whose descriptor
    # points to a second, platform-scoped index even for one architecture.
    # Follow that single-image chain until the actual manifest is reached.
    for _depth in range(8):
        if "config" in manifest and "layers" in manifest:
            break
        manifests = manifest.get("manifests", [])
        if not manifests:
            die(f"{layout} descriptor chain has no image manifest")
        descriptor = manifests[0]
        manifest = read_json(blob_path(layout, descriptor["digest"]))
    else:
        die(f"{layout} descriptor chain is unexpectedly deep")
    config_digest = manifest["config"]["digest"]
    config = read_json(blob_path(layout, config_digest))
    return index, descriptor["digest"], manifest, config_digest, config


def resolve_image(layout: Path) -> tuple[Any, Any, Any]:
    index, _manifest_digest, manifest, _config_digest, config = (
        resolve_image_descriptors(layout)
    )
    return index, manifest, config


def json_lines(value: Any) -> list[str]:
    return json.dumps(value, indent=2, sort_keys=True).splitlines(keepends=True)


def print_diff(label: str, before: Any, after: Any) -> None:
    lines = list(
        difflib.unified_diff(
            json_lines(before),
            json_lines(after),
            fromfile=f"a/{label}",
            tofile=f"b/{label}",
        )
    )
    if lines:
        print("".join(lines[:MAX_DIFF_LINES]), end="")
        if len(lines) > MAX_DIFF_LINES:
            print(f"... {len(lines) - MAX_DIFF_LINES} diff lines omitted")


def dissect_pe_sections(raw: bytes) -> dict[str, dict[str, Any]]:
    """Dissect a PE/COFF binary (UKI or EFI loader) into named section records."""
    if len(raw) < 0x40 or raw[:2] != b"MZ":
        return {}
    pe_offset = struct.unpack_from("<I", raw, 0x3C)[0]
    if pe_offset + 24 > len(raw) or raw[pe_offset : pe_offset + 4] != b"PE\x00\x00":
        return {}
    coff_offset = pe_offset + 4
    _machine, num_sections, timestamp, _sym_ptr, _num_sym, opt_hdr_size, _chars = (
        struct.unpack_from("<HHIIIHH", raw, coff_offset)
    )
    opt_offset = coff_offset + 20
    sec_table_offset = opt_offset + opt_hdr_size
    if sec_table_offset + num_sections * 40 > len(raw):
        return {}

    sections: dict[str, dict[str, Any]] = {
        "__pe_header__": {
            "coff_timestamp": timestamp,
            "num_sections": num_sections,
        }
    }

    # Check Optional Header Data Directory entry 4 (IMAGE_DIRECTORY_ENTRY_SECURITY)
    if opt_hdr_size >= 144 and opt_offset + 2 <= len(raw):
        magic = struct.unpack_from("<H", raw, opt_offset)[0]
        dd_offset = opt_offset + (112 if magic == 0x20B else 96)
        if dd_offset + 5 * 8 <= sec_table_offset:
            cert_file_offset, cert_size = struct.unpack_from("<II", raw, dd_offset + 4 * 8)
            if cert_file_offset > 0 and cert_size > 0 and cert_file_offset + cert_size <= len(raw):
                cert_blob = raw[cert_file_offset : cert_file_offset + cert_size]
                sections["__authenticode__"] = {
                    "file_offset": cert_file_offset,
                    "size": cert_size,
                    "sha256": hashlib.sha256(cert_blob).hexdigest(),
                }

    for idx in range(num_sections):
        entry_off = sec_table_offset + idx * 40
        raw_name = raw[entry_off : entry_off + 8].rstrip(b"\x00")
        name = raw_name.decode("ascii", errors="replace")
        vsize, vaddr, raw_size, raw_ptr = struct.unpack_from("<IIII", raw, entry_off + 8)
        payload_len = min(vsize, raw_size) if vsize > 0 else raw_size
        payload = raw[raw_ptr : raw_ptr + payload_len] if raw_ptr + payload_len <= len(raw) else b""
        sec_info: dict[str, Any] = {
            "virtual_address": vaddr,
            "virtual_size": vsize,
            "raw_size": raw_size,
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
        if name in TEXT_PE_SECTIONS:
            sec_info["text"] = payload.rstrip(b"\x00").decode("utf-8", errors="replace")
        sections[name] = sec_info
    return sections


def extract_pe_section_bytes(raw: bytes, target_name: str) -> bytes:
    """Return the unpadded payload bytes of a named PE section."""
    if len(raw) < 0x40 or raw[:2] != b"MZ":
        return b""
    pe_offset = struct.unpack_from("<I", raw, 0x3C)[0]
    if pe_offset + 24 > len(raw) or raw[pe_offset : pe_offset + 4] != b"PE\x00\x00":
        return b""
    coff_offset = pe_offset + 4
    _machine, num_sections, _ts, _sp, _ns, opt_hdr_size, _ch = struct.unpack_from(
        "<HHIIIHH", raw, coff_offset
    )
    sec_table_offset = coff_offset + 20 + opt_hdr_size
    for idx in range(num_sections):
        entry_off = sec_table_offset + idx * 40
        if entry_off + 40 > len(raw):
            break
        name = raw[entry_off : entry_off + 8].rstrip(b"\x00").decode("ascii", errors="replace")
        if name == target_name:
            vsize, _vaddr, raw_size, raw_ptr = struct.unpack_from("<IIII", raw, entry_off + 8)
            payload_len = min(vsize, raw_size) if vsize > 0 else raw_size
            return raw[raw_ptr : raw_ptr + payload_len] if raw_ptr + payload_len <= len(raw) else b""
    return b""


def _parse_newc_cpio(buf: bytes, segment_index: int) -> tuple[list[dict[str, Any]], int]:
    """Parse one uncompressed SVR4 newc/crc (070701/070702) cpio archive from buf."""
    records: list[dict[str, Any]] = []
    pos = 0
    n = len(buf)
    while pos + 110 <= n:
        magic = buf[pos : pos + 6]
        if magic not in (b"070701", b"070702"):
            break
        try:
            mode = int(buf[pos + 14 : pos + 22], 16)
            uid = int(buf[pos + 22 : pos + 30], 16)
            gid = int(buf[pos + 30 : pos + 38], 16)
            nlink = int(buf[pos + 38 : pos + 46], 16)
            mtime = int(buf[pos + 46 : pos + 54], 16)
            filesize = int(buf[pos + 54 : pos + 62], 16)
            namesize = int(buf[pos + 94 : pos + 102], 16)
        except ValueError:
            break
        name_start = pos + 110
        name_end = name_start + namesize
        if name_end > n:
            break
        name = buf[name_start : name_end - 1].decode("utf-8", errors="replace")
        data_start = (name_end + 3) & ~3
        data_end = data_start + filesize
        if data_end > n:
            break
        payload = buf[data_start:data_end]
        pos = (data_end + 3) & ~3
        if name == "TRAILER!!!":
            while pos < n and buf[pos : pos + 1] == b"\x00":
                pos += 1
            break
        records.append(
            {
                "segment": segment_index,
                "name": name,
                "mode": f"{mode:06o}",
                "uid": uid,
                "gid": gid,
                "nlink": nlink,
                "mtime": mtime,
                "size": filesize,
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
    return records, pos


def dissect_cpio_segments(raw: bytes) -> list[dict[str, Any]]:
    """Dissect concatenated uncompressed or compressed (gzip/xz/zstd) cpio segments."""
    all_records: list[dict[str, Any]] = []
    pos = 0
    seg = 0
    n = len(raw)
    while pos < n:
        while pos < n and raw[pos : pos + 1] == b"\x00":
            pos += 1
        if pos >= n:
            break
        rem = raw[pos:]
        if rem[:6] in (b"070701", b"070702"):
            recs, consumed = _parse_newc_cpio(rem, seg)
            if consumed == 0:
                break
            all_records.extend(recs)
            pos += consumed
            seg += 1
            continue
        # Decompress trailing/current compressed segment
        decompressed: bytes | None = None
        if rem[:2] == b"\x1f\x8b":
            try:
                decompressed = gzip.decompress(rem)
            except OSError:
                decompressed = None
        elif rem[:6] == b"\xfd7zXZ\x00":
            try:
                decompressed = lzma.decompress(rem)
            except lzma.LZMAError:
                decompressed = None
        elif rem[:4] == b"(\xb5/\xfd":
            try:
                proc = subprocess.run(
                    ["zstd", "-dc"],
                    input=rem,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    check=False,
                )
                if proc.returncode == 0 and proc.stdout:
                    decompressed = proc.stdout
            except FileNotFoundError:
                decompressed = None
        if decompressed:
            recs, _ = _parse_newc_cpio(decompressed, seg)
            all_records.extend(recs)
        break
    return all_records


def member_record(archive: tarfile.TarFile, member: tarfile.TarInfo) -> str:
    record: dict[str, Any] = {
        "name": member.name,
        "type": member.type.decode("ascii", errors="backslashreplace"),
        "mode": member.mode,
        "uid": member.uid,
        "gid": member.gid,
        "size": member.size,
        "mtime": member.mtime,
        "linkname": member.linkname,
        "uname": member.uname,
        "gname": member.gname,
        "pax_headers": member.pax_headers,
    }
    if member.isfile():
        extracted = archive.extractfile(member)
        if extracted is None:
            die(f"cannot read regular file {member.name!r}")
        digest = hashlib.sha256()
        for chunk in iter(lambda: extracted.read(1024 * 1024), b""):
            digest.update(chunk)
        record["content_sha256"] = digest.hexdigest()
    return json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n"


def layer_records_with_blobs(path: Path) -> tuple[list[str], dict[str, bytes]]:
    records: list[str] = []
    special_blobs: dict[str, bytes] = {}
    with tarfile.open(path, mode="r:*") as archive:
        for member in archive:
            records.append(member_record(archive, member))
            if member.isfile() and (
                member.name.endswith((".efi", ".efi.signed", "initramfs.img", ".cpio", ".cpio.zst"))
            ):
                fobj = archive.extractfile(member)
                if fobj is not None:
                    special_blobs[member.name] = fobj.read()
    return records, special_blobs


def layer_records(path: Path) -> list[str]:
    records, _ = layer_records_with_blobs(path)
    return records


def print_pe_and_cpio_diffs(
    index: int, a_blobs: dict[str, bytes], b_blobs: dict[str, bytes]
) -> None:
    common = sorted(set(a_blobs.keys()) & set(b_blobs.keys()))
    for name in common:
        a_raw = a_blobs[name]
        b_raw = b_blobs[name]
        if a_raw == b_raw:
            continue
        if name.endswith((".efi", ".efi.signed")):
            a_pe = dissect_pe_sections(a_raw)
            b_pe = dissect_pe_sections(b_raw)
            if a_pe or b_pe:
                print(f"=== layer[{index}] PE section diff: {name} ===")
                print_diff(f"{name}#pe", a_pe, b_pe)
                if a_pe.get(".initrd") != b_pe.get(".initrd"):
                    a_initrd = dissect_cpio_segments(extract_pe_section_bytes(a_raw, ".initrd"))
                    b_initrd = dissect_cpio_segments(extract_pe_section_bytes(b_raw, ".initrd"))
                    if a_initrd or b_initrd:
                        print(f"=== layer[{index}] UKI .initrd cpio diff: {name} ===")
                        print_diff(f"{name}#.initrd", a_initrd, b_initrd)
        elif name.endswith(("initramfs.img", ".cpio", ".cpio.zst")):
            a_cpio = dissect_cpio_segments(a_raw)
            b_cpio = dissect_cpio_segments(b_raw)
            if a_cpio or b_cpio:
                print(f"=== layer[{index}] initrd cpio diff: {name} ===")
                print_diff(f"{name}#cpio", a_cpio, b_cpio)


def print_layer_diff(index: int, a_path: Path, b_path: Path) -> None:
    try:
        a_records, a_blobs = layer_records_with_blobs(a_path)
        b_records, b_blobs = layer_records_with_blobs(b_path)
    except (OSError, tarfile.TarError) as error:
        print(f"layer[{index}]: cannot inspect tar members: {error}")
        return

    if a_records == b_records:
        print(
            f"layer[{index}]: file records match; difference is in compression "
            "or tar encoding"
        )
        return
    if sorted(a_records) == sorted(b_records):
        print(f"layer[{index}]: file records match after sorting; tar member order differs")
        return

    lines = list(
        difflib.unified_diff(
            sorted(a_records),
            sorted(b_records),
            fromfile=f"a/layer[{index}]",
            tofile=f"b/layer[{index}]",
            n=2,
        )
    )
    print("".join(lines[:MAX_DIFF_LINES]), end="")
    if len(lines) > MAX_DIFF_LINES:
        print(f"... {len(lines) - MAX_DIFF_LINES} layer diff lines omitted")
    print_pe_and_cpio_diffs(index, a_blobs, b_blobs)


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--resolve":
        _, manifest_digest, _, config_digest, _ = resolve_image_descriptors(
            Path(sys.argv[2])
        )
        print(f"{manifest_digest}\t{config_digest}")
        return 0
    if len(sys.argv) != 3:
        die(
            f"usage: {Path(sys.argv[0]).name} A_LAYOUT B_LAYOUT | "
            f"--resolve LAYOUT"
        )
    a_layout, b_layout = map(Path, sys.argv[1:])
    a_index, a_manifest, a_config = resolve_image(a_layout)
    b_index, b_manifest, b_config = resolve_image(b_layout)

    print("=== OCI index diff ===")
    print_diff("index.json", a_index, b_index)
    print("=== OCI manifest diff ===")
    print_diff("manifest.json", a_manifest, b_manifest)
    print("=== OCI config diff ===")
    print_diff("config.json", a_config, b_config)

    print("=== Differing layer contents ===")
    for index, pair in enumerate(
        zip_longest(a_manifest.get("layers", []), b_manifest.get("layers", []))
    ):
        a_layer, b_layer = pair
        if a_layer == b_layer:
            continue
        if a_layer is None or b_layer is None:
            print(f"layer[{index}]: present in only one image")
            continue
        print(
            f"layer[{index}]: "
            f"a={a_layer['digest']} ({a_layer.get('size', '?')} bytes) "
            f"b={b_layer['digest']} ({b_layer.get('size', '?')} bytes)"
        )
        print_layer_diff(
            index,
            blob_path(a_layout, a_layer["digest"]),
            blob_path(b_layout, b_layer["digest"]),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
