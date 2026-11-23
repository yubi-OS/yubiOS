#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# tests/vm/test-x86_64-setup-mode-e2e-ci.sh
#
# End-to-end verification of the x86_64 UEFI Setup-Mode (SetupMode=1) flash,
# U2F/HSM PIV slot 9a Secure Boot key enrollment (PK, KEK, db), PE32+ x86_64
# bootloader & Type2 UKI signing (BOOTX64.EFI, systemd-bootx64.efi,
# bootc_composefs-<digest>.efi), local composefs OCI repository commit (ADR-034),
# and negative tamper rejection.
#
# Exit codes: 0 = pass, 77 = explicit loud SKIP, 1 = failure.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SELF_TEST_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test)
      SELF_TEST_ONLY=1
      shift
      ;;
    --repo-root)
      REPO_ROOT="$(cd -- "$2" && pwd)"
      shift 2
      ;;
    *)
      printf 'FAIL: unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

log()  { printf '\n=== %s ===\n' "$*"; }
die()  { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }

need bash
need openssl
need python3

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log "Leg 1: x86_64 PE32+ (0x8664) EFI binary synthesis, PIV slot 9a signing & negative tamper rejection"
python3 - "$WORK" <<'PY'
import struct
import subprocess
import sys
from pathlib import Path

work = Path(sys.argv[1])
keys = work / "keys"
keys.mkdir(parents=True, exist_ok=True)

def build_minimal_pe32plus_x86_64(payload_tag: bytes) -> bytes:
    """Constructs a structurally valid PE32+ (AMD64 0x8664, EFI application subsystem=10) binary."""
    dos_hdr = bytearray(64)
    dos_hdr[0:2] = b"MZ"
    struct.pack_into("<I", dos_hdr, 60, 64)  # e_lfanew = 64

    pe_sig = b"PE\x00\x00"
    coff_hdr = struct.pack("<HHIIIHH", 0x8664, 1, 1700000000, 0, 0, 240, 0x0202)

    opt_hdr = bytearray(240)
    struct.pack_into("<HBBIIIIIQIIHHHHHHIIIIHHQQQQII", opt_hdr, 0,
        0x020B, 1, 0, 512, 0, 0, 0x1000, 0x1000,
        0x100000, 0x1000, 0x200, 0, 0, 0, 0, 0, 0,
        0, 0x2000, 0x200, 0, 10, 0,
        0x10000, 0x1000, 0x10000, 0x1000, 0, 16
    )

    sec_hdr = bytearray(40)
    sec_hdr[0:8] = b".text\x00\x00\x00"
    struct.pack_into("<IIIIIIHHI", sec_hdr, 8, 512, 0x1000, 512, 0x200, 0, 0, 0, 0, 0x60000020)

    headers = bytes(dos_hdr) + pe_sig + coff_hdr + bytes(opt_hdr) + bytes(sec_hdr)
    assert len(headers) <= 512
    headers_padded = headers.ljust(512, b"\x00")
    text_sec = (b"\x48\x31\xc0\xc3" + payload_tag).ljust(512, b"\x00")
    return headers_padded + text_sec

efi_bootx64 = work / "BOOTX64.EFI"
efi_sdboot  = work / "systemd-bootx64.efi"
efi_uki     = work / "bootc_composefs-x86_64.efi"

efi_bootx64.write_bytes(build_minimal_pe32plus_x86_64(b"YUBIOS_BOOTX64_EFI_V1"))
efi_sdboot.write_bytes(build_minimal_pe32plus_x86_64(b"YUBIOS_SYSTEMD_BOOTX64_V1"))
efi_uki.write_bytes(build_minimal_pe32plus_x86_64(b"YUBIOS_TYPE2_UKI_X86_64_V1"))

for p in (efi_bootx64, efi_sdboot, efi_uki):
    raw = p.read_bytes()
    pe_off = struct.unpack_from("<I", raw, 60)[0]
    assert raw[pe_off:pe_off+4] == b"PE\x00\x00"
    machine, = struct.unpack_from("<H", raw, pe_off + 4)
    assert machine == 0x8664, f"Expected IMAGE_FILE_MACHINE_AMD64 (0x8664), got {hex(machine)}"

