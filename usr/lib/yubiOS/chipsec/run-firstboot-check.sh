#!/bin/sh
# yubiOS first-boot firmware validation wrapper (ADR-024).
#
# Runs a fixed, yubiOS-relevant subset of CHIPSEC's common.* modules plus a
# best-effort Absolute/Computrace surface scan. Writes a structured result to
# /run/yubiOS/chipsec-firstboot.status (and the legacy /run/yubiOS/chipsec-result)
# for yubiOS-enroll.service to read, and logs full detail to the journal under
# SYSLOG_IDENTIFIER=yubiOS-chipsec.
#
# Honesty note (see ADR-024): there is no automated CHIPSEC module for
# Absolute Persistence / Computrace detection. The wpbt/uefi-var scan below is
# informational only -- it does not PASS/FAIL, it reports what it finds.
#
# Result contract:
#   RESULT=PASS   all scoped CHIPSEC checks passed.
#   RESULT=WARN   CHIPSEC produced warnings or no report; surface this as
#                 firmware-warning evidence, not as a clean bill of health.
#   RESULT=FAILED one or more scoped CHIPSEC checks failed.
# WPBT/Computrace detections are recorded separately as informational evidence
# and must not, by themselves, change the PASS/WARN/FAILED result.
#
# Status file contract (OMN-18; refs/chipsec-portable-and-enrollment-gating-2026-11-12.md):
#   ${YUBIOS_CHIPSEC_STATE_FILE:-/run/yubiOS/chipsec-firstboot.status}, plus
#   /var/lib/yubiOS/chipsec-firstboot.status when /var/lib/yubiOS is writable
#   (StateDirectory=yubiOS in the unit). KEY=VALUE lines:
#     RESULT=PASS|WARN|FAILED
#     TIMESTAMP=<UTC ISO-8601>
#     DETAILS=<one-line summary>
#     WPBT_PRESENT=yes|no
#     CHIPSEC_SOURCE=portable|in-image
#     REPORT=<path to the CHIPSEC JSON report>
#   The marker line YUBIOS_CHIPSEC_RESULT=<RESULT> is also logged to stdout
#   and the journal.
#
# Exit codes: 0 on PASS or WARN, 1 on FAILED.
# Consumer: /usr/lib/yubiOS/chipsec/check-enrollment-gate.sh
# (yubiOS-enroll.service ExecCondition=) blocks enrollment on RESULT=FAILED.

set -eu

RESULT_DIR="${YUBIOS_RUN_DIR:-/run/yubiOS}"
RESULT_FILE="$RESULT_DIR/chipsec-result"
STATE_FILE="${YUBIOS_CHIPSEC_STATE_FILE:-$RESULT_DIR/chipsec-firstboot.status}"
PERSIST_DIR="${YUBIOS_CHIPSEC_PERSIST_DIR:-/var/lib/yubiOS}"
PORTABLE_MARKER="${YUBIOS_CHIPSEC_PORTABLE_MARKER:-/usr/lib/extension-release.d/extension-release.yubios-chipsec}"
LOG_TAG=yubiOS-chipsec
mkdir -p "$RESULT_DIR" "$(dirname "$STATE_FILE")"

log() { logger -t "$LOG_TAG" "$*" 2>/dev/null || true; echo "$*"; }

# With the opt-in portable drop-in (yubiOS-chipsec-portable.conf: RootImage=
# the signed yubios-chipsec.raw) this script runs inside the portable image,
# which carries the extension-release marker. Otherwise it runs in-image.
if [ -f "$PORTABLE_MARKER" ]; then
  CHIPSEC_SOURCE=portable
else
  CHIPSEC_SOURCE=in-image
fi

log "yubiOS first-boot firmware validation starting (source: $CHIPSEC_SOURCE)"

modprobe chipsec_helper 2>/dev/null || log "WARNING: chipsec_helper module load failed or unavailable"

MODULES="common.bios_wp common.spi_lock common.spi_desc common.smm_lock common.smrr common.smm_code_chk common.secureboot.variables common.debugenabled common.me_mfg_mode"

OVERALL=PASS
DETAILS="all scoped firmware checks passed"
REPORT="$RESULT_DIR/chipsec-report.json"

set --
for module in $MODULES; do
  set -- "$@" -m "$module"
done

if ! chipsec_main.py "$@" --json "$REPORT" >/tmp/chipsec-firstboot.log 2>&1; then
  log "WARNING: chipsec_main.py exited non-zero -- see /tmp/chipsec-firstboot.log"
fi

if [ -f "$REPORT" ]; then
  if grep -q '"result": *"Failed"' "$REPORT" 2>/dev/null; then
    OVERALL=FAILED
    DETAILS="one or more firmware checks failed -- see $REPORT"
    log "FAILED: $DETAILS"
  elif grep -q '"result": *"Warning"' "$REPORT" 2>/dev/null; then
    OVERALL=WARN
    DETAILS="one or more firmware checks warned -- see $REPORT"
    log "WARN: $DETAILS"
  else
    log "PASS: $DETAILS"
  fi
else
  OVERALL=WARN
  DETAILS="no chipsec report produced -- treating as inconclusive, not a hard failure"
  log "WARN: $DETAILS"
fi

# Best-effort Absolute/Computrace surface (informational only -- see ADR-024).
WPBT_SEEN=no
if chipsec_util.py acpi list 2>/dev/null | grep -qi WPBT; then
  WPBT_SEEN=yes
  log "INFO: WPBT ACPI table present (Absolute/Computrace-capable firmware feature; informational, not a failure)"
fi
COMPUTRACE_VARS=$(chipsec_util.py uefi var-list 2>/dev/null | grep -iE 'computrace|absolute' || true)
if [ -n "$COMPUTRACE_VARS" ]; then
  log "INFO: Computrace/Absolute-named UEFI variables present: $COMPUTRACE_VARS"
fi

TIMESTAMP=$(date -u +%FT%TZ)

# Legacy result file (original ADR-024 contract; kept for existing readers).
cat > "$RESULT_FILE" <<EOF
RESULT=$OVERALL
WPBT_PRESENT=$WPBT_SEEN
REPORT=$REPORT
TIMESTAMP=$TIMESTAMP
EOF

# OMN-18 status file, written via tmp + rename so a reader never sees a
# half-written RESULT line.
write_status() {
  _dest="$1"
  _tmp="$_dest.tmp.$$"
  {
    echo "RESULT=$OVERALL"
    echo "TIMESTAMP=$TIMESTAMP"
    echo "DETAILS=$DETAILS"
    echo "WPBT_PRESENT=$WPBT_SEEN"
    echo "CHIPSEC_SOURCE=$CHIPSEC_SOURCE"
    echo "REPORT=$REPORT"
  } > "$_tmp" && mv -f "$_tmp" "$_dest"
}

write_status "$STATE_FILE"
log "status written to $STATE_FILE"

if [ -d "$PERSIST_DIR" ] && [ -w "$PERSIST_DIR" ]; then
  if write_status "$PERSIST_DIR/chipsec-firstboot.status" 2>/dev/null; then
    log "status persisted to $PERSIST_DIR/chipsec-firstboot.status"
  else
    log "WARNING: could not persist status to $PERSIST_DIR"
  fi
fi

log "YUBIOS_CHIPSEC_RESULT=$OVERALL"
log "yubiOS first-boot firmware validation complete: $OVERALL"

if [ "$OVERALL" = FAILED ]; then
  exit 1
fi
exit 0
