#!/usr/bin/env bash
# composefs digest matrix (lane A): which /boot state of IMAGE makes bootc's
# compute-composefs-digest equal INSTALL_EXPECTED (installer) vs UKI_STAGE (UKI).
set -euo pipefail
# Ownership feeds the composefs digest, so extraction must run as root.
if [ "$(id -u)" -ne 0 ]; then exec sudo -n -E bash "$0" "$@"; fi

IMAGE=${IMAGE:-docker.io/0mniteck/yubios@sha256:d7e662449bd853d26627971c495789ef6c2721410f4149aec6f09aedd2cb4858}
OUT=$(realpath -m -- "${OUT:-matrix-out}")
BASE=$OUT/base
VDIR=$OUT/variants
INSTALL_EXPECTED=f074a281da7257fa300eeffeec5c376208541789c18f61dc7381da698d32bb9d134d1fe90b8979c06cf81ff610858f48fd89fff4850d8e72bb6a2a2c7d634e1b
UKI_STAGE=f03d2f8d4d0ee09f61a934ea5112930d5a1b20bdef3833cfe085a9b0f4720e8025b0940353591eed89a4a319d4546309771306233c60b873e7f2235169fdefea
REF_MTIME=1792321520 # final image /boot mtime
SDE=1792321149       # SOURCE_DATE_EPOCH of that build
VARIANTS=(V00 V01 V02 V03 V04 V05 V06 V07 V08 V09 V10 V11 V12 V13 V14)
declare -A DESC=(
  [V00]="baseline, untouched"
  [V01]="rm boot/EFI + boot/yubios-diag; boot mtime not pinned (rm sets now)"
  [V02]="empty boot incl. dotfiles; boot mtime not pinned (rm sets now)"
  [V03]="V02 + boot mtime=SDE"
  [V04]="V02 + boot mtime=REF"
  [V05]="V01 + boot mtime=SDE"
  [V06]="V01 + boot mtime=REF"
  [V07]="V00 + boot mtime=SDE"
  [V08]="V00 + boot mtime=REF"
  [V09]="V00 + boot mtime=0"
  [V10]="V02 + boot mtime=0"
  [V11]="rm boot/EFI/Linux only"
  [V12]="rm boot/EFI/systemd + boot/EFI/BOOT only"
  [V13]="V00 + boot/EFI mtime=SDE"
  [V14]="V00 + boot mtime=SDE and boot/EFI mtime=SDE"
)

jesc() { local s=$1; s=${s//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\n'/\\n}; s=${s//$'\t'/\\t}; s=${s//$'\r'/\\r}; printf '%s' "$s"; }
exists() { if [ -e "$1" ]; then echo true; else echo false; fi; }
touch_m() { touch -h -d "@$2" -- "$1"; }
empty_boot() { find "$1" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; }

apply_variant() {
  local id=$1 b=$2/boot
  case $id in
    V00) ;;
    V01) rm -rf -- "$b/EFI" "$b/yubios-diag" ;;
    V02) empty_boot "$b" ;;
    V03) empty_boot "$b"; touch_m "$b" "$SDE" ;;
    V04) empty_boot "$b"; touch_m "$b" "$REF_MTIME" ;;
    V05) rm -rf -- "$b/EFI" "$b/yubios-diag"; touch_m "$b" "$SDE" ;;
    V06) rm -rf -- "$b/EFI" "$b/yubios-diag"; touch_m "$b" "$REF_MTIME" ;;
    V07) touch_m "$b" "$SDE" ;;
    V08) touch_m "$b" "$REF_MTIME" ;;
    V09) touch_m "$b" 0 ;;
    V10) empty_boot "$b"; touch_m "$b" 0 ;;
    V11) rm -rf -- "$b/EFI/Linux" ;;
    V12) rm -rf -- "$b/EFI/systemd" "$b/EFI/BOOT" ;;
    V13) touch_m "$b/EFI" "$SDE" ;;
    V14) touch_m "$b" "$SDE"; touch_m "$b/EFI" "$SDE" ;;
  esac
}

run_variant() {
  local id=$1 d=$VDIR/$1 out="" rc=0 dig=null mi=false ms=false mt err="" toks=()
  case $d in "$VDIR"/V[0-9][0-9]) ;; *) exit 1 ;; esac
  cp -al -- "$BASE" "$d" 2>/dev/null || { rm -rf -- "$d"; cp -a -- "$BASE" "$d"; }
  apply_variant "$id" "$d"
  out=$(docker run --rm --privileged -v "$d:/target" --entrypoint bootc "$IMAGE" \
        container compute-composefs-digest /target 2>&1) || rc=$?
  printf '%s\n' "$out" >"$OUT/logs/$id.log"
  mt=$(stat -c %Y "$d/boot")
  read -ra toks <<<"$(printf '%s\n' "$out" | grep -Eo '\b[0-9a-f]{128}\b' || true)" || true
  if [ "${#toks[@]}" -eq 1 ]; then
    dig=${toks[0]}
    if [ "$dig" = "$INSTALL_EXPECTED" ]; then mi=true; fi
    if [ "$dig" = "$UKI_STAGE" ]; then ms=true; fi
  else
    err="ERROR: expected exactly one 128-hex token; raw: $(printf '%s' "$out" | tr '\n\t|' '   ' | cut -c1-500)"
  fi
  printf '%s|%s|%s|%s|%s|%s|%s|%s\n' "$id" "${DESC[$id]}" "$dig" "$rc" "$mi" "$ms" "$mt" "$err" >"$OUT/results/$id.tsv"
}

