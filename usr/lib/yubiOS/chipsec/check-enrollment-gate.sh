#!/bin/sh
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS enrollment gate on the first-boot CHIPSEC result (ADR-024, OMN-18).
#
# Wired as ExecCondition= in yubiOS-enroll.service and called again by
# /usr/lib/yubiOS/enroll.sh (defense in depth for manual runs).
#
# Reads ${YUBIOS_CHIPSEC_STATE_FILE:-/run/yubiOS/chipsec-firstboot.status},
# falling back to ${YUBIOS_CHIPSEC_PERSIST_FILE:-/var/lib/yubiOS/chipsec-firstboot.status}.
#
#   RESULT=FAILED  -> block message on stderr, exit 1 (ExecCondition= exit 1
#                     skips the unit, so ExecStartPost= never writes .enrolled)
#   RESULT=WARN    -> warning message, exit 0 (enrollment proceeds)
#   RESULT=PASS    -> exit 0
#   no status file -> exit 0 (CHIPSEC skipped: VM, non-x86_64, not measured
#                     boot, or not first boot)
#   unknown RESULT -> warning, exit 0 (fail-open on parse problems; only an
#                     explicit FAILED verdict blocks, per ADR-024 honesty note)
#
# Exit codes are kept in 0..1 on purpose: ExecCondition= treats 255 as a unit
# failure rather than a skipped condition.

set -u

STATE_FILE="${YUBIOS_CHIPSEC_STATE_FILE:-/run/yubiOS/chipsec-firstboot.status}"
PERSIST_FILE="${YUBIOS_CHIPSEC_PERSIST_FILE:-/var/lib/yubiOS/chipsec-firstboot.status}"
LOG_TAG=yubiOS-enroll-gate

note() { logger -t "$LOG_TAG" "$*" 2>/dev/null || true; echo "$*" >&2; }

status_file=""
if [ -r "$STATE_FILE" ]; then
  status_file="$STATE_FILE"
elif [ -r "$PERSIST_FILE" ]; then
  status_file="$PERSIST_FILE"
fi

if [ -z "$status_file" ]; then
  note "INFO: no CHIPSEC first-boot status file ($STATE_FILE, $PERSIST_FILE); CHIPSEC did not run on this platform (VM/non-x86_64/skipped). Proceeding with enrollment."
  exit 0
fi

result="$(sed -n 's/^RESULT=//p' "$status_file" | tail -n 1 | tr -d '[:space:]')"

case "$result" in
  FAILED)
    note "FAIL: CHIPSEC first-boot platform check reported FAILED; blocking YubiKey enrollment per ADR-024."
    note "      status: $status_file -- review: journalctl -t yubiOS-chipsec"
    exit 1
    ;;
  WARN)
    note "WARN: CHIPSEC first-boot platform check reported WARN; proceeding with enrollment (review journal for firmware warnings)."
    exit 0
    ;;
  PASS)
    note "PASS: CHIPSEC first-boot platform check reported PASS; proceeding with enrollment."
    exit 0
    ;;
  *)
    note "WARN: CHIPSEC status file $status_file has no recognised RESULT ('${result}'); proceeding with enrollment."
    exit 0
    ;;
esac