for name in ("PK", "KEK", "db", "attacker"):
    key_f = keys / f"{name}.key"
    pub_f = keys / f"{name}.pub.pem"
    crt_f = keys / f"{name}.crt"
    cnf_f = keys / f"{name}.cnf"
    cnf_f.write_text(f"[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=YUBIOS x86_64 {name}\n", encoding="utf-8")
    subprocess.run(["openssl", "genrsa", "-out", str(key_f), "2048"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["openssl", "rsa", "-in", str(key_f), "-pubout", "-out", str(pub_f)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["openssl", "req", "-new", "-x509", "-config", str(cnf_f), "-key", str(key_f), "-out", str(crt_f), "-days", "365", "-sha256"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

pub = keys / "db.pub.pem"
for p in (efi_bootx64, efi_sdboot, efi_uki):
    sig = p.with_suffix(".efi.sig")
    subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(keys / "db.key"), "-out", str(sig), str(p)], check=True)
    r_ok = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(pub), "-signature", str(sig), str(p)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert r_ok.returncode == 0, f"Owner signature on {p.name} must verify"

    atk_sig = p.with_suffix(".atk.sig")
    subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(keys / "attacker.key"), "-out", str(atk_sig), str(p)], check=True)
    r_atk = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(pub), "-signature", str(atk_sig), str(p)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert r_atk.returncode != 0, f"Attacker signature on {p.name} must be rejected"

    tampered = p.with_suffix(".tampered.efi")
    b = bytearray(p.read_bytes())
    b[600] ^= 0x55
    tampered.write_bytes(bytes(b))
    r_tamp = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(pub), "-signature", str(sig), str(tampered)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert r_tamp.returncode != 0, f"Tampered PE32+ image {p.name} must be rejected"

print("PASS [Leg 1]: x86_64 PE32+ (0x8664) BOOTX64.EFI, systemd-bootx64.efi & Type2 UKI signing + negative tamper checks verified")
PY

log "Leg 2: Exercising usr/lib/yubiOS/enroll-sb.sh & uki-sync-and-sign.sh on x86_64 SetupMode=1 ESP"
SB_SH="${REPO_ROOT}/usr/lib/yubiOS/enroll-sb.sh"
UKI_SYNC_SH="${REPO_ROOT}/usr/lib/yubiOS/uki/uki-sync-and-sign.sh"
LIB_SH="${REPO_ROOT}/usr/lib/yubiOS/lib.sh"
[[ -x "$SB_SH" ]] || chmod +x "$SB_SH"
[[ -x "$UKI_SYNC_SH" ]] || chmod +x "$UKI_SYNC_SH"

W_SIM="${WORK}/sim"
mkdir -p "$W_SIM/bin" "$W_SIM/state" "$W_SIM/efivars" "$W_SIM/keys" \
         "$W_SIM/esp/EFI/BOOT" "$W_SIM/esp/EFI/systemd" "$W_SIM/esp/EFI/Linux/bootc" \
         "$W_SIM/oci" "$W_SIM/modules/7.3.4-300.fc45.x86_64"
touch "$W_SIM/libykcs11.so"

CFS_DIGEST="a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
cp -f "$WORK/BOOTX64.EFI" "$W_SIM/esp/EFI/BOOT/BOOTX64.EFI"
cp -f "$WORK/systemd-bootx64.efi" "$W_SIM/esp/EFI/systemd/systemd-bootx64.efi"
cp -f "$WORK/bootc_composefs-x86_64.efi" "$W_SIM/esp/EFI/Linux/bootc/bootc_composefs-${CFS_DIGEST}.efi"

SETUPMODE_FILE="$W_SIM/efivars/SetupMode-8be4df61-93ca-11d2-aa0d-00e098032b8c"
SECUREBOOT_FILE="$W_SIM/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c"
printf '\007\000\000\000\001' > "$SETUPMODE_FILE"
printf '\006\000\000\000\000' > "$SECUREBOOT_FILE"
STUB_LOG="$W_SIM/calls.log"
: > "$STUB_LOG"

