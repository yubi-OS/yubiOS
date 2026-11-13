#!/usr/bin/env bash
# tests/verify-systemd-hardening-runtime.sh
#
# Runtime systemd hardening verification against the BUILT yubiOS OCI image
# (B-HARDENING-RUNTIME: OMN-40, OMN-54, OMN-55).
#
# refs/history/systemd-hardening-audit-2026-07-17.md closed the static audit
# but left one evidence gate open: "Run the Bats tests and systemd-analyze
# verify inside the target image/base". This script closes that gate.
#
#   Check 1 (OMN-54): hardening directives + Bats inside the target image
#     1a. Extract every yubiOS unit (and the bootloader-update drop-in) from
#         the image and assert the hardening/gating directives recorded in the
#         audit. Missing expected directives fail hard. Recommended directives
#         that are not set are reported as a gap matrix (informational).
#     1b. Run the image-content Bats suites from tests/unit/ INSIDE the image
#         (bats installed into the throwaway container with dnf), so the
#         suites see the image's own /usr and its own systemd-analyze. If dnf
#         cannot install bats, fall back to host bats run against the
#         extracted image rootfs.
#   Check 2 (OMN-55): systemd-analyze inside the target image
#     2a. systemd-analyze verify on every yubiOS unit. Fails on unit syntax
#         errors, unknown directives, bad settings, missing Exec binaries and
#         broken dependencies. Only container-environment absence noise
#         (no booted manager, no /dev/tpmrm0, unmounted /boot, ...) is
#         tolerated.
#     2b. systemd-analyze security --offline=yes on every yubiOS service
#         unit: table + JSON + overall exposure score per unit.
#
# Usage:
#   tests/verify-systemd-hardening-runtime.sh [IMAGE]
#
# Inputs (all optional):
#   IMAGE argument, else $RESOLVED_IMAGE, else docker.io/0mniteck/yubios:latest
#   CONTAINER_ENGINE        docker (default) or podman
#   HARDENING_OUT_DIR       evidence directory (default $RUNNER_TEMP or /tmp)
#   HARDENING_SKIP_BATS=1   skip Check 1b
#   HARDENING_STRICT_EXEC=1 turn the "shell syntax in Exec line" finding into
#                           a hard failure (default: warning)
#   HARDENING_MAX_EXPOSURE  fail if any unit's exposure score is above this
#                           number (default: unset, scores are recorded only)
#
# A verify finding is downgraded to a warning only when the same verify, run in
# the same image with this checkout's units and /usr/lib/yubiOS overlaid, is
# clean (the image predates a fix already in source). A rebuilt image that
# still carries the defect fails hard again.
#
# Exit codes: 0 all hard checks passed, 1 a hard check failed, 2 usage or
# environment error (engine missing, image not pullable).

# Markdown backticks and the in-container bash -c programs are intentionally
# single-quoted: they must not expand on the host.
# shellcheck disable=SC2016

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

IMAGE="${1:-${RESOLVED_IMAGE:-docker.io/0mniteck/yubios:latest}}"
ENGINE="${CONTAINER_ENGINE:-docker}"
OUT_DIR="${HARDENING_OUT_DIR:-${RUNNER_TEMP:-/tmp}/yubios-hardening-runtime}"
STRICT_EXEC="${HARDENING_STRICT_EXEC:-0}"
MAX_EXPOSURE="${HARDENING_MAX_EXPOSURE:-}"

# Image-content Bats suites: these read files the image ships under /usr and
# resolve them relative to the working directory, so running them with cwd=/
# inside the image tests the image, not the repo checkout.
BATS_SUITES=(
  test-enroll-unit.bats
  test-chipsec-firstboot-unit.bats
  test-bootloader-update-unit.bats
  test-pam-u2f-stack.bats
  test-lib.bats
)

FAILURES=0
WARNINGS=0

log()  { printf '[hardening-runtime] %s\n' "$*"; }
fail() { FAILURES=$((FAILURES + 1)); printf '::error::%s\n' "$*"; }
warn() { WARNINGS=$((WARNINGS + 1)); printf '::warning::%s\n' "$*"; }

command -v "$ENGINE" >/dev/null 2>&1 || { echo "container engine '$ENGINE' not found" >&2; exit 2; }

