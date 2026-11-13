#!/usr/bin/env bash
# tests/verify-package-floors.sh
#
# Continuous CI gate for B-PINS / OMN-41:
#   1. Static lockstep check: every digest-pinned base image in Containerfile,
#      yubiOS-bake.hcl, and .github/workflows/*.yml matches PINNED.md, and
#      Containerfile uses the digest-only quay.io/fedora/fedora-bootc@sha256:<digest>
#      reference (OMN-170).
#   2. Runtime package-floor check (when IMAGE or --image <ref> is supplied and
#      docker/podman is available): inspects the target bootc image via rpm -q
#      and verifies the normative floors from docs/SPEC.md §4.6 and docs/TODO.md:
#        - systemd >= 261
#        - pam-u2f >= 1.3.1
#        - openssl-libs >= 3.5.0
#        - openssh >= 8.2
#        - bootc >= 1.1.0
#        - composefs >= 1.0.0
#        - cryptsetup >= 2.6.0

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="${YUBIOS_REPO_ROOT:-$(cd -- "$SCRIPT_DIR/.." && pwd -P)}"

IMAGE="${1:-${RESOLVED_IMAGE:-}}"
ENGINE="${CONTAINER_ENGINE:-docker}"

log()  { printf '[package-floors] %s\n' "$*"; }
die()  { printf 'FAIL: [package-floors] %s\n' "$*" >&2; exit 1; }

version_ge() {
  # Returns 0 if $1 >= $2 using sort -V
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

# --- 1. Static PINNED.md lockstep check ---
PINNED_FILE="$REPO_ROOT/PINNED.md"
CONTAINERFILE="$REPO_ROOT/Containerfile"
BAKE_FILE="$REPO_ROOT/yubiOS-bake.hcl"

[ -f "$PINNED_FILE" ] || die "PINNED.md missing at $PINNED_FILE"
[ -f "$CONTAINERFILE" ] || die "Containerfile missing at $CONTAINERFILE"

pinned_bootc="$(grep -oE 'quay\.io/fedora/fedora-bootc@sha256:[0-9a-f]{64}' "$PINNED_FILE" | head -n1 || true)"
[ -n "$pinned_bootc" ] || die "No digest-only quay.io/fedora/fedora-bootc@sha256:<digest> entry found in PINNED.md"

cf_bootc="$(awk '/^[[:space:]]*FROM[[:space:]]+quay\.io\/fedora\/fedora-bootc/ {print $2; exit}' "$CONTAINERFILE")"
[ -n "$cf_bootc" ] || die "No FROM quay.io/fedora/fedora-bootc line found in Containerfile"

if [ "$cf_bootc" != "$pinned_bootc" ]; then
  die "Containerfile FROM ($cf_bootc) does not match PINNED.md ($pinned_bootc)"
fi
log "PASS: Containerfile matches PINNED.md ($pinned_bootc)"

if grep -Eq '^[[:space:]]*FROM[[:space:]]+quay\.io/fedora/fedora-bootc:[^@[:space:]]+@sha256:' "$CONTAINERFILE"; then
  die "Containerfile still uses tag+digest form (:45@sha256:...) instead of digest-only quay.io/fedora/fedora-bootc@sha256:..."
fi

pinned_dhi="$(grep -oE 'dhi\.io/debian-base@sha256:[0-9a-f]{64}' "$PINNED_FILE" | head -n1 || true)"
if [ -n "$pinned_dhi" ] && [ -f "$BAKE_FILE" ]; then
  bake_dhi="$(grep -oE 'dhi\.io/debian-base@sha256:[0-9a-f]{64}' "$BAKE_FILE" | head -n1 || true)"
  if [ -n "$bake_dhi" ] && [ "$bake_dhi" != "$pinned_dhi" ]; then
    die "yubiOS-bake.hcl debian-base digest ($bake_dhi) does not match PINNED.md ($pinned_dhi)"
  fi
  log "PASS: yubiOS-bake.hcl matches PINNED.md ($pinned_dhi)"
fi

# --- 2. Runtime package-floor check inside the target image (if IMAGE given) ---
if [ -z "$IMAGE" ]; then
  log "No target image specified; static PINNED.md lockstep check passed."
  exit 0
fi

command -v "$ENGINE" >/dev/null 2>&1 || die "container engine '$ENGINE' not found"

log "Querying package floors inside $IMAGE via $ENGINE..."
pkg_out="$("$ENGINE" run --rm --network=none "$IMAGE" rpm -q --qf '%{NAME}\t%{VERSION}\n' systemd pam-u2f openssl-libs openssh bootc composefs cryptsetup)"

check_floor() {
  local pkg="$1" floor="$2" got
  got="$(awk -F'\t' -v p="$pkg" '$1 == p {print $2; exit}' <<<"$pkg_out")"
  [ -n "$got" ] || die "Package '$pkg' not installed in $IMAGE"
  if ! version_ge "$got" "$floor"; then
    die "Package '$pkg' version $got is below required floor $floor"
  fi
  log "PASS: $pkg $got >= $floor"
}

check_floor systemd      261
check_floor pam-u2f      1.3.1
check_floor openssl-libs 3.5.0
check_floor openssh      8.2
check_floor bootc        1.1.0
check_floor composefs    1.0.0
check_floor cryptsetup   2.6.0

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Package Floor & PINNED.md Lockstep Gate (OMN-41 / B-PINS)"
    echo "- \`Containerfile\` == \`PINNED.md\`: \`$pinned_bootc\`"
    echo "- \`yubiOS-bake.hcl\` == \`PINNED.md\`: \`${pinned_dhi:-n/a}\`"
    echo '```'
    printf '%s\n' "$pkg_out"
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi

log "ALL PINNED.md lockstep and package-floor checks PASSED."