cat <<'EOF_YK' > "$W_SIM/bin/ykman"
#!/usr/bin/env bash
echo "ykman $*" >> "$STUB_LOG"
if [ "$1 $2 $3 $4" = "piv keys export 9a" ]; then
  cp -f "$WORK_KEYS/db.pub.pem" "$5"
  exit 0
fi
exit 0
EOF_YK

cat <<'EOF_OSSL' > "$W_SIM/bin/openssl"
#!/usr/bin/env bash
echo "openssl $*" >> "$STUB_LOG"
if [ "$1" = "pkey" ]; then
  echo "Public-Key: (2048 bit)"
  exit 0
fi
out=""; prev=""
for a in "$@"; do [ "$prev" = "-out" ] && out="$a"; prev="$a"; done
if [ -n "$out" ]; then
  cp -f "$WORK_KEYS/db.crt" "$out"
fi
exit 0
EOF_OSSL

cat <<'EOF_C2E' > "$W_SIM/bin/cert-to-efi-sig-list"
#!/usr/bin/env bash
echo "cert-to-efi-sig-list $*" >> "$STUB_LOG"
echo "ESL_PAYLOAD" > "${!#}"
EOF_C2E

cat <<'EOF_S2E' > "$W_SIM/bin/sign-efi-sig-list"
#!/usr/bin/env bash
echo "sign-efi-sig-list $*" >> "$STUB_LOG"
echo "AUTH_PAYLOAD" > "${!#}"
EOF_S2E

cat <<'EOF_UPD' > "$W_SIM/bin/efi-updatevar"
#!/usr/bin/env bash
echo "efi-updatevar $*" >> "$STUB_LOG"
if [ "${!#}" = "PK" ]; then
  printf '\007\000\000\000\000' > "$SETUPMODE_FILE"
  printf '\006\000\000\000\001' > "$SECUREBOOT_FILE"
fi
exit 0
EOF_UPD

cat <<'EOF_RD' > "$W_SIM/bin/efi-readvar"
#!/usr/bin/env bash
echo "efi-readvar $*" >> "$STUB_LOG"
echo "Variable $2: enrolled"
EOF_RD

cat <<'EOF_SBS' > "$W_SIM/bin/systemd-sbsign"
#!/usr/bin/env bash
echo "systemd-sbsign $*" >> "$STUB_LOG"
out=""; prev=""
for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done
{ cat "${!#}"; printf 'SIGNED_X86_64_SLOT9A'; } > "$out"
EOF_SBS

cat <<'EOF_SBV' > "$W_SIM/bin/sbverify"
#!/usr/bin/env bash
echo "sbverify $*" >> "$STUB_LOG"
grep -q "SIGNED_X86_64_SLOT9A" "${!#}"
EOF_SBV

cat <<'EOF_UNAME' > "$W_SIM/bin/uname"
#!/usr/bin/env bash
if [ "${1:-}" = "-m" ]; then echo "x86_64"; elif [ "${1:-}" = "-r" ]; then echo "7.3.4-300.fc45.x86_64"; else /usr/bin/uname "$@"; fi
EOF_UNAME

chmod +x "$W_SIM/bin/"*

WORK_KEYS="$WORK/keys" \
STUB_LOG="$STUB_LOG" \
SETUPMODE_FILE="$SETUPMODE_FILE" \
SECUREBOOT_FILE="$SECUREBOOT_FILE" \
YUBIOS_LIB_SH="$LIB_SH" \
YUBIOS_SB_KEYDIR="$W_SIM/keys" \
YUBIOS_SB_ENROLLED_MARK="$W_SIM/state/.sb-enrolled" \
YUBIOS_EFIVARS="$W_SIM/efivars" \
YUBIOS_ESP="$W_SIM/esp" \
YUBIOS_OCI_DIR="$W_SIM/oci" \
YUBIOS_MODULES_DIR="$W_SIM/modules" \
YUBIOS_PKCS11_LIB="$W_SIM/libykcs11.so" \
YUBIOS_UKI_SYNC_SH="$UKI_SYNC_SH" \
PATH="$W_SIM/bin:$PATH" \
  bash "$SB_SH" all

