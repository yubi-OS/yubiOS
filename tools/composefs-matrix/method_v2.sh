#!/usr/bin/env bash
# method_v2.sh - composefs digest matrix runner (lane A).
#
#   method_v2.sh --base FA02|D7E --variants <tsv> --out <dir> [--only id,id] [--dry-run]
#
# Mounts the base image, reads composefs=<hex> from each UKI cmdline (TARGET_UKI),
# runs a control gate (V00 twice, both must equal INST), then runs every variant
# in a writable view of the rootfs and digests it with bootc inside podman.
#
# Variants TSV: prio<TAB>id<TAB>base<TAB>cmd   (optional header; '#' lines ignored)
#   cmd is bash run with $R = writable rootfs view of the base.
#
# <dir>: progress.txt results.tsv targets.txt summary.md STATUS logs/<id>.log work/<id>/ (transient)
# STATUS: RUNNING | DONE (exit 0) | METHOD_INVALID (exit 3) | FAILED (exit 1)
# Usage errors exit 2 and do not touch <dir>.
# METHOD_V2_SOURCE_ONLY=1 sources the helpers without running main (used by tests).

set -u
set -o pipefail

CT_ROOT="${CT_ROOT:-/mnt/extended/containers}"
CT_RUNROOT="${CT_RUNROOT:-/run/ct-new}"
MIN_FREE_BYTES=8589934592   # 8 GiB

DRY=0
BASE=""
VARIANTS=""
OUT=""
ONLY=""
IMAGE=""
INST=""
UKI_EXPECT=""
TARGET_UKI=""
M=""
BASE_MOUNTED=0
ACTIVE_ID=""
ACTIVE_MODE="none"
VP=()
VI=()
VB=()
VC=()

usage() {
  cat <<'EOF'
Usage: method_v2.sh --base FA02|D7E --variants <tsv> --out <dir> [--only id,id] [--dry-run]
EOF
}

die_usage() {
  echo "method_v2.sh: $*" >&2
  usage >&2
  exit 2
}

base_setup() {
  case "$1" in
    FA02)
      IMAGE="docker.io/0mniteck/yubios@sha256:fa02a22209108dec899281a7fff43599600564b1f05ea3e703e16714843f3ee7"
      INST="a3156f146d291ec7f087d849fdeca1328067f73b243a0cc6502576bcd1427ead93458e6bdd6412fa76a2c94cfdb812ea9af56580b67053d21a5940ee1e853d25"
      UKI_EXPECT="0235777b"
      ;;
    D7E)
      IMAGE="docker.io/0mniteck/yubios@sha256:d7e662449bd853d26627971c495789ef6c2721410f4149aec6f09aedd2cb4858"
      INST="f074a281da7257fa300eeffeec5c376208541789c18f61dc7381da698d32bb9d134d1fe90b8979c06cf81ff610858f48fd89fff4850d8e72bb6a2a2c7d634e1b"
      UKI_EXPECT="f03d2f8d4d0ee09f61a934ea5112930d5a1b20bdef3833cfe085a9b0f4720e8025b0940353591eed89a4a319d4546309771306233c60b873e7f2235169fdefea"
      ;;
    *) return 1 ;;
  esac
}

# plog MSG... : timestamped line to stdout and (outside dry-run) progress.txt
plog() {
  local line="[$(date +%H:%M:%S)] $*"
  printf '%s\n' "$line"
  if [ "$DRY" != 1 ] && [ -n "$OUT" ] && [ -d "$OUT" ]; then
    printf '%s\n' "$line" >> "$OUT/progress.txt"
  fi
}

# run_logged LOGFILE CMD... : run CMD with output appended to LOGFILE; dry-run only prints.
run_logged() {
  local lf="$1"
  shift
  if [ "$DRY" = 1 ]; then
    printf 'DRY: %s\n' "$*"
    return 0
  fi
  "$@" >> "$lf" 2>&1
}

set_status() {
  [ "$DRY" = 1 ] && return 0
  printf '%s\n' "$1" > "$OUT/STATUS"
  plog "STATUS=$1"
}

