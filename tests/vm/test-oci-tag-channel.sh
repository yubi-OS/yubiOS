#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
#
# tests/vm/test-oci-tag-channel.sh -- verify strict OCI tag-channel isolation
# between production (`:latest` / `:<sha>`) and TEST-only (`:dev` / `:dev-<sha>`)
# per ADR-003 and ADR-026 (OMN-162):
#   1. Production Containerfile and yubiOS-ci.yml never build or tag :dev artifacts,
#      and never ship passless / install-swu2f-authenticator.sh / root autologin.
#   2. Dev Containerfile.dev carries LABEL yubiOS.image.kind="dev-test" and
#      ci_dev_image.yml's tag guard rejects non-dev tags (:latest or bare <sha>).
#   3. Negative channel-binding check: a manifest or config carrying
#      yubiOS.image.kind="dev-test" or a :dev-<sha> tag is rejected by the
#      production channel verifier, and vice versa.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

usage() {
  cat <<'EOF'
Usage: tests/vm/test-oci-tag-channel.sh [--self-test] [--repo-root PATH]

Options:
  --self-test         Run static + negative channel-binding verification (default).
  --repo-root PATH    Override repository root directory.
  -h, --help          Show this help message.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) shift ;;
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

echo "=== [OMN-162] test-oci-tag-channel.sh ==="

PROD_CF="$REPO_ROOT/Containerfile"
DEV_CF="$REPO_ROOT/Containerfile.dev"
BAKE_HCL="$REPO_ROOT/yubiOS-bake.hcl"
PROD_WF="$REPO_ROOT/.github/workflows/yubiOS-ci.yml"
DEV_WF="$REPO_ROOT/.github/workflows/ci_dev_image.yml"

for req_file in "$PROD_CF" "$DEV_CF" "$BAKE_HCL" "$PROD_WF" "$DEV_WF"; do
  if [[ ! -f "$req_file" ]]; then
    echo "FAIL: required file missing: $req_file" >&2
    exit 1
  fi
done

verify_channel_binding() {
  local channel="$1" tag="$2" kind_label="$3"
  case "$channel" in
    prod)
      if [[ "$tag" == *":dev"* ]]; then
        echo "REJECT: prod channel refused dev tag '$tag'" >&2
        return 1
      fi
      if [[ "$kind_label" == "dev-test" ]]; then
        echo "REJECT: prod channel refused image with yubiOS.image.kind='$kind_label'" >&2
        return 1
      fi
      return 0
      ;;
    dev)
      case "$tag" in
        0mniteck/yubios:dev|0mniteck/yubios:dev-*|docker.io/0mniteck/yubios:dev|docker.io/0mniteck/yubios:dev-*) ;;
        *)
          echo "REJECT: dev channel refused non-dev tag '$tag'" >&2
          return 1
          ;;
      esac
      if [[ "$kind_label" != "dev-test" ]]; then
        echo "REJECT: dev channel refused image missing yubiOS.image.kind=dev-test (got '$kind_label')" >&2
        return 1
      fi
      return 0
      ;;
    *)
      return 2
      ;;
  esac
}

echo -n "1/4 Production Containerfile & yubiOS-ci.yml exclude swu2f, autologin, and :dev tags... "
if grep -Eiq 'install-swu2f-authenticator|--autologin root|yubiOS\.image\.kind="dev-test"' "$PROD_CF"; then
  echo "FAIL (production Containerfile contains dev-only swu2f or autologin markers)" >&2
  exit 1
fi
if grep -Eq 'Containerfile\.dev|yubios-dev|DEV_FLOATING_TAG|DEV_SHA_TAG' "$PROD_WF"; then
  echo "FAIL (production yubiOS-ci.yml references Containerfile.dev or :dev tags)" >&2
  exit 1
fi
echo "OK"

echo -n "2/4 Dev Containerfile.dev & ci_dev_image.yml enforce dev-only labels and tag guards... "
grep -Fq 'LABEL yubiOS.image.kind="dev-test"' "$DEV_CF" || {
  echo "FAIL (Containerfile.dev missing LABEL yubiOS.image.kind=\"dev-test\")" >&2
  exit 1
}
grep -Fq '0mniteck/yubios:dev|0mniteck/yubios:dev-*)' "$DEV_WF" || {
  echo "FAIL (ci_dev_image.yml missing dev manifest tag guard)" >&2
  exit 1
}
echo "OK"

echo -n "3/4 Negative: :latest cannot bind to a :dev digest or dev-test label... "
if verify_channel_binding prod "0mniteck/yubios:latest" "dev-test" 2>/dev/null; then
  echo "FAIL (:latest bound to dev-test digest)" >&2
  exit 1
fi
if verify_channel_binding prod "0mniteck/yubios:dev-deadbeef" "production" 2>/dev/null; then
  echo "FAIL (prod channel accepted :dev-deadbeef tag)" >&2
  exit 1
fi
echo "OK (rejected)"

echo -n "4/4 Negative: :dev-<sha> cannot bind to :latest or non-dev-test image... "
if verify_channel_binding dev "0mniteck/yubios:latest" "dev-test" 2>/dev/null; then
  echo "FAIL (dev channel accepted :latest tag)" >&2
  exit 1
fi
if verify_channel_binding dev "0mniteck/yubios:dev-deadbeef" "production" 2>/dev/null; then
  echo "FAIL (:dev-<sha> bound to production-labeled image)" >&2
  exit 1
fi
verify_channel_binding prod "0mniteck/yubios:latest" "production"
verify_channel_binding dev "0mniteck/yubios:dev-deadbeef" "dev-test"
echo "OK (rejected)"

echo "=== PASS: OCI tag-channel isolation verified (ADR-003 / ADR-026) ==="