[[ -f "$W_SIM/state/.sb-enrolled" ]] || die "enroll-sb.sh did not create .sb-enrolled mark"
[[ "$(od -An -t u1 -j4 -N1 "$SETUPMODE_FILE" | tr -d ' ')" == "0" ]] || die "SetupMode did not transition to 0"
grep -q "SIGNED_X86_64_SLOT9A" "$W_SIM/esp/EFI/BOOT/BOOTX64.EFI" || die "BOOTX64.EFI was not signed"
grep -q "SIGNED_X86_64_SLOT9A" "$W_SIM/esp/EFI/systemd/systemd-bootx64.efi" || die "systemd-bootx64.efi was not signed"
grep -q "SIGNED_X86_64_SLOT9A" "$W_SIM/esp/EFI/Linux/bootc/bootc_composefs-${CFS_DIGEST}.efi" || die "x86_64 UKI was not signed"
[[ -f "$W_SIM/oci/last-deployed.json" ]] || die "local composefs OCI repository was not committed"
grep -q '"architecture":"amd64"' "$W_SIM/oci/index.json" || die "local OCI index.json did not record architecture=amd64"
echo "PASS [Leg 2]: enroll-sb.sh all + uki-sync-and-sign.sh verified on x86_64 SetupMode=1 ESP (BOOTX64.EFI, systemd-bootx64.efi, Type2 UKI, amd64 local OCI)"

log "Leg 3: Exercising scripts/flash-device-e2e.sh UAPI DPS root GUIDs, pre-wipe arch guards, and ESP PE32+ loader verification"
FLASH_SH="${REPO_ROOT}/scripts/flash-device-e2e.sh"
FLASH_WF="${REPO_ROOT}/.github/workflows/ci_flash-device-e2e.yml"
[[ -x "$FLASH_SH" ]] || chmod +x "$FLASH_SH"
bash -n "$FLASH_SH" || die "bash -n failed on $FLASH_SH"
grep -q "x86_64-uefi" "$FLASH_WF" || die "x86_64-uefi choice missing in $FLASH_WF"
grep -q '"X64"' "$FLASH_WF" || die "ci_flash-device-e2e.yml does not select X64 runner for x86_64-uefi"

# 3a. Verify x86_64-uefi board resolution and UAPI DPS x86_64 root partition GUID (4f68bce3-e8cd-4db1-96e7-fbcaf984b709)
X86_CFG="$(bash "$FLASH_SH" --print-board-config x86_64-uefi)"
grep -Fxq "TARGET_OCI_ARCH=amd64" <<<"$X86_CFG" || die "x86_64-uefi TARGET_OCI_ARCH != amd64"
grep -Fxq "TARGET_UNAME_M=x86_64" <<<"$X86_CFG" || die "x86_64-uefi TARGET_UNAME_M != x86_64"
grep -Fxq "DPS_ROOT_PART_UUID=4f68bce3-e8cd-4db1-96e7-fbcaf984b709" <<<"$X86_CFG" || die "x86_64-uefi missing UAPI DPS x86_64 root GUID"
grep -Fxq "EXPECTED_EFI_BOOT_LOADER=EFI/BOOT/BOOTX64.EFI" <<<"$X86_CFG" || die "x86_64-uefi missing BOOTX64.EFI requirement"
grep -Fxq "EXPECTED_PE_MACHINE_HEX=0x8664" <<<"$X86_CFG" || die "x86_64-uefi missing 0x8664 PE machine"

X86_SFDISK="$(bash "$FLASH_SH" --print-sfdisk-layout x86_64-uefi)"
grep -Fq "type=4f68bce3-e8cd-4db1-96e7-fbcaf984b709" <<<"$X86_SFDISK" || die "x86_64-uefi sfdisk layout did not emit x86_64 DPS root GUID"

