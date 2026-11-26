#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# Rebuild usr/lib/yubiOS/ima/yubios-ima-mokvar-{x64,aa64}.efi.tmpl from mokvar_drv.c.
# Toolchain: zig (clang + lld-link), e.g. `pip install ziglang` then ZIG="python3 -m ziglang".
# Output: PE32+ EFI Boot Service Driver (Subsystem 11) with the "YUBIMOK\0" CA slot in .data.
# -fno-builtin -fno-compiler-rt: keep the byte loops as loops (no memset/memcpy calls), so no
# compiler-rt is linked; that keeps the x64 template at ~4 KiB instead of ~50 KiB.
set -euo pipefail
cd "$(dirname "$0")/.."
ZIG="${ZIG:-zig}"
SRC=usr/lib/yubiOS/ima/mokvar_drv.c
export ZIG_GLOBAL_CACHE_DIR="${ZIG_GLOBAL_CACHE_DIR:-$(mktemp -d)}" ZIG_LOCAL_CACHE_DIR="${ZIG_LOCAL_CACHE_DIR:-$(mktemp -d)}"
for pair in x86_64:x64 aarch64:aa64; do
  arch="${pair%%:*}" suf="${pair##*:}"
  out="usr/lib/yubiOS/ima/yubios-ima-mokvar-${suf}.efi.tmpl"
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2086
  $ZIG build-exe "$SRC" -target "${arch}-uefi" -O ReleaseSmall -fstrip -fno-unwind-tables \
    -fno-stack-check -fno-stack-protector -fno-builtin -fno-compiler-rt \
    --subsystem efi_boot_service_driver \
    --name mokvar -femit-bin="$tmp/mokvar.efi"
  cp -f "$tmp/mokvar.efi" "$out"
  rm -rf "$tmp"
  [ "$(grep -c -a 'YUBIMOK' "$out")" -eq 1 ] || { echo "YUBIMOK slot missing/duplicated in $out" >&2; exit 1; }
  echo "built $out ($(wc -c < "$out") bytes)"
done