is_uint() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  return 0
}

free_bytes() {
  df -P -B1 "$1" 2>/dev/null | awk 'NR==2 {print $4}'
}

# safe_rm PATH : the only rm in this script. Refuses anything not strictly under $OUT/work/.
safe_rm() {
  local p="$1"
  case "$p" in
    ''|*..*)
      plog "REFUSE rm (bad path): $p"
      return 1
      ;;
  esac
  case "$p" in
    "$OUT/work/"?*) ;;
    *)
      plog "REFUSE rm outside $OUT/work/: $p"
      return 1
      ;;
  esac
  if [ "$DRY" = 1 ]; then
    printf 'DRY: rm -rf -- %s\n' "$p"
    return 0
  fi
  rm -rf -- "$p"
}

has_row() {
  [ -s "$OUT/results.tsv" ] || return 1
  awk -F'\t' -v id="$1" 'NR>1 && $2==id {found=1} END {exit found ? 0 : 1}' "$OUT/results.tsv"
}

row_digest() {
  [ -s "$OUT/results.tsv" ] || return 0
  awk -F'\t' -v id="$1" 'NR>1 && $2==id {d=$4} END {print d}' "$OUT/results.tsv"
}

# emit_row PRIO ID BASE DIGEST MODE DUR
emit_row() {
  local prio="$1" id="$2" vbase="$3" digest="$4" mode="$5" dur="$6"
  local im="no" um="no" line
  if [ "$digest" = "$INST" ]; then im="yes"; fi
  if [ -n "$TARGET_UKI" ] && [ "$digest" = "$TARGET_UKI" ]; then um="yes"; fi
  line=$(printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s' "$prio" "$id" "$vbase" "$digest" "$im" "$um" "$mode" "$dur")
  printf '%s\n' "$line" >> "$OUT/results.tsv"
  plog "ROW $line"
}

write_summary() {
  [ "$DRY" = 1 ] && return 0
  [ -d "$OUT" ] || return 0
  {
    printf '# composefs matrix (%s)\n\n' "$BASE"
    printf -- '- INST: `%s`\n' "$INST"
    printf -- '- TARGET_UKI: `%s`\n\n' "${TARGET_UKI:-unknown}"
    printf '| id | digest16 | =INST | =UKI |\n|---|---|---|---|\n'
    if [ -s "$OUT/results.tsv" ]; then
      awk -F'\t' 'NR>1 {printf "| %s | %s | %s | %s |\n", $2, substr($4, 1, 16), $5, $6}' "$OUT/results.tsv"
    fi
  } > "$OUT/summary.md"
}

# mount_base : podman image mount -> M
mount_base() {
  local out rc
  if [ "$DRY" = 1 ]; then
    printf 'DRY: podman --root %s --runroot %s image mount %s   (-> M)\n' "$CT_ROOT" "$CT_RUNROOT" "$IMAGE"
    M="<M>"
    BASE_MOUNTED=1
    return 0
  fi
  out=$(podman --root "$CT_ROOT" --runroot "$CT_RUNROOT" image mount "$IMAGE" 2>> "$OUT/logs/base-mount.log")
  rc=$?
  M=$(printf '%s\n' "$out" | tail -n 1)
  M=${M%$'\r'}
  if [ "$rc" -ne 0 ] || [ -z "$M" ] || [ ! -d "$M" ]; then
    plog "base mount failed rc=$rc out='$M'"
    return 1
  fi
  BASE_MOUNTED=1
  plog "BASE mounted at $M"
  return 0
}

unmount_base() {
  [ "$BASE_MOUNTED" = 1 ] || return 0
  if [ "$DRY" = 1 ]; then
    printf 'DRY: podman --root %s --runroot %s image unmount %s\n' "$CT_ROOT" "$CT_RUNROOT" "$IMAGE"
    return 0
  fi
  if podman --root "$CT_ROOT" --runroot "$CT_RUNROOT" image unmount "$IMAGE" >> "$OUT/logs/base-mount.log" 2>&1; then
    BASE_MOUNTED=0
    plog "BASE unmounted"
  else
    plog "BASE unmount FAILED (image left mounted)"
  fi
  return 0
}

# extract_targets : read composefs=<hex> from every $M/boot/EFI/Linux/*.efi .cmdline section
extract_targets() {
  local f tmp cl val n=0 pre_ok=no
  local ukis=()
  if [ "$DRY" = 1 ]; then
    printf 'DRY: for each %s/boot/EFI/Linux/*.efi: objcopy -O binary --only-section=.cmdline <efi> <tmp>; parse composefs=<hex>\n' "$M"
    printf 'DRY: write %s/targets.txt (TARGET_UKI, UKI_PREFIX_OK)\n' "$OUT"
    return 0
  fi
  shopt -s nullglob
  ukis=( "$M"/boot/EFI/Linux/*.efi )
  shopt -u nullglob
  if [ "${#ukis[@]}" -eq 0 ]; then
    plog "no UKI found under $M/boot/EFI/Linux"
    return 1
  fi
  printf 'BASE=%s\nIMAGE=%s\nINST=%s\n' "$BASE" "$IMAGE" "$INST" > "$OUT/targets.txt"
  printf 'BASE_BOOT_MTIME=%s\n' "$(stat -c %.9Y "$M/boot" 2>/dev/null)" >> "$OUT/targets.txt"
  for f in "${ukis[@]}"; do
    n=$((n + 1))
    tmp="$OUT/logs/cmdline-$n.bin"
    if ! objcopy -O binary --only-section=.cmdline "$f" "$tmp" >> "$OUT/logs/targets.log" 2>&1; then
      plog "objcopy failed on $(basename "$f")"
      return 1
    fi
    cl=$(tr -d '\000' < "$tmp")
    val=$(printf '%s' "$cl" | grep -oE 'composefs=[0-9A-Fa-f]+' | head -n 1 | cut -d= -f2 | tr 'A-F' 'a-f')
    if [ -z "$val" ]; then
      plog "no composefs= in $(basename "$f")"
      return 1
    fi
    if [ -z "$TARGET_UKI" ]; then
      TARGET_UKI="$val"
    elif [ "$TARGET_UKI" != "$val" ]; then
      plog "conflicting composefs= values across UKIs; refusing"
      return 1
    fi
    printf 'uki=%s composefs=%s\n' "$(basename "$f")" "$val" >> "$OUT/targets.txt"
  done
  case "$TARGET_UKI" in
    "$UKI_EXPECT"*) pre_ok=yes ;;
  esac
  printf 'TARGET_UKI=%s\nUKI_EXPECT_PREFIX=%s\nUKI_PREFIX_OK=%s\n' "$TARGET_UKI" "$UKI_EXPECT" "$pre_ok" >> "$OUT/targets.txt"
  plog "TARGET_UKI=${TARGET_UKI:0:16}... uki_prefix_ok=$pre_ok (informational)"
  return 0
}

# teardown_view ID MODE : unmount (overlay only), then guarded rm of $OUT/work/ID.
# If umount fails the work dir is left in place (never rm a live mount).
teardown_view() {
  local id="$1" mode="$2"
  local W="$OUT/work/$id" R="$OUT/work/$id/root" ok=1
  if [ "$mode" = overlay ]; then
    if ! run_logged "$OUT/logs/$id.log" umount "$R"; then
      plog "TEARDOWN umount failed for $R; leaving $W in place"
      ok=0
    fi
  fi
  if [ "$ok" = 1 ]; then
    safe_rm "$W"
  fi
  return 0
}

# run_variant PRIO ID BASE CMD GATE(0|1)
# Returns 2 only for a gate view failure (no row written, caller fails the run).
run_variant() {
  local prio="$1" id="$2" vbase="$3" cmd="$4" gate="${5:-0}"
  local W="$OUT/work/$id"
  local R="$OUT/work/$id/root"
  local UP="$OUT/work/$id/upper"
  local WK="$OUT/work/$id/work"
  local LOG="$OUT/logs/$id.log"
  local mode="none" digest="" reason="" viewfail=0 rc=0 drc=0 out="" tok="" free="" t0 dur

  if [ "$DRY" = 1 ]; then
    plog "DRY RUN $id prio=$prio base=$vbase"
    printf 'DRY: mkdir -p %s %s %s\n' "$R" "$UP" "$WK"
    printf 'DRY: mount -t overlay overlay -o lowerdir=%s,upperdir=%s,workdir=%s %s   (fallback: cp -a %s/. %s/ if >= 8 GiB free)\n' "$M" "$UP" "$WK" "$R" "$M" "$R"
    printf 'DRY: (cd %s && R=%s bash -c %q)\n' "$R" "$R" "$cmd"
    printf 'DRY: podman --root %s --runroot %s run --rm --network none --entrypoint /bin/bash -v %s:/target:ro,rslave %s -c %q\n' \
      "$CT_ROOT" "$CT_RUNROOT" "$R" "$IMAGE" 'bootc container compute-composefs-digest /target'
    teardown_view "$id" overlay
    return 0
  fi

  t0=$(date +%s)
  mkdir -p "$OUT/logs" || return 1
  ACTIVE_ID="$id"
  ACTIVE_MODE="none"
  if [ -e "$W" ]; then
    plog "$id: stale work dir found; clearing"
    if grep -q " $R " /proc/mounts 2>/dev/null; then
      teardown_view "$id" overlay
    else
      safe_rm "$W"
    fi
  fi
  printf '=== %s prio=%s base=%s %s ===\n' "$id" "$prio" "$vbase" "$(date +%H:%M:%S)" >> "$LOG"
  plog "RUN $id prio=$prio base=$vbase"

  if mkdir -p "$R" "$UP" "$WK" >> "$LOG" 2>&1; then
    if mount -t overlay overlay -o "lowerdir=$M,upperdir=$UP,workdir=$WK" "$R" >> "$LOG" 2>&1; then
      mode="overlay"
      ACTIVE_MODE="overlay"
    else
      free=$(free_bytes "$W")
      if ! is_uint "$free" || [ "$free" -lt "$MIN_FREE_BYTES" ]; then
        mode="nospace"
        reason="overlay mount failed; cp fallback refused (free=${free:-unknown} B, need 8 GiB)"
        viewfail=1
      else
        ACTIVE_MODE="cp"
        if cp -a "$M/." "$R/" >> "$LOG" 2>&1; then
          mode="cp"
        else
          mode="cp-failed"
          reason="overlay mount failed; cp -a fallback failed"
          viewfail=1
        fi
      fi
    fi
  else
    mode="mkdir-failed"
    reason="could not create view dirs"
    viewfail=1
  fi

  if [ -z "$reason" ]; then
    find "$R/boot" -mindepth 0 -printf '%y %m %U:%G %T@ %p\n' > "$OUT/logs/$id.boot-before.txt" 2>/dev/null
    ( cd "$R" && R="$R" bash -c "$cmd" ) >> "$LOG" 2>&1
    rc=$?
    find "$R/boot" -mindepth 0 -printf '%y %m %U:%G %T@ %p\n' > "$OUT/logs/$id.boot-after.txt" 2>/dev/null
    if [ "$rc" -ne 0 ]; then
      reason="variant cmd exit $rc"
    else
      out=$(podman --root "$CT_ROOT" --runroot "$CT_RUNROOT" run --rm --network none \
              --entrypoint /bin/bash -v "$R:/target:ro,rslave" "$IMAGE" \
              -c 'bootc container compute-composefs-digest /target' 2>&1)
      drc=$?
      printf '%s\n' "$out" >> "$LOG"
      tok=$(printf '%s\n' "$out" | grep -oE '[0-9A-Fa-f]+' | awk 'length($0) == 128' | tail -n 1 | tr 'A-F' 'a-f')
      if [ "$drc" -ne 0 ]; then
        reason="digest run exit $drc"
      elif [ -z "$tok" ]; then
        reason="no 128-hex digest in output"
      else
        digest="$tok"
      fi
    fi
  fi

  if [ -n "$reason" ]; then
    digest="ERROR"
    plog "ERROR $id: $reason"
    tail -n 5 "$LOG" | while IFS= read -r l; do plog "    | $l"; done
  fi

  teardown_view "$id" "$ACTIVE_MODE"
  ACTIVE_ID=""
  ACTIVE_MODE="none"
  dur=$(( $(date +%s) - t0 ))

  if [ "$gate" = 1 ] && [ "$viewfail" = 1 ]; then
    return 2
  fi
  emit_row "$prio" "$id" "$vbase" "$digest" "$mode" "$dur"
  return 0
}

# run_gate : V00 must equal INST; V00-r2 must equal V00 and INST. Returns 0 pass, 2 infra, 3 METHOD_INVALID.
run_gate() {
  local rc d1 d2
  if [ "$DRY" = 1 ]; then
    plog "DRY gate: V00 must equal INST; V00-r2 must equal V00 and INST"
    run_variant 0 V00 "$BASE" "true" 1
    run_variant 0 V00-r2 "$BASE" "true" 1
    return 0
  fi
  if has_row V00; then
    plog "gate: V00 already recorded (resume)"
  else
    run_variant 0 V00 "$BASE" "true" 1
    rc=$?
    [ "$rc" -eq 2 ] && return 2
  fi
  d1=$(row_digest V00)
  if [ "$d1" != "$INST" ]; then
    plog "GATE FAIL: V00 digest ${d1:0:16} != INST -> METHOD_INVALID"
    return 3
  fi
  if has_row V00-r2; then
    plog "gate: V00-r2 already recorded (resume)"
  else
    run_variant 0 V00-r2 "$BASE" "true" 1
    rc=$?
    [ "$rc" -eq 2 ] && return 2
  fi
  d2=$(row_digest V00-r2)
  if [ "$d2" != "$INST" ] || [ "$d1" != "$d2" ]; then
    plog "GATE FAIL: V00-r2 digest ${d2:0:16} != V00 ${d1:0:16} or INST -> METHOD_INVALID"
    return 3
  fi
  plog "GATE PASS: V00 == V00-r2 == INST"
  return 0
}

# load_variants : parse $VARIANTS into VP/VI/VB/VC arrays. Returns 2 on a malformed row.
load_variants() {
  local line n=0 tabs p i b c rest
  VP=(); VI=(); VB=(); VC=()
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    case "$line" in
      ''|'#'*) continue ;;
    esac
    tabs=$(printf '%s' "$line" | tr -cd '\t' | wc -c)
    if [ "$tabs" -lt 3 ]; then
      plog "variants line $n: need 4 tab-separated columns"
      return 2
    fi
    p=${line%%$'\t'*}
    rest=${line#*$'\t'}
    i=${rest%%$'\t'*}
    rest=${rest#*$'\t'}
    b=${rest%%$'\t'*}
    c=${rest#*$'\t'}
    if [ "$p" = prio ] && [ "$i" = id ]; then
      continue
    fi
    if ! [[ "$i" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || [[ "$i" == *..* ]]; then
      plog "variants line $n: bad id '$i'"
      return 2
    fi
    if [ -z "$c" ]; then
      plog "variants line $n: empty cmd for $i"
      return 2
    fi
    VP+=("$p")
    VI+=("$i")
    VB+=("$b")
    VC+=("$c")
  done < "$VARIANTS"
  return 0
}

process_variants() {
  local n=${#VI[@]} idx pr id vb cmd order seen=" "
  [ "$n" -gt 0 ] || return 0
  order=$(for ((idx = 0; idx < n; idx++)); do printf '%s\t%s\n' "${VP[$idx]}" "$idx"; done \
            | sort -s -t "$(printf '\t')" -k1,1n | cut -f2)
  for idx in $order; do
    pr="${VP[$idx]}"
    id="${VI[$idx]}"
    vb="${VB[$idx]}"
    cmd="${VC[$idx]}"
    case "$id" in
      V00|V00-r2) plog "skip $id: reserved for the control gate"; continue ;;
    esac
    if [ "$vb" != "$BASE" ]; then
      plog "skip $id: base $vb != $BASE"
      continue
    fi
    if [ -n "$ONLY" ]; then
      case ",$ONLY," in
        *",$id,"*) ;;
        *) continue ;;
      esac
    fi
    case "$seen" in
      *" $id "*) plog "skip $id: duplicate id"; continue ;;
    esac
    seen="$seen$id "
    if [ "$DRY" != 1 ] && has_row "$id"; then
      plog "resume: $id already in results.tsv"
      continue
    fi
    run_variant "$pr" "$id" "$vb" "$cmd" 0
  done
  return 0
}

cleanup() {
  local rc=$?
  if [ -n "$ACTIVE_ID" ]; then
    teardown_view "$ACTIVE_ID" "$ACTIVE_MODE"
    ACTIVE_ID=""
    ACTIVE_MODE="none"
  fi
  unmount_base
  if [ "$DRY" != 1 ] && [ -f "$OUT/STATUS" ] && [ "$(cat "$OUT/STATUS")" = RUNNING ]; then
    set_status FAILED
  fi
  write_summary
  exit "$rc"
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --base|--variants|--out|--only)
        [ $# -ge 2 ] || die_usage "missing value for $1"
        case "$1" in
          --base) BASE="$2" ;;
          --variants) VARIANTS="$2" ;;
          --out) OUT="$2" ;;
          --only) ONLY="$2" ;;
        esac
        shift 2
        ;;
      --dry-run)
        DRY=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die_usage "unknown argument: $1"
        ;;
    esac
  done
}

main() {
  local rc
  parse_args "$@"
  case "$BASE" in
    FA02|D7E) ;;
    *) die_usage "--base must be FA02 or D7E" ;;
  esac
  [ -n "$VARIANTS" ] || die_usage "--variants <tsv> is required"
  [ -r "$VARIANTS" ] || die_usage "cannot read --variants $VARIANTS"
  [ -n "$OUT" ] || die_usage "--out <dir> is required"
  case "$OUT" in
    /*) ;;
    *) OUT="$PWD/$OUT" ;;
  esac
  OUT="${OUT%/}"
  [ -n "$OUT" ] || die_usage "--out must not be /"
  ONLY="${ONLY// /}"
  base_setup "$BASE" || die_usage "unknown base $BASE"
  if ! load_variants; then
    echo "method_v2.sh: malformed variants file $VARIANTS" >&2
    exit 2
  fi

  if [ "$DRY" = 1 ]; then
    plog "DRY RUN base=$BASE image=$IMAGE out=$OUT only=${ONLY:-all} (nothing executed, nothing written)"
    mount_base
    extract_targets
    run_gate
    process_variants
    unmount_base
    exit 0
  fi

  mkdir -p "$OUT/logs" "$OUT/work" || { echo "method_v2.sh: cannot create $OUT" >&2; exit 1; }
  [ -s "$OUT/results.tsv" ] || printf 'prio\tid\tbase\tdigest\tinst_match\tuki_match\tmode\tduration_s\n' > "$OUT/results.tsv"
  set_status RUNNING
  trap cleanup EXIT
  trap 'exit 130' INT TERM
  plog "START base=$BASE out=$OUT only=${ONLY:-all} variants=${#VI[@]}"

  if ! mount_base; then
    set_status FAILED
    exit 1
  fi
  if ! extract_targets; then
    set_status FAILED
    exit 1
  fi
  run_gate
  rc=$?
  case "$rc" in
    0) ;;
    2)
      set_status FAILED
      exit 1
      ;;
    *)
      set_status METHOD_INVALID
      exit 3
      ;;
  esac
  process_variants
  set_status DONE
  exit 0
}

if [ "${METHOD_V2_SOURCE_ONLY:-0}" != 1 ]; then
  main "$@"
fi
