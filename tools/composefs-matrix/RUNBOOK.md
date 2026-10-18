# RUNBOOK: composefs matrix v2

Scope: how to launch, read, resume and stop the matrix. Nothing in this directory has been run against a registry or host. The first real run is the first real test of the podman path. Durations are UNMEASURED.

## 0. Where to run

- A host with podman storage at `/mnt/extended/containers` (`CT_ROOT`) and runroot `/run/ct-new` (`CT_RUNROOT`). Run as root (overlay mounts).
- Do NOT run on rock1 unless its owner approves. This integration did not touch rock1.
- Needs: podman, objcopy (binutils), GNU coreutils (`touch -d @S.N`, `stat %.9Y`), findutils, awk.
- Free space: at least 8 GiB, because the cp fallback copies the whole base tree per row.

## 1. Preflight (before any digest run)

    cd <dir containing method_v2.sh>
    bash method_v2_tests/run_tests.sh              # expect: passed: 90  failed: 0
    python3 method_v2_tests/variants_fakeroot_check.py variants_v2.tsv /tmp/fakeroot-check   # expect: rows=46 failing=0
    bash method_v2.sh --base FA02 --variants variants_v2.tsv --out /tmp/dry-FA02 --dry-run   # expect exit 0, nothing written to /tmp/dry-FA02

The dry run prints the execution order. Expect: V00 and V00-r2 (gate), then prio 1 (V07, V21, V15, V16, V03, V01, V02), then prio 2, then prio 3 (V18, V20). It does not execute anything or write results.

## 2. Launch (one base at a time)

Run FA02 first. It is the control base, and D7E starts only after FA02 reaches DONE. Both bases share CT_RUNROOT and the podman storage, so concurrent runs are untested and not recommended.

    mkdir -p /mnt/extended/matrix2
    setsid nohup bash method_v2.sh --base FA02 --variants variants_v2.tsv --out /mnt/extended/matrix2/FA02 > /mnt/extended/matrix2/FA02.launch.log 2>&1 < /dev/null &

When FA02 STATUS is DONE:

    setsid nohup bash method_v2.sh --base D7E --variants variants_v2.tsv --out /mnt/extended/matrix2/D7E > /mnt/extended/matrix2/D7E.launch.log 2>&1 < /dev/null &

Each base writes 24 rows to its results.tsv: V00, V00-r2 (gate), then V01-V22 (22 rows).

## 3. Duration

UNMEASURED. No digest has run. Per row cost: overlay mount, the variant command (V18 and V20 touch the whole tree), and one podman run of `bootc container compute-composefs-digest`. Measure it from results.tsv column 8 (`duration_s`) on the V00 row, then estimate: 24 rows x that figure per base. If overlay fails and the cp fallback runs, every row copies the full tree, and the estimate changes a lot.

## 4. Reading progress and STATUS

Files in `<out>`:
- `STATUS`: `RUNNING` | `DONE` (exit 0) | `METHOD_INVALID` (exit 3) | `FAILED` (exit 1)
- `progress.txt`: timestamped log (`tail -f` it)
- `results.tsv`: one row per variant. Columns: `prio id base digest inst_match uki_match mode duration_s`
- `summary.md`: table written at exit
- `targets.txt`: BASE, IMAGE, INST, TARGET_UKI, UKI_PREFIX_OK, BASE_BOOT_MTIME
- `logs/<id>.log`: command output and digest output
- `logs/<id>.boot-before.txt`, `logs/<id>.boot-after.txt`: /boot listing before and after the command (`%y %m %U:%G %T@ %p`)

Meaning of STATUS:
- `METHOD_INVALID`: V00 or V00-r2 did not equal INST. No variant ran. Do not reinterpret the results. Find the method fault first.
- `FAILED`: infrastructure failure (base mount, UKI extraction, gate run error, or INT/TERM). Fix the cause, then resume.
- A STATUS of `RUNNING` with no live process means SIGKILL. Check `pgrep -f method_v2.sh` before resuming.

## 5. Resume

Re-run the same launch command with the same `--out`. Rows already in results.tsv are skipped, and the gate rows are reused. Stale work dirs are cleared; a live overlay is unmounted first. After a crash, check `/proc/mounts` for `<out>/work/*/root` and unmount any leftover mounts by hand if the harness cannot.

ERROR rows are skipped on resume too. To retry an ERROR row, delete its line from results.tsv and resume.

## 6. Decisive results

- After tier 1 (V07, V21, V15, V16, V03, V01, V02, plus the gates) completes on a base, RA and RB can be decided for that base. G5 and G6 can be checked. RC needs V18 (prio 3). RD needs everything.
- Report decisive results as soon as tier 1 completes on both bases. Do not wait for tier 3 for RA or RB.
- Do not stop the run because a rule resolved. Run the whole matrix so the table is complete.

## 7. Stop conditions

The run is stopped by these, and only these:
1. Gate failure (G1: V00 or V00-r2 != INST). The harness exits 3 with METHOD_INVALID. Stop. Report.
2. Infrastructure FAILED (exit 1). Fix the cause, then resume.
3. G5 failure (V03 digest != V16 digest on a base). Nondeterminism. Kill that base's run (`kill <pid>` sends TERM; the harness then sets FAILED) and report.
4. Disk: several ERROR rows with mode `nospace` or `cp-failed`. Free space, then resume (delete the ERROR rows first, per section 5).

Decision outcomes (RA, RB, RC, RD, anomalies A1-A4) are not stop conditions.

## 8. After the run

1. Copy results.tsv, summary.md, targets.txt and logs/*.boot-*.txt back into this directory under `results/<base>/`.
2. Evaluate G1-G9 per base, then RA, RB, RC, RD (VARIANTS-v2.md). Report the full table, including ERROR rows and anomalies.
3. If RA is accepted, the fix is the RA text in VARIANTS-v2.md. Verify it by rebuilding the image and checking INST' == TARGET_UKI on both bases. Do not build or push anything from this runbook.
