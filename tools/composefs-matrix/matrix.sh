#!/usr/bin/env bash
# composefs digest matrix (lane A): which /boot state of IMAGE makes bootc's
# compute-composefs-digest equal INSTALL_EXPECTED (installer) vs UKI_STAGE (UKI).
# Each variant runs in its own fresh container: APPLY edits /boot in the container's
# writable layer, which is discarded on exit. No image export, no tar extraction.
set -euo pipefail
IMAGE=${IMAGE:-docker.io/0mniteck/yubios@sha256:d7e662449bd853d26627971c495789ef6c2721410f4149aec6f09aedd2cb4858}
OUT=$(realpath -m -- "${OUT:-matrix-out}")
INSTALL_EXPECTED=f074a281da7257fa300eeffeec5c376208541789c18f61dc7381da698d32bb9d134d1fe90b8979c06cf81ff610858f48fd89fff4850d8e72bb6a2a2c7d634e1b
UKI_STAGE=f03d2f8d4d0ee09f61a934ea5112930d5a1b20bdef3833cfe085a9b0f4720e8025b0940353591eed89a4a319d4546309771306233c60b873e7f2235169fdefea
REF_MTIME=1792321520 # final image /boot mtime
SDE=1792321149       # SOURCE_DATE_EPOCH of that build
VARIANTS=(V00 V01 V02 V03 V04 V05 V06 V07 V08 V09 V10 V11 V12 V13 V14)
EMPTY='find /boot -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
RMEFI='rm -rf /boot/EFI /boot/yubios-diag'
T_SDE="touch -h -d @$SDE /boot"
T_REF="touch -h -d @$REF_MTIME /boot"
T_0='touch -h -d @0 /boot'
declare -A APPLY=(
  [V00]=':' [V01]="$RMEFI" [V02]="$EMPTY" [V03]="$EMPTY; $T_SDE" [V04]="$EMPTY; $T_REF"
  [V05]="$RMEFI; $T_SDE" [V06]="$RMEFI; $T_REF" [V07]="$T_SDE" [V08]="$T_REF" [V09]="$T_0"
  [V10]="$EMPTY; $T_0" [V11]='rm -rf /boot/EFI/Linux' [V12]='rm -rf /boot/EFI/systemd /boot/EFI/BOOT'
  [V13]="touch -h -d @$SDE /boot/EFI" [V14]="$T_SDE; touch -h -d @$SDE /boot/EFI"
)
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
VIEW_BIND='mount --bind / /tmp && /usr/bin/bootc container compute-composefs-digest /tmp'
VIEW_FB='mkdir -p /tmp/rootview && mount --bind / /tmp/rootview && /usr/bin/bootc container compute-composefs-digest /tmp/rootview'
jesc() { local s=$1; s=${s//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\n'/\\n}; s=${s//$'\t'/\\t}; s=${s//$'\r'/\\r}; printf '%s' "$s"; }
probe() {
  docker run --rm --privileged --entrypoint /bin/bash "$IMAGE" -c '
    echo "BOOT_MTIME=$(stat -c %Y /boot)"
    echo "EFI_MTIME=$(stat -c %Y /boot/EFI 2>/dev/null || echo null)"
    ls -A /boot | sed "s/^/CHILD=/"
    if test -x /usr/bin/bootc; then echo BOOTC=ok; else echo BOOTC=missing; fi
    if mount --bind / /tmp 2>/dev/null; then echo METHOD=bind
    elif mkdir -p /tmp/rootview && mount --bind / /tmp/rootview 2>/dev/null; then echo METHOD=fallback
    else echo METHOD=none; fi' 2>&1 || true
}
run_one() {
  local id=$1 out="" rc=null mi=false ms=false mt=null dig=null err="" toks=() cmd
  cmd="${APPLY[$id]}; $VIEW; echo RC=\$?; echo MTIME=\$(stat -c %Y /boot)"
  out=$(docker run --rm --privileged --entrypoint /bin/bash "$IMAGE" -c "$cmd" 2>&1) || true
  printf '%s\n' "$out" >"$OUT/logs/$id.log"
  rc=$(sed -n 's/^RC=//p' <<<"$out" | tail -n1); rc=${rc:-null}
  mt=$(sed -n 's/^MTIME=//p' <<<"$out" | tail -n1); mt=${mt:-null}
  read -ra toks <<<"$(grep -Eo '\b[0-9a-f]{128}\b' <<<"$out" || true)" || true
  if [ "${#toks[@]}" -eq 1 ]; then
    dig=${toks[0]}
    if [ "$dig" = "$INSTALL_EXPECTED" ]; then mi=true; fi
    if [ "$dig" = "$UKI_STAGE" ]; then ms=true; fi
  else
    err="ERROR: expected exactly one 128-hex token; raw: $(tr '\n\t|' '   ' <<<"$out" | cut -c1-500)"
  fi
  printf '%s|%s|%s|%s|%s|%s|%s|%s\n' "$id" "${DESC[$id]}" "$dig" "$rc" "$mi" "$ms" "$mt" "$err" >"$OUT/results/$id.tsv"
}
mkdir -p -- "$OUT"
rm -rf -- "$OUT/results"
mkdir -p -- "$OUT/results" "$OUT/logs"
docker pull "$IMAGE" >"$OUT/logs/pull.log" 2>&1
bl=$(probe)
printf '%s\n' "$bl" >"$OUT/logs/baseline-probe.log"
METHOD=$(sed -n 's/^METHOD=//p' <<<"$bl" | tail -n1)
case $METHOD in
  bind) VIEW=$VIEW_BIND ;;
  fallback) VIEW=$VIEW_FB ;;
  *) echo "no in-container root view works; see $OUT/logs/baseline-probe.log"; exit 2 ;;
