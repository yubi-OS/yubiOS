# composefs variant matrix v2 (integrated: lanes A, B, C)

Status: definitions and rules only. No digest has been computed in this integration pass. rock1 was not touched. Nothing was pushed. Decision: NOT DECIDED until results exist.

Files: see README.md. The matrix is `variants_v2.tsv` (header `prio<TAB>id<TAB>base<TAB>cmd`), 23 variant ids x 2 bases = 46 rows. Regenerate with `python3 make_variants_v2.py`.

## Bases and reference values

| base | image | INST (installer) | TARGET_UKI |
|---|---|---|---|
| FA02 | docker.io/0mniteck/yubios@sha256:fa02a22209108dec899281a7fff43599600564b1f05ea3e703e16714843f3ee7 | a3156f146d291ec7f087d849fdeca1328067f73b243a0cc6502576bcd1427ead93458e6bdd6412fa76a2c94cfdb812ea9af56580b67053d21a5940ee1e853d25 | read from the UKI cmdline at run time (expected prefix 0235777b) |
| D7E | docker.io/0mniteck/yubios@sha256:d7e662449bd853d26627971c495789ef6c2721410f4149aec6f09aedd2cb4858 | f074a281da7257fa300eeffeec5c376208541789c18f61dc7381da698d32bb9d134d1fe90b8979c06cf81ff610858f48fd89fff4850d8e72bb6a2a2c7d634e1b | f03d2f8d4d0ee09f61a934ea5112930d5a1b20bdef3833cfe085a9b0f4720e8025b0940353591eed89a4a319d4546309771306233c60b873e7f2235169fdefea (from old matrix.sh; confirm against the UKI cmdline, G9) |

## What changed in this integration

1. V21 (boot dir nanoseconds, same second as SDE) and V22 (V07 plus EFI nanoseconds) added. These are the nanosecond discriminators.
2. Tiers: prio 1 = V00, V07, V21, V15, V16, V03, V01, V02. prio 2 = all other variants. prio 3 = V18, V20.
3. Lane B's decision rules RA-RD replaced with the lead's rules below. Gates G1-G9 kept; G3, G4 and G8 adjusted as noted.
4. `method_v2.sh` now writes `BASE_BOOT_MTIME` to targets.txt (needed by G3) and per-row `logs/<id>.boot-before.txt` / `.boot-after.txt` listings (lane B method step 3). Lane A did neither.
5. Lane C correction: lane C's own Q1 (BOOTC-SEMANTICS.md) says `transform_for_boot` clears /boot children before hashing, and that only /boot's own nanoseconds (not seconds) are hashed under V1. That contradicts the lead's premise that V1 hashes /boot children's nanoseconds. The matrix tests the premise directly (V22; V15 vs V07). Lane C's model predicts V22 == V07 and V15 == V07.

## Nanosecond check (sandbox, GNU coreutils 8.32)

    touch -h -d @1792321149.500000000 f && stat -c '%.9Y' f  ->  1792321149.500000000
    touch -h -d @1792321149 g && stat -c '%.9Y' g            ->  1792321149.000000000

`touch -d @S.N` accepts fractional seconds and `stat %.9Y` shows them. The file must exist before `touch -h` (touch -h will not create it). Saved in logs/ns-probe.txt.

## Variant table (46 rows)

"Lane-C prediction" is what lane C's code reading implies. It is not measured. A mismatch is informative.