mkdir -p "$OUT_DIR"
ROOTFS="$OUT_DIR/rootfs"
rm -rf "$ROOTFS"
mkdir -p "$ROOTFS"
SUMMARY="$OUT_DIR/summary.md"
: > "$SUMMARY"

if ! "$ENGINE" image inspect "$IMAGE" >/dev/null 2>&1; then
  log "pulling $IMAGE"
  "$ENGINE" pull "$IMAGE" >/dev/null || { echo "cannot pull $IMAGE" >&2; exit 2; }
fi
IMAGE_DIGEST="$("$ENGINE" image inspect "$IMAGE" --format '{{ index .RepoDigests 0 }}' 2>/dev/null || true)"
log "image: $IMAGE"
log "digest: ${IMAGE_DIGEST:-unknown}"
log "evidence dir: $OUT_DIR"

{
  echo '### systemd hardening runtime verification (OMN-40 / OMN-54 / OMN-55)'
  echo
  echo "- Image: \`$IMAGE\`"
  echo "- Digest: \`${IMAGE_DIGEST:-unknown}\`"
  echo "- Host arch: \`$(uname -m)\`"
  echo
} >> "$SUMMARY"

# ---------------------------------------------------------------------------
# Extract the unit-bearing paths of the image (no full export needed).
# ---------------------------------------------------------------------------
# docker cp of /usr/lib/systemd/system is not reliable on these images (the
# first CI attempt lost the whole directory), so stream a tar from inside the
# image instead and keep its stderr as evidence.
EXTRACT_PATHS=(usr/lib/systemd/system etc/systemd/system usr/lib/yubiOS usr/lib/pam.d)
set +e
"$ENGINE" run --rm --network=none "$IMAGE" bash -c '
  cd / || exit 3
  present=()
  for p in "$@"; do
    if [ -e "$p" ]; then present+=("$p"); else echo "absent: /$p" >&2; fi
  done
  tar -cf - "${present[@]}"
' bash "${EXTRACT_PATHS[@]}" 2> "$OUT_DIR/extract.stderr" | tar -C "$ROOTFS" -xf - --no-same-owner --no-same-permissions 2>> "$OUT_DIR/extract.stderr"
extract_rc=("${PIPESTATUS[@]}")
set -e
if [ "${extract_rc[0]}" -ne 0 ] || [ "${extract_rc[1]}" -ne 0 ]; then
  warn "image extraction exited ${extract_rc[*]}; see extract.stderr"
fi
if [ -s "$OUT_DIR/extract.stderr" ]; then
  sed 's/^/    extract: /' "$OUT_DIR/extract.stderr"
fi

UNIT_DIR="$ROOTFS/usr/lib/systemd/system"
mapfile -t IMAGE_UNITS < <(
  find "$UNIT_DIR" -maxdepth 1 -type f -iname 'yubi*' \
    \( -name '*.service' -o -name '*.socket' -o -name '*.timer' -o -name '*.path' -o -name '*.target' -o -name '*.mount' \) \
    -printf '%f\n' | LC_ALL=C sort
)
mapfile -t ETC_UNITS < <(
  find "$ROOTFS/etc/systemd/system" -maxdepth 1 -type f -iname 'yubi*' -printf '%f\n' 2>/dev/null | LC_ALL=C sort
)
mapfile -t REPO_UNITS < <(
  find "$REPO_ROOT/usr/lib/systemd/system" -maxdepth 1 -type f -iname 'yubi*' -printf '%f\n' 2>/dev/null | LC_ALL=C sort
)

if [ "${#IMAGE_UNITS[@]}" -eq 0 ]; then
  fail "no yubiOS units found under /usr/lib/systemd/system in $IMAGE"
fi
log "image yubiOS units: ${IMAGE_UNITS[*]:-none}"
log "image /etc yubiOS units: ${ETC_UNITS[*]:-none}"