mkdir -p -- "$OUT"
rm -rf -- "$BASE" "$VDIR" "$OUT/results"
mkdir -p -- "$BASE" "$VDIR" "$OUT/results" "$OUT/logs"

docker pull "$IMAGE" >"$OUT/logs/pull.log" 2>&1
cid=$(docker create "$IMAGE" /bin/true)
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT
docker export "$cid" | tar --numeric-owner -xpf - -C "$BASE"
docker rm -f "$cid" >/dev/null
trap - EXIT

b_boot=$(stat -c %Y "$BASE/boot")
b_efi=$(stat -c %Y "$BASE/boot/EFI" 2>/dev/null || echo null)
boot_is_ref=false
if [ "$b_boot" = "$REF_MTIME" ]; then boot_is_ref=true; fi
printf '{"image":"%s","boot_mtime":%s,"boot_mtime_is_ref":%s,"efi_mtime":%s,"has_efi":%s,"has_yubios_diag":%s,"has_efi_linux":%s,"ref_boot_mtime":%s,"source_date_epoch":%s}\n' \
  "$(jesc "$IMAGE")" "$b_boot" "$boot_is_ref" "$b_efi" "$(exists "$BASE/boot/EFI")" \
  "$(exists "$BASE/boot/yubios-diag")" "$(exists "$BASE/boot/EFI/Linux")" "$REF_MTIME" "$SDE" >"$OUT/baseline.json"

running=0
for V in "${VARIANTS[@]}"; do
  if [ "$running" -ge 3 ]; then wait -n || true; running=$((running - 1)); fi
  run_variant "$V" >"$OUT/logs/$V.job" 2>&1 &
  running=$((running + 1))
done
wait || true

: >"$OUT/results.jsonl"
v00_ok=false; inst=(); stg=(); errs=()
{
  echo "# composefs digest matrix"; echo
  echo "- image: \`$IMAGE\`"
  echo "- INSTALL_EXPECTED: \`${INSTALL_EXPECTED:0:16}\`, UKI_STAGE: \`${UKI_STAGE:0:16}\`"; echo
  echo "| id | digest[:16] | =INSTALL | =UKI_STAGE | description |"
  echo "|---|---|---|---|---|"
  for V in "${VARIANTS[@]}"; do
    f=$OUT/results/$V.tsv
    if [ ! -s "$f" ]; then echo "$V|${DESC[$V]}|null|-1|false|false|null|ERROR: no result; see logs/$V.job" >"$f"; fi
    IFS='|' read -r id desc dig rc mi ms mt err <"$f" || true
    dj=null; ej=null
    if [ "$dig" != null ]; then dj="\"$dig\""; fi
    if [ -n "$err" ]; then ej="\"$(jesc "$err")\""; fi
    printf '{"id":"%s","description":"%s","digest":%s,"rc":%s,"matches_install":%s,"matches_stage":%s,"boot_mtime_after":%s,"error":%s}\n' \
      "$id" "$(jesc "$desc")" "$dj" "$rc" "$mi" "$ms" "$mt" "$ej" >>"$OUT/results.jsonl"
    s=ERROR
    if [ "$dig" != null ]; then s=${dig:0:16}; else errs+=("$id"); fi
    echo "| $id | \`$s\` | $mi | $ms | $desc |"
    if [ "$mi" = true ]; then inst+=("$id"); fi
    if [ "$ms" = true ]; then stg+=("$id"); fi
    if [ "$id" = V00 ] && [ "$mi" = true ]; then v00_ok=true; fi
  done
  echo; echo "## Decision"
  echo "- equal INSTALL_EXPECTED: ${inst[*]:-none}"
  echo "- equal UKI_STAGE: ${stg[*]:-none}"
  echo "- no digest (ERROR): ${errs[*]:-none}"
  if [ "$v00_ok" = true ]; then echo "- V00 == INSTALL_EXPECTED: yes (baseline valid)"
  else echo "- V00 == INSTALL_EXPECTED: no -> INVALID_BASELINE"; fi
} >"$OUT/summary.md"

cat "$OUT/summary.md"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then cat "$OUT/summary.md" >>"$GITHUB_STEP_SUMMARY"; fi
rm -rf -- "$VDIR" "$OUT/results" "$BASE"
if [ "$v00_ok" != true ]; then echo "INVALID_BASELINE: V00 digest != INSTALL_EXPECTED"; exit 3; fi
