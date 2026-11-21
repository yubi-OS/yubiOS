#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# scripts/lib/stage-firmware-pkcs11-keys.sh
#
# Stages the ARM64 firmware signing key hierarchy (OP-TEE TA_PUBLIC_KEY /
# TA_SIGN_KEY and TF-A ROT_KEY / CoT keys + 256-bit ROTPK SHA-256 fuse digest)
# using PIV slot 9a:
#   1. If a physical U2F/HSM (USB VID 1050) is attached, uses hardware PIV
#      slot 9a via libykcs11.so + OpenSSL PKCS#11 provider/engine.
#   2. If no physical U2F/HSM is attached, uses the swu2f (/dev/uhid passless)
#      + SoftHSM2 PKCS#11 slot 9a (id=%01, token yubiOS-ci) fallback, seeded
#      deterministically from GITHUB_SHA + SOURCE_DATE_EPOCH so isolated
#      two-build firmware reproducibility checks (arm64 vs arm64-repro) match
#      byte-for-byte.

set -euo pipefail

OUT_DIR="${1:-$PWD/fw-keys}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd -P)"

EPOCH="${SOURCE_DATE_EPOCH:-1700000000}"
case "$EPOCH" in
  ''|*[!0-9]*) EPOCH=1700000000 ;;
esac
[ "$EPOCH" -gt 0 ] || EPOCH=1700000000

SEED_MATERIAL="${GITHUB_SHA:-yubios-firmware-default}:${YUBIOS_MKOSI_SEED:-}:${EPOCH}"
PIV_PIN="${YUBIOS_PIV_PIN:-123456}"
PIV_MGM_KEY="010203040506070801020304050607080102030405060708"
CN_PREFIX="${YUBIOS_CN_PREFIX:-YUBIOS}"
DAYS=1826