# 3b. Verify ARM64 board resolution and UAPI DPS ARM64 root partition GUID (b921b045-1df0-41c3-af44-4c6f280d3fae)
ARM_CFG="$(bash "$FLASH_SH" --print-board-config rock5b-rk3588)"
grep -Fxq "TARGET_OCI_ARCH=arm64" <<<"$ARM_CFG" || die "rock5b-rk3588 TARGET_OCI_ARCH != arm64"
grep -Fxq "DPS_ROOT_PART_UUID=b921b045-1df0-41c3-af44-4c6f280d3fae" <<<"$ARM_CFG" || die "rock5b-rk3588 missing UAPI DPS ARM64 root GUID"
grep -Fxq "EXPECTED_EFI_BOOT_LOADER=EFI/BOOT/BOOTAA64.EFI" <<<"$ARM_CFG" || die "rock5b-rk3588 missing BOOTAA64.EFI requirement"

# 3c. Positive ESP PE32+ verification against the x86_64 (0x8664) ESP populated in Leg 2
bash "$FLASH_SH" --verify-esp-arch "$W_SIM/esp" x86_64-uefi "$W_SIM/esp/EFI/Linux/bootc/bootc_composefs-${CFS_DIGEST}.efi"

# 3d. Negative check: verifying an x86_64 ESP as rock5b-rk3588 (ARM64) must fail closed
if bash "$FLASH_SH" --verify-esp-arch "$W_SIM/esp" rock5b-rk3588 >/dev/null 2>&1; then
  die "Negative check failed: --verify-esp-arch accepted x86_64 ESP for rock5b-rk3588"
fi

# 3e. Negative check: an ARM64 PE32+ binary (Machine=0xaa64) placed at BOOTX64.EFI must be rejected for x86_64-uefi
ESP_BAD="${WORK}/esp_bad_arch"
mkdir -p "$ESP_BAD/EFI/BOOT" "$ESP_BAD/EFI/systemd"
cp -f "$WORK/systemd-bootx64.efi" "$ESP_BAD/EFI/systemd/systemd-bootx64.efi"
python3 - "$WORK/BOOTX64.EFI" "$ESP_BAD/EFI/BOOT/BOOTX64.EFI" <<'PY'
import struct, sys
from pathlib import Path
raw = bytearray(Path(sys.argv[1]).read_bytes())
pe_off = struct.unpack_from("<I", raw, 60)[0]
struct.pack_into("<H", raw, pe_off + 4, 0xAA64)  # Forge ARM64 machine type inside BOOTX64.EFI
Path(sys.argv[2]).write_bytes(bytes(raw))
PY
if bash "$FLASH_SH" --verify-esp-arch "$ESP_BAD" x86_64-uefi >/dev/null 2>&1; then
  die "Negative check failed: --verify-esp-arch accepted ARM64 (0xaa64) PE header at BOOTX64.EFI"
fi

# 3f. Negative check: running FLASH_BOARD=x86_64-uefi on an aarch64 host must refuse before touching SD_DEVICE
if FLASH_BOARD=x86_64-uefi FLASH_HOST_UNAME_OVERRIDE=aarch64 FLASH_SD_DEVICE=/dev/nonexistent bash "$FLASH_SH" >/dev/null 2>&1; then
  die "Negative check failed: flash-device-e2e.sh did not refuse x86_64-uefi on an aarch64 host"
fi
echo "PASS [Leg 3]: scripts/flash-device-e2e.sh UAPI DPS GUIDs, pre-wipe arch validation & ESP PE32+ machine checks verified"

if [[ "$SELF_TEST_ONLY" -eq 1 ]]; then
  echo "PASS: all 3 x86_64 UEFI Setup-Mode flash, enroll, sign & local-OCI legs verified"
  exit 0
fi

echo "PASS: all 3 x86_64 UEFI Setup-Mode flash, enroll, sign & local-OCI legs verified"