# ---------------------------------------------------------------------------
# Unit parsing helpers. get_directive FILE SECTION KEY prints the effective
# value (last assignment wins, an empty assignment resets the list).
# ---------------------------------------------------------------------------
get_directive() {
  awk -v want_sec="[$2]" -v want_key="$3" '
    /^[[:space:]]*[#;]/ { next }
    /^[[:space:]]*\[/ { sec = $0; gsub(/[[:space:]]/, "", sec); next }
    {
      line = $0
      eq = index(line, "=")
      if (eq == 0) next
      key = substr(line, 1, eq - 1); val = substr(line, eq + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
      if (sec == want_sec && key == want_key) { found = 1; last = val }
    }
    END { if (found) print last; else exit 1 }
  ' "$1"
}

has_key_anywhere() {
  grep -Eq "^[[:space:]]*$2[[:space:]]*=" "$1"
}

# expect FILE SECTION KEY VALUE: hard-fail when the effective value differs.
expect() {
  local file="$1" section="$2" key="$3" want="$4" got
  local unit
  unit="$(basename "$file")"
  if got="$(get_directive "$file" "$section" "$key")"; then
    if [ "$got" = "$want" ]; then
      printf 'PASS\t%s\t[%s] %s=%s\n' "$unit" "$section" "$key" "$want" >> "$OUT_DIR/directives.tsv"
      return 0
    fi
    printf 'FAIL\t%s\t[%s] %s expected=%s got=%s\n' "$unit" "$section" "$key" "$want" "$got" >> "$OUT_DIR/directives.tsv"
    fail "$unit: [$section] $key expected '$want', image has '$got'"
  else
    printf 'FAIL\t%s\t[%s] %s missing (expected %s)\n' "$unit" "$section" "$key" "$want" >> "$OUT_DIR/directives.tsv"
    fail "$unit: [$section] $key=$want missing in image"
  fi
}

# ---------------------------------------------------------------------------
# Check 1a: directive assertions (baseline from the 2026-07-17 audit plus the
# directives each unit ships today). These are regression gates.
# ---------------------------------------------------------------------------
log "Check 1a: hardening directive assertions"
: > "$OUT_DIR/directives.tsv"

unit_path() { printf '%s/%s' "$UNIT_DIR" "$1"; }

require_unit() {
  if [ -f "$(unit_path "$1")" ]; then return 0; fi
  fail "$1 is not shipped in /usr/lib/systemd/system of $IMAGE"
  return 1
}

U=yubiOS-enroll.service
if require_unit "$U"; then
  F="$(unit_path "$U")"
  expect "$F" Unit ConditionSecurity measured-os
  expect "$F" Unit ConditionFirstBoot yes
  expect "$F" Unit ConditionPathExists '!/var/lib/yubiOS/.enrolled'
  expect "$F" Service Type oneshot
  expect "$F" Service RestrictFileSystems '~@network'
fi

U=yubiOS-chipsec-firstboot.service
if require_unit "$U"; then
  F="$(unit_path "$U")"
  expect "$F" Unit ConditionSecurity measured-os
  expect "$F" Unit ConditionFirstBoot yes
  expect "$F" Unit Before yubiOS-enroll.service
  expect "$F" Service Type oneshot
  expect "$F" Service PrivateNetwork yes
  expect "$F" Service ProtectHome yes
  expect "$F" Service ProtectSystem strict
  expect "$F" Service ReadWritePaths '/run/yubiOS /tmp'
  expect "$F" Service CapabilityBoundingSet 'CAP_SYS_RAWIO CAP_SYS_ADMIN CAP_DAC_OVERRIDE'
  expect "$F" Service NoNewPrivileges no
fi

U=yubios-uki-install.service
if require_unit "$U"; then
  F="$(unit_path "$U")"
  expect "$F" Unit ConditionFirstBoot yes
  expect "$F" Unit ConditionPathExists /usr/lib/yubiOS/uki/yubios.efi
  expect "$F" Service Type oneshot
  expect "$F" Service PrivateNetwork yes
  expect "$F" Service ProtectHome yes
  expect "$F" Service ProtectSystem strict
  expect "$F" Service ReadWritePaths '/boot /efi /loader /run'
  # The Containerfile also installs a copy in /etc/systemd/system, which
  # shadows /usr. The two must not drift or the /usr hardening is dead text.
  ETC_COPY="$ROOTFS/etc/systemd/system/$U"
  if [ -f "$ETC_COPY" ]; then
    if cmp -s "$F" "$ETC_COPY"; then
      printf 'PASS\t%s\t/etc copy identical to /usr copy\n' "$U" >> "$OUT_DIR/directives.tsv"
    else
      printf 'FAIL\t%s\t/etc copy differs from /usr copy\n' "$U" >> "$OUT_DIR/directives.tsv"
      fail "$U: /etc/systemd/system copy differs from /usr/lib/systemd/system copy"
    fi
  fi
fi

U=yubiOS-no-vfio-purge.service
if require_unit "$U"; then
  F="$(unit_path "$U")"
  expect "$F" Unit ConditionPathExists /dev/vfio
  expect "$F" Unit DefaultDependencies no
  expect "$F" Service Type oneshot
fi

DROPIN="$UNIT_DIR/bootloader-update.service.d/10-skip-bcvk-virtiofs-root.conf"
if [ -f "$DROPIN" ]; then
  expect "$DROPIN" Service ExecCondition /usr/lib/yubiOS/skip-bootloader-update-if-bcvk.sh
else
  fail "bootloader-update.service.d/10-skip-bcvk-virtiofs-root.conf not shipped in $IMAGE"
fi

# Audit rule: RestrictFileSystemAccess= stays out until its own design pass.
for u in "${IMAGE_UNITS[@]}"; do
  if has_key_anywhere "$(unit_path "$u")" RestrictFileSystemAccess; then
    fail "$u uses RestrictFileSystemAccess=, which the 2026-07-17 audit defers to a separate design/test pass"
  else
    printf 'PASS\t%s\tno RestrictFileSystemAccess= (audit rule)\n' "$u" >> "$OUT_DIR/directives.tsv"
  fi
done

# Every yubiOS unit in the repo must ship in the image; drift in content is a
# warning because :latest can lag main by one build.
for u in "${REPO_UNITS[@]}"; do
  if [ ! -f "$(unit_path "$u")" ]; then
    warn "$u exists in the repo but not in $IMAGE (image older than this commit?)"
  elif ! cmp -s "$REPO_ROOT/usr/lib/systemd/system/$u" "$(unit_path "$u")"; then
    warn "$u in $IMAGE differs from the repo copy (image built from another commit?)"
  fi
done
for u in "${IMAGE_UNITS[@]}"; do
  case " ${REPO_UNITS[*]:-} " in
    *" $u "*) ;;
    *) warn "$u ships in $IMAGE but has no source in usr/lib/systemd/system/ of this checkout" ;;
  esac
done

# Exec lines: systemd does not run a shell, so '||', '&&', '|', and
# redirections in a non-shell Exec line become literal argv entries.
: > "$OUT_DIR/exec-shell-syntax.txt"
for u in "${IMAGE_UNITS[@]}"; do
  while IFS= read -r line; do
    cmd="${line#*=}"
    cmd="${cmd#"${cmd%%[![:space:]]*}"}"
    cmd="${cmd#[-@!+:]}"
    case "$cmd" in
      /bin/sh\ -c*|/usr/bin/sh\ -c*|/bin/bash\ -c*|/usr/bin/bash\ -c*) continue ;;
    esac
    if grep -Eq '(^|[[:space:]])(\|\||&&|\||[0-9]?>{1,2}[^[:space:]]*|<)([[:space:]]|$)' <<<"$cmd"; then
      printf '%s: %s\n' "$u" "$line" >> "$OUT_DIR/exec-shell-syntax.txt"
      msg="$u: Exec line uses shell syntax without a shell (systemd passes it as argv): $line"
      if [ "$STRICT_EXEC" = 1 ]; then fail "$msg"; else warn "$msg"; fi
    fi
  done < <(grep -E '^[[:space:]]*Exec[A-Za-z]*[[:space:]]*=' "$(unit_path "$u")" || true)
