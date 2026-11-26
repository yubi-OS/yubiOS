#!/usr/bin/env python3
# SPDX-License-Identifier: LGPL-2.1-or-later
"""Emulate EfiMain of a patched yubios-ima-mokvar driver (x64 or aa64) under Unicorn and check the
LINUX_EFI_MOK_VARIABLE_TABLE it installs against a Python port of Linux v7.3
drivers/firmware/efi/mokvar-table.c efi_mokvar_table_init() + load_uefi.c MokListRT parsing.

Usage: test-ima-mokvar-template.py <patched.efi> <ca.der>     (needs: pip install pefile unicorn)
Also checks that the *unpatched* template refuses (EFI_INVALID_PARAMETER, no table) when given
--expect-refuse instead of a CA.
"""
import struct
import sys

import pefile
from unicorn import UC_ARCH_ARM64, UC_ARCH_X86, UC_HOOK_CODE, UC_MODE_64, UC_MODE_ARM, Uc
from unicorn.arm64_const import (UC_ARM64_REG_CPACR_EL1, UC_ARM64_REG_LR, UC_ARM64_REG_SP, UC_ARM64_REG_X0,
                                 UC_ARM64_REG_X1, UC_ARM64_REG_X2, UC_ARM64_REG_X3)
from unicorn.x86_const import (UC_X86_REG_R8, UC_X86_REG_R9, UC_X86_REG_RAX, UC_X86_REG_RCX, UC_X86_REG_RDX,
                               UC_X86_REG_RSP)

MOKVAR_GUID = bytes.fromhex("2bed51c49496d345babaed9f8988a389")  # c451ed2b-9694-45d3-baba-ed9f8988a389
X509_GUID = bytes.fromhex("a159c0a5e494a74a87b5ab155c2bf072")    # a5c059a1-94e4-4aa7-87b5-ab155c2bf072
SHIM_LOCK = bytes.fromhex("50ab5d6046e00043abb63dd810dd8b23")    # 605dab50-e046-4300-abb6-3dd810dd8b23
LOAD, ST, BS, STUB, STACK, HEAP, DONE = 0x400000, 0x10000000, 0x10001000, 0x10002000, 0x20000000, 0x30000000, 0x10010000


def emulate(path):
    pe = pefile.PE(path)
    machine = pe.FILE_HEADER.Machine
    assert pe.OPTIONAL_HEADER.Subsystem == 11, "not an EFI boot service driver"
    x64 = machine == 0x8664
    pe.relocate_image(LOAD)  # load away from ImageBase; image must not need runtime relocation
    mu = Uc(UC_ARCH_X86, UC_MODE_64) if x64 else Uc(UC_ARCH_ARM64, UC_MODE_ARM)
    mu.mem_map(LOAD, (pe.OPTIONAL_HEADER.SizeOfImage + 0xFFF) & ~0xFFF)
    mu.mem_write(LOAD, pe.get_memory_mapped_image(ImageBase=LOAD))
    for a, sz in [(ST, 0x4000), (STACK, 0x100000), (HEAP, 0x100000), (DONE, 0x1000)]:
        mu.mem_map(a, sz)
    bs = bytearray(24 + 8 * 22)
    for i in range(22):
        struct.pack_into("<Q", bs, 24 + 8 * i, STUB + 4 * i)
    mu.mem_write(BS, bytes(bs))
    st = bytearray(0x80)
    struct.pack_into("<Q", st, 24 + 8 + 8 + 8 * 7, BS)  # EFI_SYSTEM_TABLE.BootServices
    mu.mem_write(ST, bytes(st))
    mu.mem_write(STUB, (b"\xc3\x90\x90\x90" if x64 else b"\xc0\x03\x5f\xd6") * 22)
    regs = (UC_X86_REG_RCX, UC_X86_REG_RDX, UC_X86_REG_R8, UC_X86_REG_R9) if x64 else \
        (UC_ARM64_REG_X0, UC_ARM64_REG_X1, UC_ARM64_REG_X2, UC_ARM64_REG_X3)
    ret = UC_X86_REG_RAX if x64 else UC_ARM64_REG_X0
    state = {}

    def hook(uc, addr, _sz, _ud):
        if (addr - STUB) % 4:
            return
        idx, a = (addr - STUB) // 4, [uc.reg_read(r) for r in regs]
        if idx == 2:  # AllocatePages
            state["alloc"] = (a[0], a[1], a[2])
            uc.mem_write(a[3], struct.pack("<Q", HEAP))
        elif idx == 21:  # InstallConfigurationTable
            state["guid"], state["table"] = bytes(uc.mem_read(a[0], 16)), a[1]
        else:
            raise RuntimeError(f"unexpected BootServices slot {idx}")
        uc.reg_write(ret, 0)

    mu.hook_add(UC_HOOK_CODE, hook, begin=STUB, end=STUB + 4 * 22)
    entry = LOAD + pe.OPTIONAL_HEADER.AddressOfEntryPoint
    if x64:
        sp = STACK + 0x80000 - 8
        mu.mem_write(sp, struct.pack("<Q", DONE))
        mu.reg_write(UC_X86_REG_RSP, sp)
        mu.reg_write(UC_X86_REG_RCX, 0x1234)
        mu.reg_write(UC_X86_REG_RDX, ST)
    else:
        mu.reg_write(UC_ARM64_REG_CPACR_EL1, 3 << 20)
        mu.reg_write(UC_ARM64_REG_SP, STACK + 0x80000)
        mu.reg_write(UC_ARM64_REG_LR, DONE)
        mu.reg_write(UC_ARM64_REG_X0, 0x1234)
        mu.reg_write(UC_ARM64_REG_X1, ST)
    mu.emu_start(entry, DONE, count=20_000_000)
    state["rv"] = mu.reg_read(ret)
    if "table" in state:
        state["bytes"] = bytes(mu.mem_read(state["table"], 0x2000))
    return ("x64" if x64 else "aa64"), state