| prio | id | transformation | lane-C prediction | rationale |
|---|---|---|---|---|
| 1 | V00 | none | != TARGET; == INST (gate G1) | control |
| 1 | V07 | /boot dir mtime = SDE (sec, ns 0); children untouched | == TARGET (RA candidate) | the boot dir alone |
| 1 | V21 | /boot dir mtime = SDE sec + .500000000 ns; children untouched | != V07 if nanoseconds matter | NANOSECOND test |
| 1 | V15 | every /boot inode = SDE (ns 0) | == V07 | all /boot pinned |
| 1 | V16 | /boot emptied, then remaining entries = SDE | == V07 (children cleared) | stage-replica candidate (G4) |
| 1 | V03 | /boot emptied, boot dir = SDE | == V16 (G5) | same effect as V16 by another command |
| 1 | V01 | rm boot/EFI and boot/yubios-diag, boot mtime restored to base value | == V00 | presence test; base ns kept |
| 1 | V02 | /boot emptied, boot mtime = wall clock (logged) | not pinned; excluded from rules | wall-clock by design |
| 2 | V19 | rm boot/EFI, all remaining /boot = SDE | == V07 | exact stage replica if base /boot holds only EFI and yubios-diag |
| 2 | V14 | boot dir and boot/EFI = SDE | == V07 | does the EFI dir mtime add to V07 |
| 2 | V22 | V07 plus boot/EFI = SDE + .500000000 (guarded: only if boot/EFI exists) | == V07 | CHILD-NANOSECOND test |
| 2 | V08 | boot dir mtime = REF 1792321520 (ns 0) | == V07 | seconds normalised away (lane C Q1) |
| 2 | V09 | boot dir mtime = 0 | == V07 | seconds again |
| 2 | V11 | rm boot/EFI/Linux, EFI mtime restored | == V00 | does removing the UKI alone matter |
| 2 | V12 | rm boot/EFI/systemd and boot/EFI/BOOT, EFI mtime restored | == V00 | bootloader pair |
| 2 | V13 | boot/EFI dir = SDE | == V00 | EFI dir mtime alone |
| 2 | V05 | V01 + boot = SDE | == V07 | EFI removed, boot SDE |
| 2 | V06 | V01 + boot = REF | == V08 | EFI removed, boot REF |
| 2 | V04 | V02 + boot = REF | == V08 | empty boot, REF |
| 2 | V10 | V02 + boot = 0 | == V09 | empty boot, 0 |
| 2 | V17 | remove /boot, recreate empty with same mode/owner, mtime SDE; $R mtime restored | == V07 | rebuilds the dir itself |
| 3 | V18 | every inode under $R except /proc /sys /dev /run = SDE; $R = SDE | == TARGET if the difference is outside /boot | outside-/boot control |
| 3 | V20 | the stage's own SDE pass applied to the final tree (Containerfile L162-163) | == V15 (G7) | exact stage normalisation |

fakeroot check (method_v2_tests/variants_fakeroot_check.py; logs/fakeroot-check.log): all 46 rows run and reach the intended /boot state at ns precision (46/46 PASS). This validates the commands, not the digests.

## Gates

