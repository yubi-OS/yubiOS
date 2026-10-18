#!/usr/bin/env bash
# run_matrix.sh - runs the composefs matrix v2 as one chain, tier by tier, FA02 then D7E.
# Sequential only: both bases share the podman storage. Stops on the first call whose
# STATUS is not DONE (METHOD_INVALID, FAILED, or anything unexpected).
# Launch: setsid nohup bash /mnt/extended/matrix2/run_matrix.sh > /mnt/extended/matrix2/chain.launch.log 2>&1 < /dev/null &
set -u

ROOT="${MATRIX_ROOT:-/mnt/extended/matrix2}"
SRC="${MATRIX_SRC:-$ROOT/src/tools/composefs-matrix}"
# One runroot for every call: podman's database is bound to the runroot it was created with
# (/run/ct-new on rock1). A per-base runroot fails with "database configuration mismatch" (rc=125).
RUNROOT="/run/ct-new"
TSV="$SRC/variants_v2.tsv"
CHAIN_LOG="$ROOT/chain.log"
CHAIN_STATUS="$ROOT/CHAIN_STATUS"
LOCK="$ROOT/chain.lock"

log() {
  local line
  line="[$(date +%H:%M:%S)] $*"
  printf '%s\n' "$line" >> "$CHAIN_LOG"
  printf '%s\n' "$line"
}

ids_for() {
  awk -F'\t' -v t="$1" -v b="$2" '$1 != "prio" && $1 == t && $3 == b {print $2}' "$TSV" | paste -sd, -
}

mkdir -p "$ROOT" || exit 1

if ! mkdir "$LOCK" 2>/dev/null; then
  echo "run_matrix.sh: $LOCK exists; another chain may be running. Refusing to start." >&2
  exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
trap 'log "SIGNAL received; chain stops after the current call is finished"; echo "STOPPED:signal" > "$CHAIN_STATUS"; exit 130' INT TERM

if [ ! -r "$SRC/method_v2.sh" ] || [ ! -r "$TSV" ]; then
  echo "STOPPED:preflight:missing-source" > "$CHAIN_STATUS"
  log "STOPPED preflight: cannot read $SRC/method_v2.sh or $TSV"
  exit 1
fi

echo RUNNING > "$CHAIN_STATUS"
log "CHAIN START root=$ROOT src=$SRC"

for tier in 1 2 3; do
  for base in FA02 D7E; do
    ids="$(ids_for "$tier" "$base")"
    if [ -z "$ids" ]; then
      log "tier=$tier base=$base: no ids in $TSV, skipping"
      continue
    fi
    case ",$ids," in
      *,V00,*) only="$ids" ;;
      *) only="V00,$ids" ;;
    esac
    out="$ROOT/$base"
    log "START tier=$tier base=$base only=$only"
    CT_RUNROOT="$RUNROOT" bash "$SRC/method_v2.sh" --base "$base" --variants "$TSV" \
      --out "$out" --only "$only" >> "$ROOT/call-t$tier-$base.log" 2>&1
    rc=$?
    status="$(cat "$out/STATUS" 2>/dev/null || echo MISSING)"
    log "END tier=$tier base=$base rc=$rc status=$status"
    if [ "$rc" -ne 0 ] || [ "$status" != DONE ]; then
      echo "STOPPED:$base:$status" > "$CHAIN_STATUS"
      log "STOPPED at tier=$tier base=$base status=$status rc=$rc; no further calls"
      exit 1
    fi
  done
done

echo DONE > "$CHAIN_STATUS"
log "CHAIN DONE"
exit 0