esac
b_boot=$(sed -n 's/^BOOT_MTIME=//p' <<<"$bl" | tail -n1); b_boot=${b_boot:-null}
b_efi=$(sed -n 's/^EFI_MTIME=//p' <<<"$bl" | tail -n1); b_efi=${b_efi:-null}
bootc=$(sed -n 's/^BOOTC=//p' <<<"$bl" | tail -n1)
kids=""
while IFS= read -r c; do kids+="${kids:+,}\"$(jesc "$c")\""; done < <(sed -n 's/^CHILD=//p' <<<"$bl")
boot_is_ref=false
if [ "$b_boot" = "$REF_MTIME" ]; then boot_is_ref=true; fi
printf '{"image":"%s","method":"%s","bootc":"%s","boot_mtime":%s,"boot_mtime_is_ref":%s,"efi_mtime":%s,"children":[%s],"ref_boot_mtime":%s,"source_date_epoch":%s}\n' \
  "$(jesc "$IMAGE")" "$METHOD" "$bootc" "$b_boot" "$boot_is_ref" "$b_efi" "$kids" "$REF_MTIME" "$SDE" >"$OUT/baseline.json"
running=0
for V in "${VARIANTS[@]}"; do
  if [ "$running" -ge 3 ]; then wait -n || true; running=$((running - 1)); fi
  run_one "$V" >"$OUT/logs/$V.job" 2>&1 &
  running=$((running + 1))
done
wait || true
: >"$OUT/results.jsonl"
v00_ok=false; inst=(); stg=(); errs=()
{
  echo "# composefs digest matrix (in-container, no export)"; echo
  echo "- image: \`$IMAGE\`"
  echo "- in-container root view: \`$METHOD\`; baseline /boot mtime: \`$b_boot\`"
  echo "- INSTALL_EXPECTED: \`${INSTALL_EXPECTED:0:16}\`, UKI_STAGE: \`${UKI_STAGE:0:16}\`"; echo
  echo "| id | digest[:16] | =INSTALL | =UKI_STAGE | boot mtime in ctr | description |"
  echo "|---|---|---|---|---|---|"
  for V in "${VARIANTS[@]}"; do
    f=$OUT/results/$V.tsv
    if [ ! -s "$f" ]; then echo "$V|${DESC[$V]}|null|-1|false|false|null|ERROR: no result; see logs/$V.log" >"$f"; fi
    IFS='|' read -r id desc dig rc mi ms mt err <"$f" || true
    dj=null; ej=null
    if [ "$dig" != null ]; then dj="\"$dig\""; fi
    if [ -n "$err" ]; then ej="\"$(jesc "$err")\""; fi
    printf '{"id":"%s","description":"%s","digest":%s,"rc":%s,"matches_install":%s,"matches_stage":%s,"boot_mtime_after":%s,"error":%s}\n' \
      "$id" "$(jesc "$desc")" "$dj" "$rc" "$mi" "$ms" "$mt" "$ej" >>"$OUT/results.jsonl"
    s=ERROR
    if [ "$dig" != null ]; then s=${dig:0:16}; else errs+=("$id"); fi
    echo "| $id | \`$s\` | $mi | $ms | $mt | $desc |"
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
rm -rf -- "$OUT/results"
if [ "$v00_ok" != true ]; then echo "INVALID_BASELINE: V00 digest != INSTALL_EXPECTED"; exit 3; fi
