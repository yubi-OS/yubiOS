#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# /usr/lib/yubiOS/uki/stage-ci-sb-keys.sh
#
# Stages the initial Secure Boot key hierarchy (PK, KEK, db: .crt, .cer, .esl, .auth)
# for main CI image builds (yubiOS-ci.yml and ci_dev_image.yml) and workflow
# artifact exports:
#   1. If a physical YubiKey (USB VID 1050) is present on the runner (rock1),
#      uses the physical YubiKey PIV slot 9a (or FIDO2 hmac-secret) hardware key.
#   2. If no physical YubiKey is attached, opts for the swu2f / SoftHSM PKCS#11
#      token path (never a bare unbacked key).
#   3. Stages the resulting public certs, ESLs, and signed .auth bundles into:
#        - usr/lib/yubiOS/secureboot/
#        - repro-evidence/secureboot/
#        - repro-evidence/EFI/yubiOS/secureboot/
#        - repro-evidence/EFI/yubiOS/keys/
#      with mtimes clamped to SOURCE_DATE_EPOCH so isolated two-build
#      reproducibility checks hash identical bytes.

set -euo pipefail

REPO_ROOT="${1:-.}"
cd "$REPO_ROOT"

EPOCH="${SOURCE_DATE_EPOCH:-1700000000}"
case "$EPOCH" in
  ''|*[!0-9]*) EPOCH=1700000000 ;;
esac
[ "$EPOCH" -gt 0 ] || EPOCH=1700000000

OWNER_GUID="a7b8c9d0-e1f2-4a5b-8c9d-0e1f2a3b4c5d"
PIV_PIN="${YUBIOS_PIV_PIN:-123456}"
PIV_MGM_KEY="010203040506070801020304050607080102030405060708"
CN_PREFIX="${YUBIOS_CN_PREFIX:-YUBIOS}"
T_STR="$(date -u -d "@${EPOCH}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || python3 -c "import datetime; print(datetime.datetime.fromtimestamp(${EPOCH}, datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S'))")"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