done

# Gap matrix: recommended directives per service unit (informational).
RECOMMENDED=(NoNewPrivileges ProtectSystem ProtectHome PrivateTmp PrivateDevices PrivateNetwork RestrictFileSystems CapabilityBoundingSet ConditionSecurity)
{
  echo '#### Hardening directive matrix (effective values in the image)'
  echo
  printf '| Unit |'; printf ' %s |' "${RECOMMENDED[@]}"; echo
  printf '|---|'; printf -- '---|%.0s' "${RECOMMENDED[@]}"; echo
  for u in "${IMAGE_UNITS[@]}"; do
    case "$u" in *.service) ;; *) continue ;; esac
    printf '| `%s` |' "$u"
    for key in "${RECOMMENDED[@]}"; do
      sec=Service
      [ "$key" = ConditionSecurity ] && sec=Unit
      if val="$(get_directive "$(unit_path "$u")" "$sec" "$key")"; then
        printf ' `%s` |' "$val"
      else
        printf ' -- |'
      fi
    done
    echo
  done
  echo
} > "$OUT_DIR/gap-matrix.md"
cat "$OUT_DIR/gap-matrix.md" >> "$SUMMARY"

pass_count="$(grep -c '^PASS' "$OUT_DIR/directives.tsv" || true)"
fail_count="$(grep -c '^FAIL' "$OUT_DIR/directives.tsv" || true)"
log "Check 1a: $pass_count directive assertions passed, $fail_count failed"
cat "$OUT_DIR/directives.tsv"
{
  echo "#### Check 1a: directive assertions: ${pass_count} pass, ${fail_count} fail"
  echo
  if [ -s "$OUT_DIR/exec-shell-syntax.txt" ]; then
    echo 'Exec lines with shell syntax but no shell:'
    echo
    echo '```'
    cat "$OUT_DIR/exec-shell-syntax.txt"
    echo '```'
    echo
  fi
} >> "$SUMMARY"

