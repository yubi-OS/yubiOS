#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# Build helper for the signed CHIPSEC portable service image (ADR-024, OMN-18).
#
# Usage:
#   build-portable-image.sh stage DESTROOT
#       Lay the portable payload into DESTROOT (used by
#       mkosi.conf.d/chipsec-portable/mkosi.postinst, and by the unit tests):
#         /usr/lib/os-release                          (PORTABLE_* fields appended)
#         /usr/lib/extension-release.d/extension-release.yubios-chipsec
#         /usr/lib/systemd/system/yubiOS-chipsec-firstboot.service
#         /usr/lib/yubiOS/chipsec/run-firstboot-check.sh
#   build-portable-image.sh build [MKOSI_ARGS...]
#       From a repo checkout: mkosi --profile chipsec-portable build, then
#       verify the output (see verify).
#   build-portable-image.sh verify RAW
#       systemd-dissect --validate RAW and require a root-verity-sig
#       partition (i.e. Verity=signed actually took effect).
#
# Environment:
#   YUBIOS_SRC_ROOT        repo checkout (default: derived from this script)
#   CHIPSEC_VERSION        pinned CHIPSEC version recorded in extension-release
#
# Exit codes: 0 ok, 1 build/verify failure, 2 usage error.

set -euo pipefail

CHIPSEC_VERSION="${CHIPSEC_VERSION:-1.13.16}"
IMAGE_NAME=yubios-chipsec
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SRC_ROOT="${YUBIOS_SRC_ROOT:-$(cd -- "$SCRIPT_DIR/../../../.." && pwd -P)}"

usage() { sed -n '3,22p' "${BASH_SOURCE[0]}" >&2; exit 2; }

stage() {
  local dest="${1:?stage needs DESTROOT}"
  local unit="$SRC_ROOT/usr/lib/systemd/system/yubiOS-chipsec-firstboot.service"
  local wrapper="$SRC_ROOT/usr/lib/yubiOS/chipsec/run-firstboot-check.sh"
  [[ -f "$unit" && -f "$wrapper" ]] || { echo "stage: payload not found under $SRC_ROOT" >&2; exit 1; }

  install -D -m 0644 "$unit" "$dest/usr/lib/systemd/system/yubiOS-chipsec-firstboot.service"
  install -D -m 0755 "$wrapper" "$dest/usr/lib/yubiOS/chipsec/run-firstboot-check.sh"

  # os-release: keep the base distro identity, add the portable fields.
  install -d -m 0755 "$dest/usr/lib"
  if [[ ! -f "$dest/usr/lib/os-release" ]]; then
    printf 'ID=yubios\nNAME=yubiOS\n' > "$dest/usr/lib/os-release"
  fi
  sed -i '/^PORTABLE_/d' "$dest/usr/lib/os-release"
  {
    echo "PORTABLE_PRETTY_NAME=\"yubiOS CHIPSEC $CHIPSEC_VERSION first-boot firmware validation\""
    echo "PORTABLE_PREFIXES=$IMAGE_NAME"
  } >> "$dest/usr/lib/os-release"

  install -d -m 0755 "$dest/usr/lib/extension-release.d"
  cat > "$dest/usr/lib/extension-release.d/extension-release.$IMAGE_NAME" <<EOF
ID=_any
ARCHITECTURE=x86-64
PORTABLE_PREFIXES=$IMAGE_NAME
YUBIOS_CHIPSEC_VERSION=$CHIPSEC_VERSION
EOF
  chmod 0644 "$dest/usr/lib/extension-release.d/extension-release.$IMAGE_NAME"
  echo "stage: $IMAGE_NAME payload laid into $dest (CHIPSEC $CHIPSEC_VERSION)"
}

verify() {
  local raw="${1:?verify needs RAW}"
  [[ -f "$raw" ]] || { echo "verify: $raw not found" >&2; exit 1; }
  command -v systemd-dissect >/dev/null 2>&1 || { echo "verify: systemd-dissect not installed" >&2; exit 1; }
  systemd-dissect --validate "$raw"
  if ! systemd-dissect --json=short "$raw" | grep -q '"designator":"root-verity-sig"'; then
    echo "verify: $raw has no root-verity-sig partition (Verity=signed did not apply)" >&2
    exit 1
  fi
  sha256sum "$raw"
}

build() {
  command -v mkosi >/dev/null 2>&1 || { echo "build: mkosi not installed" >&2; exit 1; }
  (cd "$SRC_ROOT" && mkosi --profile chipsec-portable "$@" build)
  verify "$SRC_ROOT/mkosi.output/yubios-chipsec-portable.raw"
}

cmd="${1:-}"
[[ -n "$cmd" ]] || usage
shift
case "$cmd" in
  stage)  stage "$@" ;;
  build)  build "$@" ;;
  verify) verify "$@" ;;
  *)      usage ;;
esac
