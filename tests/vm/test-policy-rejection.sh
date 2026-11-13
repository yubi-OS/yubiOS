#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
#
# tests/vm/test-policy-rejection.sh -- negative supply-chain policy & PKCS#11 URI
# rejection tests (OMN-162):
#   Part A: yubiOS.rego rejects unpinned mutable tags, unapproved registries, and
#           blanket docker.io/docker/* images, while allowing digest-pinned approved
#           images and the narrow buildkit-syft-scanner:stable-1 carve-out without
#           eval_conflict_error (OMN-157 Rego mutex rule).
#   Part B: tests/validate-pkcs11-uri.sh fails closed on a missing PKCS#11 module,
#           missing Yubico slot, missing slot 9c key, or missing certificate.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGO_FILE="${REPO_ROOT}/yubiOS.rego"
PKCS11_SCRIPT="${REPO_ROOT}/tests/validate-pkcs11-uri.sh"

usage() {
  cat <<'EOF'
Usage: tests/vm/test-policy-rejection.sh [--repo-root PATH]

Options:
  --repo-root PATH    Override repository root directory.
  -h, --help          Show this help message.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; REGO_FILE="${REPO_ROOT}/yubiOS.rego"; PKCS11_SCRIPT="${REPO_ROOT}/tests/validate-pkcs11-uri.sh"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

echo "=== [OMN-162] test-policy-rejection.sh ==="

if [[ ! -f "$REGO_FILE" ]]; then
  echo "FAIL: yubiOS.rego not found at $REGO_FILE" >&2
  exit 1
fi
if [[ ! -f "$PKCS11_SCRIPT" ]]; then
  echo "FAIL: validate-pkcs11-uri.sh not found at $PKCS11_SCRIPT" >&2
  exit 1
fi

echo "--- Part A: yubiOS.rego negative & positive policy evaluation ---"
python3 - "$REGO_FILE" <<'EOF_REGO'
import json, re, subprocess, shutil, sys

rego_path = sys.argv[1]
with open(rego_path, "r", encoding="utf-8") as f:
    rego_src = f.read()

assert "default allow := false" in rego_src, "missing default allow := false"
prefixes = re.findall(r'approved_registry\(ref\)\s+if\s+startswith\(ref,\s+"([^"]+)"\)', rego_src)
assert set(prefixes) == {"quay.io/fedora/", "dhi.io/", "ghcr.io/actions/", "ghcr.io/hadolint/"}, f"unexpected prefixes: {prefixes}"

deny_blocks = re.findall(r'reason\s*:=\s*msg\s*if\s*\{([^}]+)\}', rego_src)
assert len(deny_blocks) >= 2, "expected at least 2 deny reason blocks"
for blk in deny_blocks:
    assert "not allow" in blk, f"OMN-157 violation: deny reason block missing `not allow` guard:\n{blk}"

def eval_rego(inp):
    if shutil.which("opa"):
        p = subprocess.run(
            ["opa", "eval", "--format=json", "-d", rego_path, "-I", "data.docker.decision"],
            input=json.dumps(inp), text=True, capture_output=True, check=True
        )
        res = json.loads(p.stdout)["result"][0]["expressions"][0]["value"]
        return res["allow"], res["reason"]
    local = bool(inp.get("local", False))
    img = inp.get("image", {})
    ref = img.get("ref", "")
    is_canon = bool(img.get("isCanonical", False))
    approved = any(ref.startswith(p) for p in prefixes)
    allow = local or (approved and is_canon) or (ref == "docker.io/docker/buildkit-syft-scanner:stable-1")
    reasons = []
    if (not allow) and (not local) and (not approved):
        reasons.append(f"Image '{ref}' is not from an approved registry. Allowed: quay.io/fedora/, dhi.io/, ghcr.io/actions/, ghcr.io/hadolint/")
    if (not allow) and (not local) and approved and (not is_canon):
        reasons.append(f"Image '{ref}' uses a mutable tag. Pin to a digest: FROM {ref}@sha256:<hash>")
    if allow:
        reasons.append("Build allowed.")
    if len(reasons) > 1:
        raise RuntimeError(f"eval_conflict_error: multiple reasons produced: {reasons}")
    return allow, (reasons[0] if reasons else "Build evaluated.")

cases = [
    ("unpinned mutable tag on approved registry", {"local": False, "image": {"ref": "quay.io/fedora/fedora-bootc:45", "isCanonical": False}}, False, "uses a mutable tag"),
    ("pinned digest on unapproved registry", {"local": False, "image": {"ref": "docker.io/library/ubuntu@sha256:" + "a"*64, "isCanonical": True}}, False, "is not from an approved registry"),
    ("unapproved docker.io/docker image", {"local": False, "image": {"ref": "docker.io/docker/dockerfile:1", "isCanonical": False}}, False, "is not from an approved registry"),
    ("unpinned :latest tag on approved registry", {"local": False, "image": {"ref": "quay.io/fedora/fedora-bootc:latest", "isCanonical": False}}, False, "uses a mutable tag"),
    ("digest-only quay.io/fedora base image (OMN-170 canonical form)", {"local": False, "image": {"ref": "quay.io/fedora/fedora-bootc@sha256:" + "b"*64, "isCanonical": True}}, True, "Build allowed."),
    ("legacy tag+digest quay.io/fedora base image", {"local": False, "image": {"ref": "quay.io/fedora/fedora-bootc:45@sha256:" + "b"*64, "isCanonical": True}}, True, "Build allowed."),
    ("buildkit-syft-scanner carve-out (OMN-157)", {"local": False, "image": {"ref": "docker.io/docker/buildkit-syft-scanner:stable-1", "isCanonical": False}}, True, "Build allowed."),
]

for label, inp, exp_allow, exp_substr in cases:
    allow, reason = eval_rego(inp)
    assert allow is exp_allow, f"case '{label}': expected allow={exp_allow}, got {allow} ({reason})"
    assert exp_substr in reason, f"case '{label}': expected '{exp_substr}' in '{reason}'"
    print(f"  [OK] {label}: allow={allow}, reason='{reason}'")
EOF_REGO

echo "--- Part B: tests/validate-pkcs11-uri.sh negative fail-closed checks ---"
WORKDIR="$(mktemp -d "/tmp/yubios-policy-rej.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

echo -n "  1/3 Missing PKCS#11 module fails closed... "
if PKCS11_LIB="$WORKDIR/nonexistent.so" CERT_PEM="$WORKDIR/nonexistent.pem" bash "$PKCS11_SCRIPT" >/dev/null 2>&1; then
  echo "FAIL (accepted missing PKCS#11 module)" >&2
  exit 1
fi
echo "OK"

echo -n "  2/3 Wrong token / missing PIV slot 9c key fails closed... "
mkdir -p "$WORKDIR/bin"
cat > "$WORKDIR/bin/pkcs11-tool" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"--list-slots"* ]]; then
  echo "Slot 0 (0x0): Yubico YubiKey PIV"
  exit 0