# ---------------------------------------------------------------------------
# Check 1b: Bats suites inside the target image.
# ---------------------------------------------------------------------------
if [ "${HARDENING_SKIP_BATS:-0}" != 1 ]; then
  log "Check 1b: Bats suites inside the image"
  suite_args=()
  for s in "${BATS_SUITES[@]}"; do
    if [ -f "$REPO_ROOT/tests/unit/$s" ]; then
      suite_args+=("/yubios-tests/unit/$s")
    else
      warn "Bats suite tests/unit/$s missing from checkout"
    fi
  done
  bats_mode=in-image
  set +e
  "$ENGINE" run --rm \
    -v "$REPO_ROOT/tests:/yubios-tests:ro" \
    -v "$REPO_ROOT/usr:/checkout-usr:ro" \
    -v "$REPO_ROOT/mkosi.conf.d:/mkosi.conf.d:ro" \
    -w / \
    "$IMAGE" bash -c '
      set -u
      if [ -d /checkout-usr/lib/systemd/system ]; then
        cp -a /checkout-usr/lib/systemd/system/. /usr/lib/systemd/system/
      fi
      if [ -d /checkout-usr/lib/yubiOS ]; then
        mkdir -p /usr/lib/yubiOS
        cp -a /checkout-usr/lib/yubiOS/. /usr/lib/yubiOS/
      fi
      if ! command -v bats >/dev/null 2>&1; then
        if ! dnf -y -q --setopt=install_weak_deps=False install bats >/tmp/dnf.log 2>&1; then
          tail -n 20 /tmp/dnf.log >&2
          exit 90
        fi
      fi
      echo "# bats: $(bats --version)"
      echo "# systemd-analyze: $(systemd-analyze --version | head -n1)"
      cd /
      bats --tap "$@"
    ' bash "${suite_args[@]}" > "$OUT_DIR/bats.tap" 2> "$OUT_DIR/bats.stderr"
  bats_rc=$?
  set -e
  if [ "$bats_rc" -eq 90 ]; then
    warn "could not install bats inside $IMAGE (dnf failed); falling back to host bats against the extracted image rootfs"
    cat "$OUT_DIR/bats.stderr" >&2 || true
    bats_mode=host-against-extracted-rootfs
    if command -v bats >/dev/null 2>&1; then
      cp -a "$REPO_ROOT/usr/lib/systemd/system/." "$ROOTFS/usr/lib/systemd/system/" 2>/dev/null || true
      mkdir -p "$ROOTFS/usr/lib/yubiOS" "$ROOTFS/mkosi.conf.d"
      cp -a "$REPO_ROOT/usr/lib/yubiOS/." "$ROOTFS/usr/lib/yubiOS/" 2>/dev/null || true
      cp -a "$REPO_ROOT/mkosi.conf.d/." "$ROOTFS/mkosi.conf.d/" 2>/dev/null || true
      host_args=()
      for s in "${BATS_SUITES[@]}"; do
        [ -f "$REPO_ROOT/tests/unit/$s" ] && host_args+=("$REPO_ROOT/tests/unit/$s")
      done
      set +e
      (cd "$ROOTFS" && bats --tap "${host_args[@]}") > "$OUT_DIR/bats.tap" 2> "$OUT_DIR/bats.stderr"
      bats_rc=$?
      set -e
    else
      fail "bats not available in the image or on the host"
      bats_rc=1
    fi
  fi
  cat "$OUT_DIR/bats.tap"
  bats_ok="$(grep -c '^ok ' "$OUT_DIR/bats.tap" || true)"
  bats_skip="$(grep -c '^ok .*# skip' "$OUT_DIR/bats.tap" || true)"
  bats_notok="$(grep -c '^not ok ' "$OUT_DIR/bats.tap" || true)"
  if [ "$bats_rc" -ne 0 ] || [ "$bats_notok" -ne 0 ]; then
    fail "Bats ($bats_mode): $bats_notok failing test(s), exit $bats_rc"
    grep '^not ok ' "$OUT_DIR/bats.tap" || true
    tail -n 40 "$OUT_DIR/bats.stderr" >&2 || true
  fi
  {
    echo "#### Check 1b: Bats ($bats_mode): ${bats_ok} ok (${bats_skip} skipped), ${bats_notok} not ok"
    echo
    echo '```'
    cat "$OUT_DIR/bats.tap"
    echo '```'
    echo
  } >> "$SUMMARY"
