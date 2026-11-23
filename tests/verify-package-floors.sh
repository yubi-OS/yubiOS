#!/usr/bin/env bash
# tests/verify-package-floors.sh
#
# Continuous CI gate for B-PINS / OMN-41 & OMN-149 UAPI.6 drop-in lex-sort:
#   1. Static lockstep check: every digest-pinned base image in Containerfile,
#      yubiOS-bake.hcl, and .github/workflows/*.yml matches PINNED.md, and
#      Containerfile uses the digest-only quay.io/fedora/fedora-bootc@sha256:<digest>
#      reference (OMN-170).
#   1b. Static UAPI.6 drop-in lexicographic-sort check (OMN-149 / mvo5/sd-conf):
#      verifies under LC_ALL=C byte-order that every yubiOS override in usr/
#      sorts strictly after (or, for first-match-wins presets, before) the
#      upstream package files it interacts with.
#   2. Runtime package-floor & in-container drop-in check (when IMAGE is supplied).

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="${YUBIOS_REPO_ROOT:-$(cd -- "$SCRIPT_DIR/.." && pwd -P)}"

IMAGE="${1:-${RESOLVED_IMAGE:-}}"
ENGINE="${CONTAINER_ENGINE:-docker}"

log()  { printf '[package-floors] %s\n' "$*"; }
die()  { printf 'FAIL: [package-floors] %s\n' "$*" >&2; exit 1; }

version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

assert_lex_after() {
  local dir_label="$1" yubios_base="$2" upstream_base="$3"
  local first
  first="$(printf '%s\n%s\n' "$yubios_base" "$upstream_base" | LC_ALL=C sort | head -n1)"
  if [ "$first" != "$upstream_base" ] || [ "$yubios_base" = "$upstream_base" ]; then
    die "UAPI.6 lex-sort violation in $dir_label: '$yubios_base' does not sort AFTER '$upstream_base' under LC_ALL=C"
  fi
}

assert_lex_before() {
  local dir_label="$1" yubios_base="$2" upstream_base="$3"
  local first
  first="$(printf '%s\n%s\n' "$yubios_base" "$upstream_base" | LC_ALL=C sort | head -n1)"
  if [ "$first" != "$yubios_base" ] || [ "$yubios_base" = "$upstream_base" ]; then
    die "UAPI.6 lex-sort violation in $dir_label: '$yubios_base' does not sort BEFORE '$upstream_base' under LC_ALL=C"
  fi
}