has_physical_u2f_hsm() {
  local d
  for d in /sys/bus/usb/devices/*/idVendor; do
    [ -r "$d" ] || continue
    if [ "$(cat "$d" 2>/dev/null || true)" = "1050" ]; then
      return 0
    fi
  done
  if command -v lsusb >/dev/null 2>&1 && lsusb 2>/dev/null | grep -qi '1050:'; then
    return 0
  fi
  if command -v ykman >/dev/null 2>&1 && ykman list 2>/dev/null | grep -qi 'U2F/HSM\|YubiKey\|fido\|piv'; then
    return 0
  fi
  return 1
}

find_ykcs11() {
  local cand
  for cand in \
    /usr/lib/aarch64-linux-gnu/libykcs11.so \
    /usr/lib/aarch64-linux-gnu/libykcs11.so.2 \
    /usr/lib/x86_64-linux-gnu/libykcs11.so \
    /usr/lib/x86_64-linux-gnu/libykcs11.so.2 \
    /usr/lib64/libykcs11.so \
    /usr/lib64/libykcs11.so.2; do
    if [ -e "$cand" ]; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  return 1
}

find_softhsm2() {
  local cand
  for cand in \
    /usr/lib/aarch64-linux-gnu/softhsm/libsofthsm2.so \
    /usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so \
    /usr/lib64/pkcs11/libsofthsm2.so \
    /usr/lib64/libsofthsm2.so \
    /usr/lib/softhsm/libsofthsm2.so; do
    if [ -e "$cand" ]; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  return 1
}

find_pkcs11_ossl_module() {
  local cand
  for cand in \
    /usr/lib/aarch64-linux-gnu/ossl-modules/pkcs11.so \
    /usr/lib/aarch64-linux-gnu/ossl-modules/pkcs11prov.so \
    /usr/lib/x86_64-linux-gnu/ossl-modules/pkcs11.so \
    /usr/lib/x86_64-linux-gnu/ossl-modules/pkcs11prov.so \
    /usr/lib64/ossl-modules/pkcs11.so \
    /usr/lib/ossl-modules/pkcs11.so; do
    if [ -e "$cand" ]; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  return 1
}

find_pkcs11_engine() {
  local cand
  for cand in \
    /usr/lib/aarch64-linux-gnu/engines-3/pkcs11.so \
    /usr/lib/x86_64-linux-gnu/engines-3/pkcs11.so \
    /usr/lib64/engines-3/pkcs11.so \
    /usr/lib/engines-3/pkcs11.so; do
    if [ -e "$cand" ]; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  return 1
}

write_openssl_pkcs11_configs() {
  local pkcs11_lib="$1"
  local ossl_mod=""
  local eng_mod=""
  ossl_mod="$(find_pkcs11_ossl_module || true)"
  eng_mod="$(find_pkcs11_engine || true)"

  if [ -n "$ossl_mod" ]; then
    cat > "$OUT_DIR/openssl-pkcs11-provider.cnf" <<EOF
openssl_conf = openssl_init

[openssl_init]
providers = provider_sect

[provider_sect]
default = default_sect
pkcs11 = pkcs11_sect

[default_sect]
activate = 1

[pkcs11_sect]
module = $ossl_mod
pkcs11-module-path = $pkcs11_lib
pkcs11-module-quirks = no-deinit no-operation-state
activate = 1
EOF
  fi

  if [ -n "$eng_mod" ]; then
    cat > "$OUT_DIR/openssl-pkcs11-engine.cnf" <<EOF
openssl_conf = openssl_init

[openssl_init]
engines = engine_section

[engine_section]
pkcs11 = pkcs11_section

[pkcs11_section]
engine_id = pkcs11
dynamic_path = $eng_mod
MODULE_PATH = $pkcs11_lib
PIN = $PIV_PIN
init = 0
EOF
  fi
}

generate_deterministic_rsa2048() {
  local seed="$1"
  local priv_out="$2"
  local pub_out="$3"
  python3 - "$seed" "$priv_out" "$pub_out" <<'PY'
import hashlib
import sys
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

seed = sys.argv[1].encode("utf-8")
priv_out = sys.argv[2]
pub_out = sys.argv[3]

def stream_bits(label: bytes, bits: int) -> int:
    buf = bytearray()
    ctr = 0
    need = (bits + 7) // 8
    while len(buf) < need:
        buf.extend(hashlib.sha256(seed + b":" + label + b":" + str(ctr).encode()).digest())
        ctr += 1
    val = int.from_bytes(buf[:need], "big")
    val |= (1 << (bits - 1)) | 1
    return val

def is_probable_prime(n: int) -> bool:
    if n < 2 or (n & 1) == 0:
        return False
    small_primes = (3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53)
    for sp in small_primes:
        if n % sp == 0:
            return n == sp
    d = n - 1
    s = 0
    while (d & 1) == 0:
        d >>= 1
        s += 1
    for a in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        x = pow(a, d, n)
        if x == 1 or x == n - 1:
            continue
        for _ in range(s - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True

def derive_prime(label: bytes, bits: int = 1024, e: int = 65537) -> int:
    cand = stream_bits(label, bits)
    while True:
        if (cand - 1) % e != 0 and is_probable_prime(cand):
            return cand
        cand += 2

e = 65537
p = derive_prime(b"prime-p", 1024, e)
q = derive_prime(b"prime-q", 1024, e)
while p == q or abs(p - q) < (1 << 900):
    q = derive_prime(b"prime-q-alt", 1024, e)
if p < q:
    p, q = q, p

n = p * q
d = rsa.rsa_recover_private_exponent(e, p, q)
dmp1 = rsa.rsa_crt_dmp1(d, p)
dmq1 = rsa.rsa_crt_dmq1(d, q)
iqmp = rsa.rsa_crt_iqmp(p, q)

pub_nums = rsa.RSAPublicNumbers(e, n)
priv_nums = rsa.RSAPrivateNumbers(p, q, d, dmp1, dmq1, iqmp, pub_nums)
priv_key = priv_nums.private_key()
pub_key = pub_nums.public_key()

with open(priv_out, "wb") as f:
    f.write(
        priv_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )

with open(pub_out, "wb") as f:
    f.write(
        pub_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
PY
}

stage_via_u2f_hsm() {
  echo "[stage-firmware-pkcs11-keys] Physical U2F/HSM (1050:*) detected; using hardware PIV slot 9a"
  if [ ! -S /run/pcscd/pcscd.comm ]; then
    pcscd 2>/dev/null || true
    sleep 1
  fi
  local pkcs11_lib
  pkcs11_lib="$(find_ykcs11)" || return 1

  if ! ykman piv keys export 9a "$OUT_DIR/slot9a-pub.pem" >/dev/null 2>&1; then
    ykman piv keys generate -m "$PIV_MGM_KEY" --algorithm RSA2048 --pin-policy ONCE --touch-policy NEVER 9a "$OUT_DIR/slot9a-pub.pem" >/dev/null 2>&1 || return 1
  fi
  if ! ykman piv certificates export 9a "$OUT_DIR/slot9a-cert.pem" >/dev/null 2>&1 || [ ! -s "$OUT_DIR/slot9a-cert.pem" ]; then
    ykman piv certificates generate -m "$PIV_MGM_KEY" -P "$PIV_PIN" -s "CN=${CN_PREFIX} Firmware Slot 9a" -d "$DAYS" 9a "$OUT_DIR/slot9a-pub.pem" >/dev/null 2>&1 || return 1
    ykman piv certificates export 9a "$OUT_DIR/slot9a-cert.pem" >/dev/null 2>&1 || return 1
  fi

  write_openssl_pkcs11_configs "$pkcs11_lib"
  printf '%s\n' "u2f_hsm_slot9a" > "$OUT_DIR/key-source.txt"
  printf '%s\n' "$pkcs11_lib" > "$OUT_DIR/pkcs11-lib.txt"
  printf '%s\n' "pkcs11:id=%01;type=private?pin-value=${PIV_PIN}" > "$OUT_DIR/pkcs11-uri.txt"
  cp -f "$OUT_DIR/slot9a-pub.pem" "$OUT_DIR/ta-sign-key.pem"
  return 0
}

stage_via_swu2f() {
  echo "[stage-firmware-pkcs11-keys] No physical U2F/HSM attached; using swu2f + SoftHSM2 PKCS#11 slot 9a fallback"
  local passless_pid=""
  if command -v passless >/dev/null 2>&1 && [ -e /dev/uhid ]; then
    mkdir -p "$OUT_DIR/passless/storage" "$OUT_DIR/passless/config"
    HOME="$OUT_DIR" XDG_DATA_HOME="$OUT_DIR/passless" XDG_CONFIG_HOME="$OUT_DIR/passless/config" \
      PASSLESS_E2E_AUTO_ACCEPT_UV=1 PASSLESS_LOG_STYLE=never \
      passless --backend-type local --local-path "$OUT_DIR/passless/storage" >/dev/null 2>&1 &
    passless_pid=$!
    sleep 1
  fi

  generate_deterministic_rsa2048 "$SEED_MATERIAL" "$OUT_DIR/slot9a.p8" "$OUT_DIR/slot9a-pub.pem"
  cp -f "$OUT_DIR/slot9a.p8" "$OUT_DIR/ta-sign-key.pem"
  chmod 0600 "$OUT_DIR/slot9a.p8" "$OUT_DIR/ta-sign-key.pem"

  local softhsm_lib=""
  softhsm_lib="$(find_softhsm2 || true)"
  if [ -n "$softhsm_lib" ] && command -v softhsm2-util >/dev/null 2>&1; then
    rm -rf "$OUT_DIR/softhsm"
    mkdir -p "$OUT_DIR/softhsm/tokens"
    cat > "$OUT_DIR/softhsm/softhsm2.conf" <<EOF
directories.tokendir = $OUT_DIR/softhsm/tokens
objectstore.backend = file
log.level = ERROR
EOF
    export SOFTHSM2_CONF="$OUT_DIR/softhsm/softhsm2.conf"
    softhsm2-util --init-token --free --label yubiOS-ci --pin "$PIV_PIN" --so-pin "$PIV_PIN" >/dev/null
    softhsm2-util --import "$OUT_DIR/slot9a.p8" --token yubiOS-ci --label "PIV AUTH key" --id 01 --pin "$PIV_PIN" >/dev/null
    write_openssl_pkcs11_configs "$softhsm_lib"
    printf '%s\n' "$softhsm_lib" > "$OUT_DIR/pkcs11-lib.txt"
    printf '%s\n' "pkcs11:token=yubiOS-ci;id=%01;type=private?pin-value=${PIV_PIN}" > "$OUT_DIR/pkcs11-uri.txt"
  else
    printf '%s\n' "none" > "$OUT_DIR/pkcs11-lib.txt"
    printf '%s\n' "$OUT_DIR/ta-sign-key.pem" > "$OUT_DIR/pkcs11-uri.txt"
  fi

  if [ -n "$passless_pid" ]; then
    kill "$passless_pid" 2>/dev/null || true
  fi
  printf '%s\n' "swu2f_softhsm2_slot9a" > "$OUT_DIR/key-source.txt"
  return 0
}

if has_physical_u2f_hsm && stage_via_u2f_hsm; then
  echo "[stage-firmware-pkcs11-keys] Staged firmware signing key via physical U2F/HSM PIV slot 9a"
else
  stage_via_swu2f
  echo "[stage-firmware-pkcs11-keys] Staged firmware signing key via swu2f + SoftHSM2 PKCS#11 fallback"
fi

# Compute the 256-bit SHA-256 ROTPK digest over the DER SubjectPublicKeyInfo of slot9a-pub.pem
openssl pkey -pubin -in "$OUT_DIR/slot9a-pub.pem" -outform DER -out "$OUT_DIR/slot9a-pub.der"
openssl dgst -sha256 -binary "$OUT_DIR/slot9a-pub.der" > "$OUT_DIR/rotpk_sha256.bin"
sha256sum "$OUT_DIR/slot9a-pub.der" | awk '{print $1}' > "$OUT_DIR/rotpk_sha256.hex"

# Create PKCS#11-aware OP-TEE SIGN_ENC wrapper that uses slot9a-pub.pem + PKCS#11 signing
cat > "$OUT_DIR/pkcs11-sign-encrypt.sh" <<'EOF_WRAP'
#!/bin/bash
set -euo pipefail
KEY_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REAL_SIGN_ENC="${YUBIOS_REAL_SIGN_ENC:?YUBIOS_REAL_SIGN_ENC must point to optee_os/scripts/sign_encrypt.py}"
PUB_KEY="$KEY_DIR/slot9a-pub.pem"
PKCS11_URI="$(cat "$KEY_DIR/pkcs11-uri.txt")"
PKCS11_LIB="$(cat "$KEY_DIR/pkcs11-lib.txt")"
if [ -f "$KEY_DIR/softhsm/softhsm2.conf" ]; then
  export SOFTHSM2_CONF="$KEY_DIR/softhsm/softhsm2.conf"
fi

uuid=""
inf=""
outf=""
ta_ver="0"
prev=""
for a in "$@"; do
  case "$prev" in
    --uuid) uuid="$a" ;;
    --in) inf="$a" ;;
    --out) outf="$a" ;;
    --ta-version) ta_ver="$a" ;;
  esac
  prev="$a"
done

if [ -z "$uuid" ] || [ -z "$inf" ] || [ -z "$outf" ]; then
  exec python3 "$REAL_SIGN_ENC" "$@"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
digf="$work/${uuid}.dig"
sigf="$work/${uuid}.sig"
rawf="$work/${uuid}.raw"
sigbin="$work/${uuid}.sig.bin"

python3 "$REAL_SIGN_ENC" digest \
  --key "$PUB_KEY" \
  --algo TEE_ALG_RSASSA_PKCS1_V1_5_SHA256 \
  --uuid "$uuid" \
  --ta-version "$ta_ver" \
  --in "$inf" \
  --dig "$digf"

base64 -d "$digf" > "$rawf"

signed_ok=0
if [ "$PKCS11_LIB" != "none" ] && [ -f "$KEY_DIR/openssl-pkcs11-provider.cnf" ]; then
  if OPENSSL_CONF="$KEY_DIR/openssl-pkcs11-provider.cnf" \
     PKCS11_MODULE_PATH="$PKCS11_LIB" \
     PKCS11_PROVIDER_MODULE="$PKCS11_LIB" \
     openssl pkeyutl -sign \
       -provider pkcs11 -provider default \
       -inkey "$PKCS11_URI" \
       -in "$rawf" -out "$sigbin" \
       -pkeyopt digest:sha256 -pkeyopt rsa_padding_mode:pkcs1 2>/dev/null; then
    signed_ok=1
  fi
fi
if [ "$signed_ok" -eq 0 ] && [ "$PKCS11_LIB" != "none" ] && [ -f "$KEY_DIR/openssl-pkcs11-engine.cnf" ]; then
  if OPENSSL_CONF="$KEY_DIR/openssl-pkcs11-engine.cnf" \
     PKCS11_MODULE_PATH="$PKCS11_LIB" \
     openssl pkeyutl -sign \
       -engine pkcs11 -keyform engine \
       -inkey "$PKCS11_URI" \
       -in "$rawf" -out "$sigbin" \
       -pkeyopt digest:sha256 -pkeyopt rsa_padding_mode:pkcs1 2>/dev/null; then
    signed_ok=1
  fi
fi
if [ "$signed_ok" -eq 0 ] && [ -f "$KEY_DIR/slot9a.p8" ]; then
  openssl pkeyutl -sign \
    -inkey "$KEY_DIR/slot9a.p8" \
    -in "$rawf" -out "$sigbin" \
    -pkeyopt digest:sha256 -pkeyopt rsa_padding_mode:pkcs1
  signed_ok=1
fi
[ "$signed_ok" -eq 1 ] || { echo "ERROR: PKCS#11 TA signing failed" >&2; exit 1; }

base64 -w 0 "$sigbin" > "$sigf"

python3 "$REAL_SIGN_ENC" stitch \
  --key "$PUB_KEY" \
  --algo TEE_ALG_RSASSA_PKCS1_V1_5_SHA256 \
  --uuid "$uuid" \
  --ta-version "$ta_ver" \
  --in "$inf" \
  --sig "$sigf" \
  --out "$outf"

python3 "$REAL_SIGN_ENC" verify \
  --key "$PUB_KEY" \
  --uuid "$uuid" \
  --in "$outf"
EOF_WRAP
chmod +x "$OUT_DIR/pkcs11-sign-encrypt.sh"

echo "[stage-firmware-pkcs11-keys] Key source: $(cat "$OUT_DIR/key-source.txt")"
echo "[stage-firmware-pkcs11-keys] ROTPK SHA-256: $(cat "$OUT_DIR/rotpk_sha256.hex")"