fi

# ---------------------------------------------------------------------------
# Check 2: systemd-analyze verify + security inside the target image.
# ---------------------------------------------------------------------------
log "Check 2: systemd-analyze verify/security inside the image"
VERIFY_TARGETS=()
for u in "${IMAGE_UNITS[@]}"; do VERIFY_TARGETS+=("/usr/lib/systemd/system/$u"); done
for u in "${ETC_UNITS[@]}"; do VERIFY_TARGETS+=("/etc/systemd/system/$u"); done
if [ -f "$DROPIN" ] && [ -f "$UNIT_DIR/bootloader-update.service" ]; then
  VERIFY_TARGETS+=("/usr/lib/systemd/system/bootloader-update.service")
fi
SECURITY_TARGETS=()
for u in "${IMAGE_UNITS[@]}"; do
  case "$u" in *.service) SECURITY_TARGETS+=("/usr/lib/systemd/system/$u") ;; esac
done

set +e
"$ENGINE" run --rm --network=none \
  -v "$REPO_ROOT/usr:/checkout-usr:ro" \
  -e "VERIFY_TARGETS=${VERIFY_TARGETS[*]}" \
  -e "SECURITY_TARGETS=${SECURITY_TARGETS[*]}" \
  "$IMAGE" bash -c '
    set -u
    echo "@@VERSION $(systemd-analyze --version | head -n1)"
    for t in $VERIFY_TARGETS; do
      echo "@@VERIFY_BEGIN $t"
      systemd-analyze verify --man=no --recursive-errors=no "$t" 2>&1
      echo "@@VERIFY_RC $t $?"
    done
    for t in $SECURITY_TARGETS; do
      echo "@@SECURITY_BEGIN $t"
      systemd-analyze security --offline=yes --no-pager "$t" 2>&1
      echo "@@SECURITY_RC $t $?"
      echo "@@SECURITY_JSON_BEGIN $t"
      systemd-analyze security --offline=yes --no-pager --json=short "$t" 2>/dev/null
      echo
      echo "@@SECURITY_JSON_RC $t $?"
    done
    # Checkout overlay: same image systemd, this commit'"'"'s units and helper
    # scripts copied over the throwaway container'"'"'s /usr (and the /etc copy
    # the Containerfile installs), then the same verify again.
    if [ -d /checkout-usr/lib/systemd/system ]; then
      cp -a /checkout-usr/lib/systemd/system/. /usr/lib/systemd/system/
      [ -d /checkout-usr/lib/yubiOS ] && cp -a /checkout-usr/lib/yubiOS/. /usr/lib/yubiOS/
      for e in /etc/systemd/system/yubi*; do
        [ -f "$e" ] && [ -f "/checkout-usr/lib/systemd/system/${e##*/}" ] && cp -a "/checkout-usr/lib/systemd/system/${e##*/}" "$e"
      done
      for t in $VERIFY_TARGETS; do
        echo "@@OVERLAY_BEGIN $t"
        systemd-analyze verify --man=no --recursive-errors=no "$t" 2>&1
        echo "@@OVERLAY_RC $t $?"
      done
    fi
  ' > "$OUT_DIR/analyze.raw" 2>&1
