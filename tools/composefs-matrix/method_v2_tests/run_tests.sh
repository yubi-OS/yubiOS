#!/usr/bin/env bash
# Stub-based tests for method_v2.sh. Run: bash method_v2_tests/run_tests.sh
# Stubs for podman, objcopy, mount, umount, bootc and df live in fakebin/ and are put first on PATH.
# Nothing here touches real containers or mounts; rm only runs under mktemp dirs.
set -u
set -o pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT="$HERE/../method_v2.sh"
FAKEBIN="$HERE/fakebin"
TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/mv2test.XXXXXX") || exit 1
trap 'case "$TMPROOT" in */mv2test.*) rm -rf -- "$TMPROOT" ;; esac' EXIT

INST_FA02="a3156f146d291ec7f087d849fdeca1328067f73b243a0cc6502576bcd1427ead93458e6bdd6412fa76a2c94cfdb812ea9af56580b67053d21a5940ee1e853d25"
INST_D7E="f074a281da7257fa300eeffeec5c376208541789c18f61dc7381da698d32bb9d134d1fe90b8979c06cf81ff610858f48fd89fff4850d8e72bb6a2a2c7d634e1b"
UKI_FIX="0235777b$(printf 'e%.0s' $(seq 120))"
WRONG="$(printf '0%.0s' $(seq 128))"

PASS=0
FAIL=0
FAILED=()
CASE=""
OUTDIR=""
VARIANTS=""
RC=0

