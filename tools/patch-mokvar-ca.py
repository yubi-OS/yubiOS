#!/usr/bin/python3
# SPDX-License-Identifier: LGPL-2.1-or-later
"""Patch a DER X.509 CA into the "YUBIMOK\\0" slot of a yubios-ima-mokvar .efi.tmpl.

Slot layout (mokvar_drv.c struct yubimok_slot, packed in .data):
    char magic[8] = "YUBIMOK\\0"; u32 ca_der_len (LE); u8 ca_der[2036]
Usage: patch-mokvar-ca.py <template.efi.tmpl> <ca.der> <out.efi>
Must run BEFORE the Authenticode (Secure Boot db) signature is applied.
"""
import struct
import sys

MAGIC = b"YUBIMOK\0"
SLOT_MAX = 2036


def patch(tmpl: bytes, der: bytes) -> bytes:
    if tmpl[:2] != b"MZ":
        raise SystemExit("template is not a PE image")
    if tmpl.count(MAGIC) != 1:
        raise SystemExit(f"expected exactly one {MAGIC!r} slot, found {tmpl.count(MAGIC)}")
    if not (64 <= len(der) <= SLOT_MAX) or der[0] != 0x30:
        raise SystemExit(f"CA must be DER (0x30...) and 64..{SLOT_MAX} bytes, got {len(der)}")
    off = tmpl.index(MAGIC) + len(MAGIC)
    body = struct.pack("<I", len(der)) + der + b"\0" * (SLOT_MAX - len(der))
    out = tmpl[:off] + body + tmpl[off + len(body):]
    assert len(out) == len(tmpl)
    return out


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: patch-mokvar-ca.py <template.efi.tmpl> <ca.der> <out.efi>")
    with open(sys.argv[1], "rb") as f:
        tmpl = f.read()
    with open(sys.argv[2], "rb") as f:
        der = f.read()
    with open(sys.argv[3], "wb") as f:
        f.write(patch(tmpl, der))


if __name__ == "__main__":
    main()