def efi_mokvar_table_init(tbl):
    """Port of mokvar-table.c L135-184: walk entries until the zero sentinel."""
    off, ents = 0, {}
    while off + 264 <= len(tbl):
        name, size = tbl[off:off + 256], struct.unpack_from("<Q", tbl, off + 256)[0]
        if name[0] == 0:
            if size != 0:
                raise AssertionError("sentinel with non-zero data_size: table invalid")
            return ents, off + 264
        ents[name.split(b"\0")[0].decode()] = tbl[off + 264:off + 264 + size]
        off += 264 + size
    raise AssertionError("no sentinel: EFI MOKvar config table is not valid")


def main():
    path, arg = sys.argv[1], sys.argv[2]
    arch, s = emulate(path)
    if arg == "--expect-refuse":
        assert s["rv"] == 0x8000000000000002 and "table" not in s, s
        print(f"{arch}: unpatched template refuses (EFI_INVALID_PARAMETER), no table installed: OK")
        return
    ca = open(arg, "rb").read()
    assert s["rv"] == 0, f"EfiMain returned {s['rv']:#x}"
    assert s["alloc"][:2] == (0, 6), f"AllocatePages(type,memtype)={s['alloc']} want (AllocateAnyPages, EfiRuntimeServicesData)"
    assert s["guid"] == MOKVAR_GUID
    ents, size = efi_mokvar_table_init(s["bytes"])
    assert set(ents) == {"MokListRT", "MokListTrustedRT"}, ents.keys()
    assert ents["MokListTrustedRT"] == b"\x01"
    esl = ents["MokListRT"]
    lsize, hsize, ssize = struct.unpack_from("<III", esl, 16)
    assert esl[:16] == X509_GUID and lsize == len(esl) and hsize == 0 and ssize == 16 + len(ca)
    assert esl[28:44] == SHIM_LOCK and esl[44:44 + len(ca)] == ca
    expect = (b"MokListRT".ljust(256, b"\0") + struct.pack("<Q", len(esl)) + esl +
              b"MokListTrustedRT".ljust(256, b"\0") + struct.pack("<Q", 1) + b"\x01" + b"\0" * 264)
    assert s["bytes"][:size] == expect, "table is not byte-exact"
    print(f"{arch}: EfiMain=EFI_SUCCESS AllocatePages(AnyPages,RuntimeServicesData,{s['alloc'][2]}) "
          f"GUID ok; table {size} B byte-exact; MokListRT ESL {len(esl)} B (CA {len(ca)} B); MokListTrustedRT=01: OK")


if __name__ == "__main__":
    main()