ok()    { PASS=$((PASS + 1)); printf '  ok    %s\n' "$1"; }
bad()   { FAIL=$((FAIL + 1)); FAILED+=("$1"); printf '  FAIL  %s\n' "$1"; }
check() { local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name"; fi; }
not()   { ! "$@"; }

chmod +x "$FAKEBIN"/* 2>/dev/null

write_variants() { # $1 = cmd for V02; V01 and V03 are fixed
  {
    printf 'prio\tid\tbase\tcmd\n'
    printf '10\tV01\tFA02\ttouch "$R/marker-V01"\n'
    printf '20\tV02\tFA02\t%s\n' "$1"
    printf '30\tV03\tFA02\ttouch "$R/marker-V03"\n'
  } > "$VARIANTS"
}

new_case() { # $1 = case name; fresh fixture base, fake env defaults
  CASE="$TMPROOT/$1"
  mkdir -p "$CASE/mnt/boot/EFI/Linux" "$CASE/out"
  printf 'linux-stub composefs=%s quiet\n' "$UKI_FIX" > "$CASE/mnt/boot/EFI/Linux/uki-a.efi"
  printf 'rootfs marker\n' > "$CASE/mnt/etc-marker"
  : > "$CASE/calls.log"
  : > "$CASE/map.txt"
  OUTDIR="$CASE/out/run"
  VARIANTS="$CASE/variants.tsv"
  write_variants 'touch "$R/marker-V02"'
  export PATH="$FAKEBIN:$PATH"
  export FAKE_LOG="$CASE/calls.log" FAKE_MNT="$CASE/mnt" FAKE_MAP="$CASE/map.txt"
  export FAKE_DEFAULT_DIGEST="$INST_FA02"
  unset FAKE_OVERLAY_FAIL_RE FAKE_UMOUNT_FAIL_RE FAKE_FREE_BYTES
  unset FAKE_BASE_MOUNT_FAIL FAKE_BASE_UNMOUNT_FAIL FAKE_OBJCOPY_FAIL
}

run_m2() { # args for method_v2.sh; sets RC, output in $CASE/run.out
  bash "$SCRIPT" "$@" > "$CASE/run.out" 2>&1
  RC=$?
}

row_count() { awk -F'\t' 'NR>1' "$OUTDIR/results.tsv" 2>/dev/null | wc -l | tr -d ' '; }
row_field() { awk -F'\t' -v id="$1" -v f="$2" 'NR>1 && $2==id {print $f}' "$OUTDIR/results.tsv" 2>/dev/null; }
status()    { cat "$OUTDIR/STATUS" 2>/dev/null; }

test_constants() {
  (
    export METHOD_V2_SOURCE_ONLY=1
    . "$SCRIPT"
    base_setup FA02 || exit 1
    [ "${#INST}" -eq 128 ] && [ "$INST" = "$INST_FA02" ] && [ "$UKI_EXPECT" = 0235777b ] || exit 1
    base_setup D7E || exit 1
    [ "${#INST}" -eq 128 ] && [ "$INST" = "$INST_D7E" ] && [ "${#UKI_EXPECT}" -eq 128 ] || exit 1
    exit 0
  )
}

guard_outside() {
  (
    export METHOD_V2_SOURCE_ONLY=1
    . "$SCRIPT"
    OUT="$CASE/out/guard"
    safe_rm "$CASE/outside" >/dev/null 2>&1 && exit 1
    [ -e "$CASE/outside/precious" ]
  )
}

guard_bad_paths() {
  (
    export METHOD_V2_SOURCE_ONLY=1
    . "$SCRIPT"
    OUT="$CASE/out/guard"
    safe_rm "$OUT/work" >/dev/null 2>&1 && exit 1
    safe_rm "$OUT/work/../../outside" >/dev/null 2>&1 && exit 1
    safe_rm "$OUT" >/dev/null 2>&1 && exit 1
    [ -d "$OUT/work/keep" ] && [ -e "$CASE/outside/precious" ]
  )
}

guard_allows_work() {
  (
    export METHOD_V2_SOURCE_ONLY=1
    . "$SCRIPT"
    OUT="$CASE/out/guard"
    safe_rm "$OUT/work/keep" >/dev/null 2>&1 || exit 1
    [ ! -e "$OUT/work/keep" ]
  )
}

echo "== static checks"
for f in "$SCRIPT" "$FAKEBIN"/* "$HERE/run_tests.sh"; do
  check "bash -n $(basename "$f")" bash -n "$f"
done

echo "== constants"
check "FA02/D7E INST and UKI prefix constants are 128-hex and correct" test_constants

echo "== happy path (FA02)"
new_case happy
printf 'V02 %s\n' "$UKI_FIX" > "$CASE/map.txt"
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "happy: exit 0" test "$RC" -eq 0
check "happy: STATUS=DONE" test "$(status)" = DONE
check "happy: 5 result rows (V00, V00-r2, V01, V02, V03)" test "$(row_count)" -eq 5
check "happy: V00 digest == INST" test "$(row_field V00 4)" = "$INST_FA02"
check "happy: V00-r2 digest == INST" test "$(row_field V00-r2 4)" = "$INST_FA02"
check "happy: V01 inst_match=yes" test "$(row_field V01 5)" = yes
check "happy: V02 digest equals UKI -> uki_match=yes" test "$(row_field V02 6)" = yes
check "happy: V02 inst_match=no" test "$(row_field V02 5)" = no
check "happy: mode is overlay" test "$(row_field V01 7)" = overlay
check "happy: targets.txt TARGET_UKI matches fixture" grep -qx "TARGET_UKI=$UKI_FIX" "$OUTDIR/targets.txt"
check "happy: targets.txt UKI_PREFIX_OK=yes" grep -qx 'UKI_PREFIX_OK=yes' "$OUTDIR/targets.txt"
check "happy: summary.md has V01 row" grep -Fq "| V01 | ${INST_FA02:0:16} | yes | no |" "$OUTDIR/summary.md"
check "happy: progress.txt mirrors ROW lines" grep -q 'ROW .*V01' "$OUTDIR/progress.txt"
check "happy: base image mounted and unmounted via podman" bash -c "grep -q 'image mount' '$CASE/calls.log' && grep -q 'image unmount' '$CASE/calls.log'"
check "happy: digest run is --network none with rslave target" bash -c "grep -q -- '--network none' '$CASE/calls.log' && grep -q 'rslave' '$CASE/calls.log'"
check "happy: host bootc never invoked" not grep -q '^bootc ' "$CASE/calls.log"
check "happy: work/V01 torn down after run" not test -e "$OUTDIR/work/V01"

echo "== control gate"
new_case gate_wrong
export FAKE_DEFAULT_DIGEST="$WRONG"
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "gate wrong: exit 3" test "$RC" -eq 3
check "gate wrong: STATUS=METHOD_INVALID" test "$(status)" = METHOD_INVALID
check "gate wrong: stops after one control digest run" test "$(grep -c 'compute-composefs-digest' "$CASE/calls.log")" -eq 1
check "gate wrong: V01 never runs" not grep -Fq "$OUTDIR/work/V01/root" "$CASE/calls.log"

new_case gate_unequal
printf 'V00-r2 %s\n' "$WRONG" > "$CASE/map.txt"
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "gate unequal: exit 3" test "$RC" -eq 3
check "gate unequal: STATUS=METHOD_INVALID" test "$(status)" = METHOD_INVALID
check "gate unequal: both control runs executed" test "$(grep -c 'compute-composefs-digest' "$CASE/calls.log")" -eq 2
check "gate unequal: V01 never runs" not grep -Fq "$OUTDIR/work/V01/root" "$CASE/calls.log"

echo "== resume"
new_case resume
mkdir -p "$OUTDIR"
{
  printf 'prio\tid\tbase\tdigest\tinst_match\tuki_match\tmode\tduration_s\n'
  printf '0\tV00\tFA02\t%s\tyes\tno\toverlay\t1\n' "$INST_FA02"
  printf '0\tV00-r2\tFA02\t%s\tyes\tno\toverlay\t1\n' "$INST_FA02"
  printf '10\tV01\tFA02\t%s\tyes\tno\toverlay\t1\n' "$INST_FA02"
} > "$OUTDIR/results.tsv"
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "resume: exit 0" test "$RC" -eq 0
check "resume: V00 control not re-run" not grep -Fq "$OUTDIR/work/V00/root" "$CASE/calls.log"
check "resume: V01 not re-run" not grep -Fq "$OUTDIR/work/V01/root" "$CASE/calls.log"
check "resume: V02 and V03 ran" bash -c "grep -Fq '$OUTDIR/work/V02/root' '$CASE/calls.log' && grep -Fq '$OUTDIR/work/V03/root' '$CASE/calls.log'"
check "resume: 5 rows total (3 seeded + V02 + V03)" test "$(row_count)" -eq 5
check "resume: V01 row not duplicated" test "$(grep -c "$(printf '\tV01\t')" "$OUTDIR/results.tsv")" -eq 1

echo "== variant ERROR does not abort"
new_case variant_error
printf 'V02 FAIL\n' > "$CASE/map.txt"
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "error: exit 0 (run completes)" test "$RC" -eq 0
check "error: STATUS=DONE" test "$(status)" = DONE
check "error: V02 digest=ERROR" test "$(row_field V02 4)" = ERROR
check "error: V02 inst_match=no" test "$(row_field V02 5)" = no
check "error: V03 still ran with INST" test "$(row_field V03 4)" = "$INST_FA02"
check "error: progress records ERROR V02" grep -q 'ERROR V02' "$OUTDIR/progress.txt"
check "error: last log lines mirrored to progress" grep -q 'crashed while computing digest' "$OUTDIR/progress.txt"
check "error: V02 log file kept" test -s "$OUTDIR/logs/V02.log"

echo "== teardown on failure"
new_case teardown_cmd_fail
write_variants 'false'
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "teardown cmd-fail: run still DONE" test "$(status)" = DONE
check "teardown cmd-fail: umount ran for V02 root" grep -Fq "umount $OUTDIR/work/V02/root" "$CASE/calls.log"
check "teardown cmd-fail: V02 work dir removed" not test -e "$OUTDIR/work/V02"
check "teardown cmd-fail: row ERROR with mode overlay" bash -c "[ \"\$(awk -F'\t' '\$2==\"V02\" {print \$4\" \"\$7}' '$OUTDIR/results.tsv')\" = 'ERROR overlay' ]"

new_case teardown_umount_fail
export FAKE_UMOUNT_FAIL_RE='/V02/root$'
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "teardown umount-fail: exit 0" test "$RC" -eq 0
check "teardown umount-fail: V02 dir kept (never rm a live mount)" test -d "$OUTDIR/work/V02"
check "teardown umount-fail: progress says leaving" grep -q 'leaving' "$OUTDIR/progress.txt"
check "teardown umount-fail: V03 dir removed normally" not test -e "$OUTDIR/work/V03"

new_case base_mount_fail
export FAKE_BASE_MOUNT_FAIL=1
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "base mount fail: exit 1" test "$RC" -eq 1
check "base mount fail: STATUS=FAILED" test "$(status)" = FAILED

echo "== writable view fallback"
new_case cp_fallback
write_variants 'test -f "$R/etc-marker" && touch "$R/marker-V02"'
export FAKE_OVERLAY_FAIL_RE='/V02/root$' FAKE_FREE_BYTES=9000000000
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "cp fallback: exit 0" test "$RC" -eq 0
check "cp fallback: V02 mode=cp" test "$(row_field V02 7)" = cp
check "cp fallback: V02 digest == INST (copy was populated)" test "$(row_field V02 4)" = "$INST_FA02"
check "cp fallback: V01 still overlay" test "$(row_field V01 7)" = overlay
check "cp fallback: V02 work dir removed" not test -e "$OUTDIR/work/V02"

new_case nospace
write_variants 'test -f "$R/etc-marker" && touch "$R/marker-V02"'
export FAKE_OVERLAY_FAIL_RE='/V02/root$' FAKE_FREE_BYTES=1000
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "nospace: exit 0 (variant-level ERROR only)" test "$RC" -eq 0
check "nospace: V02 digest=ERROR" test "$(row_field V02 4)" = ERROR
check "nospace: V02 mode=nospace" test "$(row_field V02 7)" = nospace
check "nospace: no digest run against V02 root" not grep -Fq "$OUTDIR/work/V02/root:/target" "$CASE/calls.log"
check "nospace: V03 still ran" test "$(row_field V03 4)" = "$INST_FA02"
check "nospace: progress says cp fallback refused" grep -q 'cp fallback refused' "$OUTDIR/progress.txt"

echo "== --only and --base filtering"
new_case only
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR" --only V02
check "only V02: exit 0" test "$RC" -eq 0
check "only V02: V02 row present" grep -q "$(printf '\tV02\t')" "$OUTDIR/results.tsv"
check "only V02: V01 absent" not grep -q "$(printf '\tV01\t')" "$OUTDIR/results.tsv"
check "only V02: V03 absent" not grep -q "$(printf '\tV03\t')" "$OUTDIR/results.tsv"
check "only V02: gate rows still recorded" grep -q "$(printf '\tV00-r2\t')" "$OUTDIR/results.tsv"

new_case d7e
export FAKE_DEFAULT_DIGEST="$INST_D7E"
printf 'prio\tid\tbase\tcmd\n10\tV01\tD7E\ttrue\n20\tV02\tFA02\ttrue\n' > "$VARIANTS"
run_m2 --base D7E --variants "$VARIANTS" --out "$OUTDIR"
check "D7E: exit 0 DONE" bash -c "[ '$RC' -eq 0 ] && [ \"\$(cat '$OUTDIR/STATUS')\" = DONE ]"
check "D7E: V01 digest == D7E INST" test "$(row_field V01 4)" = "$INST_D7E"
check "D7E: FA02-only row skipped" not grep -q "$(printf '\tV02\t')" "$OUTDIR/results.tsv"

echo "== dry run"
new_case dryrun
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR" --dry-run
check "dry: exit 0" test "$RC" -eq 0
check "dry: no podman/mount/umount/objcopy/rm executed" test ! -s "$CASE/calls.log"
check "dry: output dir not created" not test -e "$OUTDIR"
check "dry: prints the digest podman run" grep -q 'DRY: podman .*run --rm --network none' "$CASE/run.out"
check "dry: prints teardown rm plan" grep -q 'DRY: rm -rf' "$CASE/run.out"

echo "== argument and variant validation"
new_case args
run_m2 --variants "$VARIANTS" --out "$OUTDIR"
check "args: missing --base -> exit 2" test "$RC" -eq 2
run_m2 --base XX --variants "$VARIANTS" --out "$OUTDIR"
check "args: unknown base -> exit 2" test "$RC" -eq 2
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR" --bogus
check "args: unknown flag -> exit 2" test "$RC" -eq 2
check "args: usage error leaves out dir untouched" not test -e "$OUTDIR"
printf 'prio\tid\tbase\tcmd\n10\t../evil\tFA02\ttrue\n' > "$VARIANTS"
run_m2 --base FA02 --variants "$VARIANTS" --out "$OUTDIR"
check "args: traversal id rejected -> exit 2" test "$RC" -eq 2

echo "== prefix guard (safe_rm)"
new_case guard
mkdir -p "$CASE/out/guard/work/keep" "$CASE/outside"
: > "$CASE/outside/precious"
check "guard: refuses rm outside \$OUT/work (sibling dir survives)" guard_outside
check "guard: refuses bare work, traversal, and OUT itself" guard_bad_paths
check "guard: allows rm of \$OUT/work/<id>" guard_allows_work

echo
echo "passed: $PASS  failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf 'failed:\n'
  printf '  - %s\n' "${FAILED[@]}"
  exit 1
fi
exit 0