- G1 (required): V00 == INST for that base. FA02: a3156f14. D7E: f074a281. Failure: METHOD_INVALID. Stop.
- G2 (required): each digest matches `^[0-9a-f]{128}$`. A failing row is ERROR.
- G3 (required): identity for no-op transforms. Read BASE_BOOT_MTIME from targets.txt. If it equals REF, V08 must equal V00. If it equals 0, V09 must equal V00. If it equals SDE (ns 0), V07 must equal V00. On D7E the expected value is REF, so V08 must equal V00 there.
- G4 (informational): V16 and V03 are the stage replica only if base /boot has no children besides EFI and yubios-diag. V19 is the stage-replica candidate in every case. Recorded, not a rule input.
- G5 (required): determinism. V03 digest must equal V16 digest on each base. Failure: nondeterminism. Stop the run and report.
- G6 (required): consistency. If V15 == TARGET, V16 must also equal TARGET. Failure: INCONSISTENT. Report.
- G7 (required): V20 must equal V15. Failure means some non-/boot inode is not SDE in the final image (contradicts F2). Report, and treat RC as the leading reading.
- G8 (required, D7E): the D7E V07 digest must start with `f03d2f8d` (an 8-hex prefix of the 128-hex value; the full equality test is RA's own). Failure: D7E cannot satisfy RA; RA is not accepted.
- G9 (required): the `composefs=` value in each image's UKI cmdline must equal the TARGET_UKI used. If not, use the image value and flag it.
- G-err (required): ERROR rows are reported, never dropped. A rule whose inputs include an ERROR row is UNDECIDED. V02 is excluded from all rules.

## Decision rules (replaces lane B RA-RD; the lead's text)

Evaluate G1-G9 per base first. Then evaluate RA, RB, RC, RD in that order. RA is accepted only if it holds for BOTH bases; otherwise report a split.

- RA (fix = pin /boot to exact SDE in the final stage): V00 == INST AND V07 == TARGET_UKI. Expected nanosecond behaviour: V21 != V07 (confirms nanoseconds).
  - RA-NS: V21 != V07. Nanoseconds drive the digest. Confirms lane C's V1 nanosecond mechanism.
  - RA2: V07 == TARGET_UKI AND V21 == V07 AND V00 != TARGET_UKI. Nanoseconds do not matter; seconds do not either. The fix is still RA. Lane C's model was wrong.
  - Fix text: in the final stage, after the last COPY/RUN, add
    ```
    ARG SOURCE_DATE_EPOCH
    RUN touch -h -d "@${SOURCE_DATE_EPOCH}" /boot
    ```
    (ARG does not carry over to the final stage, so redeclare it there.)
  - Verify after rebuild: the new image's INST' must equal TARGET_UKI on both bases.
- RB (children matter even with exact SDE): V07 != TARGET_UKI AND V15 == TARGET_UKI. Report. Do not build a fix. This would contradict lane C's Q1 (children cleared). A fix needs an owner decision: the UKI sits in /boot/EFI/Linux (F3), so the state it would embed contains itself.
- RC (difference outside /boot): V15 != TARGET_UKI AND V18 == TARGET_UKI. Report. Do not build a fix. Confirm with G7. V18 and V20 differ only on /etc/hosts, /etc/resolv.conf, /etc/hostname, /run/systemd/resolve and under /run; the cause must be in that set. NOTE: RC needs V18, which is prio 3, so RC cannot be decided at tier 1.
- RD (none of the above): report the full table and assign no cause.

Anomaly flags (reported with any rule; they do not change the rule outcome):
- A1: V07 == TARGET but V15 != TARGET. RA holds, but pinning all children moves the digest off target. RA's fix equals the V07 state, so it still applies; flag it.
- A2: V22 != V07. Child nanoseconds matter, contradicting lane C Q1.
- A3: V08 != V07 while V21 == V07. Seconds matter, contradicting lane C's seconds normalisation.
- A4: RA and RC both hold (V07 == TARGET, V15 != TARGET, V18 == TARGET). First match (RA) wins; flag.

## Decision summary

- Gates: not evaluated. No runner output exists yet.
- Rules: NOT DECIDED.
- Known now (inputs, not results): INST_FA02, INST_D7E, D7E TARGET prefix f03d2f8d.
- Next step: run the matrix per RUNBOOK.md, evaluate G1-G9, then RA-RD.

## Containerfile facts (main, 198 lines; from lane B)

- F1 (L189-198): only the final stage writes /boot: `COPY --from=uki /out/ /boot/EFI/Linux/`, then `mkdir -p /boot/EFI/BOOT /boot/EFI/systemd`, then two `cp` calls. Nothing else.
- F2 (L162-163): the rootfs stage runs an SDE pass that excludes /proc, /sys, /dev, /etc/hosts, /etc/resolv.conf, /etc/hostname and /run/systemd/resolve, then touches `/`. The final stage has no SDE pass. D7E's final /boot mtime is 1792321520 per the old matrix.sh (a claim, not measured here).
- F3 (L179-187): TARGET_UKI is the digest of the rootfs stage, which has no EFI tree. The UKI is written into /boot/EFI/Linux in the final stage. Any digest that counts /boot children includes the UKI that carries the digest. That is circular.
- F4 (L152-157): dracut writes the initramfs under /usr/lib/modules, not /boot.
- F5 (L11): `ARG SOURCE_DATE_EPOCH` is declared only in the rootfs stage. Redeclare it in the final stage.
- F6: `/boot/yubios-diag` is written by no Containerfile step (0 code hits for "yubios-diag" in yubi-OS/yubiOS, per lane B). Its origin is unknown. V01, V05, V06, V04, V10, V02 and V19 assume it exists. The probe lists /boot before those rows are read (logs/<id>.boot-before.txt).
- F7: the stage /boot is whatever fedora-bootc:45 ships. If base /boot has children other than EFI and yubios-diag, G4 applies.

## Lane C summary (BOOTC-SEMANTICS.md)

- Q1 VERIFIED-FROM-CODE: `transform_for_boot` clears /boot children and sets /boot's mtime seconds to /usr's seconds; nanoseconds are kept. V1 EROFS hashes nanoseconds and the image-wide minimum mtime; V2 hashes seconds only. Source reading, not run.
- Q2: the installer computes the expected digest from OCI layer tar entries, not from /target. Nanosecond differences between the two representations are a candidate cause (HYPOTHESIS).
- Q3: the bootc sealed-images pattern runs ukify on a split stage, then COPY into /boot/EFI/Linux (DOCUMENTED). Strongest candidate for the mismatch (HYPOTHESIS).
- Q4: no upstream issue found that states the /boot-mtime or nanosecond mechanism (HYPOTHESIS).
- Lane C recommends splitting by EROFS version (V1 vs V2). The matrix uses bootc's default (`compute-composefs-digest` defaults to V1, cli.rs:450). A V2 pass is NOT in this matrix; add one only if the owner asks.

## Revision notes

- Lane B RA-RD removed. Lane B RB and RC used V16/V19; now RB and RC use V15 per the lead.
- Lane B G4 used V19 as a fallback for RB/RC; now informational.
- Lane B's prio-1 description ("V00, V07, V15, V16, V03, V19, then the rest") is replaced by the tier list above.