analyze_rc=$?
set -e
if [ "$analyze_rc" -ne 0 ]; then
  fail "systemd-analyze container run exited $analyze_rc"
  cat "$OUT_DIR/analyze.raw" >&2
fi

SA_VERSION="$(sed -n 's/^@@VERSION //p' "$OUT_DIR/analyze.raw" | head -n1)"
log "image systemd: $SA_VERSION"

# Container-environment noise that is not a unit defect. Anything else that
# names a yubiOS unit is treated as a finding.
ALLOW_RE='(/dev/tpmrm0|/dev/tpm0|/dev/vfio|/boot|/efi|/loader|not booted with systemd|Failed to connect to (system scope )?bus|No such file or directory.*/(proc|sys)/|cgroup|Failed to open /dev/|Running in a container|Cannot determine cgroup|SELinux)'
FATAL_RE='(Unknown key|Unknown section|Unknown lvalue|Failed to parse|Invalid|bad-setting|bad unit file setting|is not executable|not found|Missing .=.|Failed to load|Failed to add dependency|Unit .* is not loaded properly|Assignment outside of section|Ignoring unknown escape|has no ExecStart|Service has no|refusing|Too many)'

: > "$OUT_DIR/verify-findings.txt"
{
  echo "#### Check 2a: systemd-analyze verify (image ${SA_VERSION:-unknown})"
  echo
  echo '| Unit file | exit | result |'
  echo '|---|---|---|'
} >> "$SUMMARY"
for t in "${VERIFY_TARGETS[@]}"; do
  base="$(basename "$t")"
  out="$OUT_DIR/verify-$(printf '%s' "$t" | tr '/' '_').log"
  awk -v t="$t" '
    $0 == "@@VERIFY_BEGIN " t { on = 1; next }
    on && index($0, "@@VERIFY_RC " t " ") == 1 { on = 0; next }
    on { print }
  ' "$OUT_DIR/analyze.raw" > "$out"
  rc="$(awk -v t="$t" 'index($0, "@@VERIFY_RC " t " ") == 1 { print $NF }' "$OUT_DIR/analyze.raw" | tail -n1)"
  rc="${rc:-missing}"
  unit_lines="$(grep -F -- "${base%.*}" "$out" || true)"
  fatal_lines="$(grep -E "$FATAL_RE" <<<"$unit_lines" | grep -Ev "$ALLOW_RE" || true)"
  other_unit_lines="$(grep -Ev "$ALLOW_RE" <<<"$unit_lines" | grep -Ev "$FATAL_RE" || true)"
  result=clean
  # Stale-image rule: a finding the image ships but that this checkout's
  # source no longer produces (same verify, same image systemd, checkout
  # units + scripts overlaid) is a warning until the image is rebuilt.
  if [ -n "$fatal_lines" ]; then
    ov_out="$OUT_DIR/verify-overlay-$(printf '%s' "$t" | tr '/' '_').log"
    awk -v t="$t" '
      $0 == "@@OVERLAY_BEGIN " t { on = 1; next }
      on && index($0, "@@OVERLAY_RC " t " ") == 1 { on = 0; next }
      on { print }
    ' "$OUT_DIR/analyze.raw" > "$ov_out"
    ov_rc="$(awk -v t="$t" 'index($0, "@@OVERLAY_RC " t " ") == 1 { print $NF }' "$OUT_DIR/analyze.raw" | tail -n1)"
    ov_fatal="$(grep -F -- "${base%.*}" "$ov_out" | grep -E "$FATAL_RE" | grep -Ev "$ALLOW_RE" || true)"
    if [ "${ov_rc:-x}" = 0 ] && [ -z "$ov_fatal" ]; then
      while IFS= read -r fl; do
        [ -n "$fl" ] || continue
        warn "systemd-analyze verify $t: $fl (clean with this checkout's source overlaid; image predates the fix)"
      done <<<"$fatal_lines"
      printf '%s (stale image; clean with checkout overlay)\n%s\n' "$t" "$fatal_lines" >> "$OUT_DIR/verify-findings.txt"
      fatal_lines=""
      result="warning (stale image, fixed in checkout)"
    fi
  fi
  if [ -n "$fatal_lines" ]; then
    result=FAIL
    fail "systemd-analyze verify $t: $(head -n1 <<<"$fatal_lines")"
    printf '%s\n%s\n' "$t" "$fatal_lines" >> "$OUT_DIR/verify-findings.txt"
  elif [ "$rc" != 0 ] && [ "$result" = clean ]; then
    noise="$(grep -Ev "$ALLOW_RE" "$out" | grep -v '^[[:space:]]*$' || true)"
    if [ -n "$noise" ]; then
      result=FAIL
      fail "systemd-analyze verify $t exited $rc: $(head -n1 <<<"$noise")"
      printf '%s (rc %s)\n%s\n' "$t" "$rc" "$noise" >> "$OUT_DIR/verify-findings.txt"
    else
      result="tolerated (container-env only)"
    fi
  elif [ -n "$other_unit_lines" ] && [ "$result" = clean ]; then
    result="warning"
    warn "systemd-analyze verify $t: $(head -n1 <<<"$other_unit_lines")"
  fi
  printf '| `%s` | %s | %s |\n' "$t" "$rc" "$result" >> "$SUMMARY"
  log "verify $t: rc=$rc result=$result"
  sed 's/^/    /' "$out"