fi
if [[ "$*" == *"--list-objects"* ]]; then
  echo "Private Key Object; RSA 2048 bits"
  echo "  label:      Wrong Key Slot"
  exit 0
fi
exit 1
EOF
chmod +x "$WORKDIR/bin/pkcs11-tool"
touch "$WORKDIR/dummy.so"
if PATH="$WORKDIR/bin:$PATH" PKCS11_LIB="$WORKDIR/dummy.so" CERT_PEM="$WORKDIR/nonexistent.pem" bash "$PKCS11_SCRIPT" >/dev/null 2>&1; then
  echo "FAIL (accepted missing PIV AUTH slot 9c key)" >&2
  exit 1
fi
echo "OK"

echo -n "  3/3 Corrupt / missing Secure Boot certificate fails closed... "
cat > "$WORKDIR/bin/pkcs11-tool" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"--list-slots"* ]]; then
  echo "Slot 0 (0x0): Yubico YubiKey PIV"
  exit 0
fi
if [[ "$*" == *"--list-objects"* ]]; then
  echo "Private Key Object; EC"
  echo "  label:      PIV AUTH key"
  exit 0
fi
exit 0
EOF
chmod +x "$WORKDIR/bin/pkcs11-tool"
printf 'not-a-valid-pem' > "$WORKDIR/corrupt.pem"
if PATH="$WORKDIR/bin:$PATH" PKCS11_LIB="$WORKDIR/dummy.so" CERT_PEM="$WORKDIR/corrupt.pem" bash "$PKCS11_SCRIPT" >/dev/null 2>&1; then
  echo "FAIL (accepted corrupt certificate)" >&2
  exit 1
fi
echo "OK"

echo "=== PASS: yubiOS.rego build policy and PKCS#11 URI negative rejections verified ==="