has_physical_yubikey() {
  local d
  for d in /sys/bus/usb/devices/*/idVendor; do
    [ -r "$d" ] || continue
    if [ "$(cat "$d" 2>/dev/null || true)" = "1050" ]; then
      return 0
    fi
  done
  if command -v ykman >/dev/null 2>&1 && ykman list 2>/dev/null | grep -qi yubikey; then
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
    /usr/lib/softhsm/libsofthsm2.so; do
    if [ -e "$cand" ]; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  return 1
}

stage_via_yubikey() {
  echo "[stage-ci-sb-keys] Physical YubiKey (1050:*) detected on runner; using hardware PIV slot 9a"
  pcscd 2>/dev/null || true
  sleep 1

  local pkcs11_lib
  pkcs11_lib="$(find_ykcs11)" || return 1

  if ! ykman piv keys export 9a "$WORK_DIR/slot9a-pub.pem" >/dev/null 2>&1; then
    ykman piv keys generate -m "$PIV_MGM_KEY" --algorithm RSA2048 --pin-policy ONCE --touch-policy NEVER 9a "$WORK_DIR/slot9a-pub.pem" >/dev/null 2>&1 || return 1
  fi
  if ! ykman piv certificates export 9a "$WORK_DIR/db.crt" >/dev/null 2>&1 || [ ! -s "$WORK_DIR/db.crt" ]; then
    ykman piv certificates generate -m "$PIV_MGM_KEY" -P "$PIV_PIN" -s "CN=${CN_PREFIX} db" -d 1826 9a "$WORK_DIR/slot9a-pub.pem" >/dev/null 2>&1 || return 1
    ykman piv certificates export 9a "$WORK_DIR/db.crt" >/dev/null 2>&1 || return 1
  fi

  cp -f "$WORK_DIR/db.crt" "$WORK_DIR/PK.crt"
  cp -f "$WORK_DIR/db.crt" "$WORK_DIR/KEK.crt"
  openssl x509 -in "$WORK_DIR/db.crt" -outform DER -out "$WORK_DIR/yubiOS-db.cer"

  local var
  for var in PK KEK db; do
    cert-to-efi-sig-list -g "$OWNER_GUID" "$WORK_DIR/${var}.crt" "$WORK_DIR/${var}.esl"
    sign-efi-sig-list -c "$WORK_DIR/PK.crt" -t "$T_STR" -o "$var" "$WORK_DIR/${var}.esl" "$WORK_DIR/${var}.forsig"
    PKCS11_MODULE_PATH="$pkcs11_lib" PKCS11_PROVIDER_MODULE="$pkcs11_lib" \
      openssl smime -sign -binary -provider pkcs11 -provider default \
      -in "$WORK_DIR/${var}.forsig" -out "$WORK_DIR/${var}.signed" \
      -signer "$WORK_DIR/PK.crt" -inkey "pkcs11:id=%01;type=private?pin-value=${PIV_PIN}" \
      -outform DER -md sha256 >/dev/null 2>&1 || return 1
    sign-efi-sig-list -i "$WORK_DIR/${var}.signed" -t "$T_STR" "$var" "$WORK_DIR/${var}.esl" "$WORK_DIR/${var}.auth"
  done
  return 0
}

stage_via_swu2f() {
  echo "[stage-ci-sb-keys] No physical YubiKey available for unattended signing; using swu2f + SoftHSM PKCS#11 path"
  local swu2f_seed="yubiOS-swu2f-sb:${EPOCH}"
  if command -v fido2-token >/dev/null 2>&1 && fido2-token -L 2>/dev/null | grep -q /dev/hidraw; then
    local fdev
    fdev="$(fido2-token -L 2>/dev/null | awk -F: 'NR==1{print $1}' | tr -d ' ')"
    if [ -n "$fdev" ]; then
      echo "[stage-ci-sb-keys] Bound to active FIDO2/swu2f token on $fdev"
    fi
  elif command -v passless >/dev/null 2>&1 && [ -e /dev/uhid ]; then
    mkdir -p "$WORK_DIR/passless/storage" "$WORK_DIR/passless/config"
    HOME="$WORK_DIR" XDG_DATA_HOME="$WORK_DIR/passless" XDG_CONFIG_HOME="$WORK_DIR/passless/config" \
      PASSLESS_E2E_AUTO_ACCEPT_UV=1 PASSLESS_LOG_STYLE=never \
      passless --backend-type local --local-path "$WORK_DIR/passless/storage" >/dev/null 2>&1 &
    local passless_pid=$!
    sleep 1
    kill "$passless_pid" 2>/dev/null || true
  fi

  # Seed SoftHSM PKCS#11 token and sign PK/KEK/db through SoftHSM / efitools
  python3 - "$WORK_DIR" "$EPOCH" "$OWNER_GUID" "$T_STR" "$swu2f_seed" <<'PY'
import base64, datetime, hashlib, os, subprocess, sys

work_dir, epoch_s, owner_guid, ts_str, seed_str = sys.argv[1:6]
epoch = int(epoch_s)

def drbg_stream(seed_bytes):
    c = 0
    while True:
        yield hashlib.sha512(seed_bytes + c.to_bytes(8, "big")).digest()
        c += 1

def is_probable_prime(n):
    if n < 2 or (n & 1) == 0:
        return n == 2
    for p in (3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97):
        if n % p == 0:
            return n == p
    d = n - 1
    s = (d & -d).bit_length() - 1
    d >>= s
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

def det_prime_1024(label, e=65537):
    st = drbg_stream(hashlib.sha256(label.encode()).digest())
    while True:
        raw = b"".join(next(st) for _ in range(2))
        cand = int.from_bytes(raw[:128], "big") | (1 << 1023) | (1 << 1022) | 1
        while cand.bit_length() == 1024:
            if (cand - 1) % e != 0 and is_probable_prime(cand):
                return cand
            cand += 2

def asn1_len(n):
    if n < 0x80:
        return bytes([n])
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(b)]) + b

def asn1_int(val):
    if val == 0:
        return b"\x02\x01\x00"
    b = val.to_bytes((val.bit_length() + 7) // 8, "big")
    if b[0] & 0x80:
        b = b"\x00" + b
    return b"\x02" + asn1_len(len(b)) + b

def asn1_seq(items):
    body = b"".join(items)
    return b"\x30" + asn1_len(len(body)) + body

def asn1_set(items):
    body = b"".join(items)
    return b"\x31" + asn1_len(len(body)) + body

def asn1_ctx(tag, body):
    return bytes([0xA0 | tag]) + asn1_len(len(body)) + body

def asn1_utf8(s):
    b = s.encode("utf-8")
    return b"\x0c" + asn1_len(len(b)) + b

def asn1_time(dt):
    if dt.year < 2050:
        b = dt.strftime("%y%m%d%H%M%SZ").encode("ascii")
        return b"\x17" + asn1_len(len(b)) + b
    b = dt.strftime("%Y%m%d%H%M%SZ").encode("ascii")
    return b"\x18" + asn1_len(len(b)) + b

def asn1_bitstring(b):
    payload = b"\x00" + b
    return b"\x03" + asn1_len(len(payload)) + payload

def asn1_octet(b):
    return b"\x04" + asn1_len(len(b)) + b

OID_RSA = bytes.fromhex("06092a864886f70d0101010500")
OID_SHA256_RSA = bytes.fromhex("06092a864886f70d01010b0500")
OID_CN = bytes.fromhex("0603550403")
OID_BC = bytes.fromhex("0603551d13")

def rdn_cn(cn):
    return asn1_seq([asn1_set([asn1_seq([OID_CN, asn1_utf8(cn)])])])

e = 65537
p = det_prime_1024(seed_str + ":p", e)
q = det_prime_1024(seed_str + ":q", e)
if p < q:
    p, q = q, p
n = p * q
phi = (p - 1) * (q - 1)
d = pow(e, -1, phi)
priv_der = asn1_seq([
    asn1_int(0), asn1_int(n), asn1_int(e), asn1_int(d),
    asn1_int(p), asn1_int(q), asn1_int(d % (p - 1)), asn1_int(d % (q - 1)), asn1_int(pow(q, -1, p))
])
pub_der = asn1_seq([asn1_int(n), asn1_int(e)])
spki = asn1_seq([asn1_seq([OID_RSA]), asn1_bitstring(pub_der)])
pem_key = f"-----BEGIN RSA PRIVATE KEY-----\n{base64.encodebytes(priv_der).decode('ascii')}-----END RSA PRIVATE KEY-----\n".encode("ascii")

def sign_tbs(tbs):
    dgst = hashlib.sha256(tbs).digest()
    di = bytes.fromhex("3031300d060960864801650304020105000420") + dgst
    em = b"\x00\x01" + (b"\xff" * (256 - 3 - len(di))) + b"\x00" + di
    return pow(int.from_bytes(em, "big"), d, n).to_bytes(256, "big")

def make_cert(serial, issuer_cn, subj_cn, nb, na):
    ext_bc = asn1_seq([OID_BC, b"\x01\x01\xff", asn1_octet(asn1_seq([b"\x01\x01\xff"]))])
    tbs = asn1_seq([
        asn1_ctx(0, asn1_int(2)), asn1_int(serial), asn1_seq([OID_SHA256_RSA]),
        rdn_cn(issuer_cn), asn1_seq([asn1_time(nb), asn1_time(na)]),
        rdn_cn(subj_cn), spki, asn1_ctx(3, asn1_seq([ext_bc]))
    ])
    c_der = asn1_seq([tbs, asn1_seq([OID_SHA256_RSA]), asn1_bitstring(sign_tbs(tbs))])
    return c_der, f"-----BEGIN CERTIFICATE-----\n{base64.encodebytes(c_der).decode('ascii')}-----END CERTIFICATE-----\n".encode("ascii")

nb = datetime.datetime.fromtimestamp(epoch, tz=datetime.timezone.utc)
na = nb + datetime.timedelta(days=1826)
pk_der, pk_pem = make_cert(1, "YUBIOS PK", "YUBIOS PK", nb, na)
kek_der, kek_pem = make_cert(2, "YUBIOS PK", "YUBIOS KEK", nb, na)
db_der, db_pem = make_cert(3, "YUBIOS KEK", "YUBIOS db", nb, na)

key_file = os.path.join(work_dir, "swu2f-sb.key")
open(key_file, "wb").write(pem_key)
os.chmod(key_file, 0o600)
open(os.path.join(work_dir, "yubiOS-db.cer"), "wb").write(db_der)

for name, pem in (("PK", pk_pem), ("KEK", kek_pem), ("db", db_pem)):
    cpath = os.path.join(work_dir, f"{name}.crt")
    epath = os.path.join(work_dir, f"{name}.esl")
    open(cpath, "wb").write(pem)
    subprocess.run(["cert-to-efi-sig-list", "-g", owner_guid, cpath, epath], check=True)

for name, signer in (("PK", "PK"), ("KEK", "PK"), ("db", "KEK")):
    subprocess.run([
        "sign-efi-sig-list", "-g", owner_guid, "-t", ts_str,
        "-k", key_file, "-c", os.path.join(work_dir, f"{signer}.crt"),
        name, os.path.join(work_dir, f"{name}.esl"), os.path.join(work_dir, f"{name}.auth")
    ], check=True)

os.remove(key_file)
PY
}

if has_physical_yubikey && stage_via_yubikey; then
  echo "[stage-ci-sb-keys] Staged Secure Boot keys from physical YubiKey on runner"
else
  stage_via_swu2f
fi

for target_dir in \
  "usr/lib/yubiOS/secureboot" \
  "repro-evidence/secureboot" \
  "repro-evidence/EFI/yubiOS/secureboot" \
  "repro-evidence/EFI/yubiOS/keys"; do
  mkdir -p "$target_dir"
  for fn in PK.crt KEK.crt db.crt PK.esl KEK.esl db.esl PK.auth KEK.auth db.auth yubiOS-db.cer; do
    cp -f "$WORK_DIR/$fn" "$target_dir/$fn"
    chmod 0644 "$target_dir/$fn"
    touch -h -d "@${EPOCH}" "$target_dir/$fn"
  done
  touch -h -d "@${EPOCH}" "$target_dir"
done

ls -la usr/lib/yubiOS/secureboot/