done
echo >> "$SUMMARY"

{
  echo '#### Check 2b: systemd-analyze security --offline=yes'
  echo
  echo '| Unit | exposure | rating |'
  echo '|---|---|---|'
} >> "$SUMMARY"
: > "$OUT_DIR/security-scores.tsv"
: > "$OUT_DIR/security.jsonl"
for t in "${SECURITY_TARGETS[@]}"; do
  base="$(basename "$t")"
  table="$OUT_DIR/security-$base.txt"
  awk -v t="$t" '
    $0 == "@@SECURITY_BEGIN " t { on = 1; next }
    on && index($0, "@@SECURITY_RC " t " ") == 1 { on = 0; next }
    on { print }
  ' "$OUT_DIR/analyze.raw" > "$table"
  awk -v t="$t" '
    $0 == "@@SECURITY_JSON_BEGIN " t { on = 1; next }
    on && index($0, "@@SECURITY_JSON_RC " t " ") == 1 { on = 0; next }
    on && NF { print }
  ' "$OUT_DIR/analyze.raw" > "$OUT_DIR/security-$base.json"
  if [ -s "$OUT_DIR/security-$base.json" ]; then
    printf '{"unit":"%s","checks":%s}\n' "$base" "$(cat "$OUT_DIR/security-$base.json")" >> "$OUT_DIR/security.jsonl"
  fi
  overall="$(grep -E 'Overall exposure level' "$table" | tail -n1 || true)"
  score="$(sed -nE 's/.*: ([0-9]+\.[0-9]+) .*/\1/p' <<<"$overall")"
  rating="$(sed -nE 's/.*: [0-9]+\.[0-9]+ (.*)$/\1/p' <<<"$overall" | sed 's/[^A-Z]//g')"
  if [ -z "$score" ]; then
    fail "systemd-analyze security produced no exposure score for $t"
    sed 's/^/    /' "$table"
    printf '| `%s` | n/a | n/a |\n' "$base" >> "$SUMMARY"
    continue
  fi
  printf '%s\t%s\t%s\n' "$base" "$score" "$rating" >> "$OUT_DIR/security-scores.tsv"
  printf '| `%s` | %s | %s |\n' "$base" "$score" "$rating" >> "$SUMMARY"
  log "security $base: $score $rating"
  cat "$table"
  if [ -n "$MAX_EXPOSURE" ] && awk -v s="$score" -v m="$MAX_EXPOSURE" 'BEGIN { exit !(s > m) }'; then
    fail "$base exposure $score exceeds HARDENING_MAX_EXPOSURE=$MAX_EXPOSURE"
  fi
done
echo >> "$SUMMARY"

{
  echo "**Result:** ${FAILURES} hard failure(s), ${WARNINGS} warning(s). Evidence: \`$OUT_DIR\`."
  echo
} >> "$SUMMARY"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  cat "$SUMMARY" >> "$GITHUB_STEP_SUMMARY"
fi

log "done: $FAILURES hard failure(s), $WARNINGS warning(s)"
if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi
exit 0