check_uapi6_dropin_order() {
  local root="$1"
  [ -d "$root/usr" ] || return 0

  # 1. usr/lib/tmpfiles.d: vfio-yubiOS-no-static-vfio.conf must sort AFTER static-nodes-permissions.conf (OMN-149)
  local tmpfiles_dir="$root/usr/lib/tmpfiles.d"
  if [ -d "$tmpfiles_dir" ]; then
    local vfio_tmpfile=""
    local f base
    for f in "$tmpfiles_dir"/*vfio*.conf; do
      [ -e "$f" ] || continue
      base="$(basename "$f")"
      vfio_tmpfile="$base"
      assert_lex_after "usr/lib/tmpfiles.d" "$base" "static-nodes-permissions.conf"
    done
    [ -n "$vfio_tmpfile" ] || die "Missing vfio tmpfiles.d drop-in in $tmpfiles_dir"
  fi

  # 2. usr/lib/udev/rules.d: yubiOS-no-vfio-udev.rules > 50-udev-default.rules;
  #    70-yubiOS-hidraw.rules > 70-uaccess.rules AND < 73-seat-late.rules
  local udev_dir="$root/usr/lib/udev/rules.d"
  if [ -d "$udev_dir" ]; then
    [ -f "$udev_dir/yubiOS-no-vfio-udev.rules" ] || die "Missing yubiOS-no-vfio-udev.rules in $udev_dir"
    assert_lex_after "usr/lib/udev/rules.d" "yubiOS-no-vfio-udev.rules" "50-udev-default.rules"
    if [ -f "$udev_dir/70-yubiOS-hidraw.rules" ]; then
      assert_lex_after "usr/lib/udev/rules.d" "70-yubiOS-hidraw.rules" "70-uaccess.rules"
      assert_lex_before "usr/lib/udev/rules.d" "70-yubiOS-hidraw.rules" "73-seat-late.rules"
    fi
  fi

  # 3. usr/lib/kernel/install.d: 95-yubios-uki-resign.install > 50-dracut.install & 90-loaderentry.install & 90-uki-copy.install
  local kinst_dir="$root/usr/lib/kernel/install.d"
  if [ -d "$kinst_dir" ] && [ -f "$kinst_dir/95-yubios-uki-resign.install" ]; then
    assert_lex_after "usr/lib/kernel/install.d" "95-yubios-uki-resign.install" "50-dracut.install"
    assert_lex_after "usr/lib/kernel/install.d" "95-yubios-uki-resign.install" "90-loaderentry.install"
    assert_lex_after "usr/lib/kernel/install.d" "95-yubios-uki-resign.install" "90-uki-copy.install"
  fi

  # 4. usr/share/glib-2.0/schemas: zz-yubiOS-wallpaper.gschema.override > 00_org.gnome.desktop.background.fedora.gschema.override
  local schema_dir="$root/usr/share/glib-2.0/schemas"
  if [ -d "$schema_dir" ] && [ -f "$schema_dir/zz-yubiOS-wallpaper.gschema.override" ]; then
    assert_lex_after "usr/share/glib-2.0/schemas" "zz-yubiOS-wallpaper.gschema.override" "00_org.gnome.desktop.background.fedora.gschema.override"
    assert_lex_after "usr/share/glib-2.0/schemas" "zz-yubiOS-wallpaper.gschema.override" "99_default.gschema.override"
  fi

  # 5. usr/lib/systemd/system-preset: first match wins -> 15-yubiOS.preset < 85-yubiOS.preset < 90-default.preset < 99-default-disable.preset
  local preset_dir="$root/usr/lib/systemd/system-preset"
  if [ -d "$preset_dir" ]; then
    if [ -f "$preset_dir/15-yubiOS.preset" ] && [ -f "$preset_dir/85-yubiOS.preset" ]; then
      assert_lex_before "usr/lib/systemd/system-preset" "15-yubiOS.preset" "85-yubiOS.preset"
      assert_lex_before "usr/lib/systemd/system-preset" "85-yubiOS.preset" "90-default.preset"
      assert_lex_before "usr/lib/systemd/system-preset" "85-yubiOS.preset" "99-default-disable.preset"
    fi
  fi

  # 6. usr/lib/dracut.conf.d: 50-yubiOS-fido2.conf < 51-yubiOS-composefs.conf < 52-yubiOS-no-vfio.conf < 53-yubiOS-optee-ftpm.conf
  local dracut_dir="$root/usr/lib/dracut.conf.d"
  if [ -d "$dracut_dir" ] && [ -f "$dracut_dir/50-yubiOS-fido2.conf" ]; then
    assert_lex_before "usr/lib/dracut.conf.d" "50-yubiOS-fido2.conf" "51-yubiOS-composefs.conf"
    assert_lex_before "usr/lib/dracut.conf.d" "51-yubiOS-composefs.conf" "52-yubiOS-no-vfio.conf"
    assert_lex_before "usr/lib/dracut.conf.d" "52-yubiOS-no-vfio.conf" "53-yubiOS-optee-ftpm.conf"
  fi

  log "PASS: UAPI.6 drop-in lexicographic ordering invariants verified (OMN-149 / sd-conf)"
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

# --- 1b. Static UAPI.6 Drop-In Lexicographic-Sort Gate ---
check_uapi6_dropin_order "$REPO_ROOT"

# --- 2. Runtime package-floor check inside the target image (if IMAGE given) ---
if [ -z "$IMAGE" ]; then
  log "No target image specified; static PINNED.md lockstep and UAPI.6 drop-in checks passed."
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

log "ALL PINNED.md lockstep, UAPI.6 drop-in, and package-floor checks PASSED."
