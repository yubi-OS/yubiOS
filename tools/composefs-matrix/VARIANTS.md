Variant table (the matrix.sh variant list must match these ids and transformations):
- V00 baseline, untouched.
- V01 rm boot/EFI and boot/yubios-diag; boot mtime left as rm sets it.
- V02 empty all of boot; boot mtime left as rm sets it.
- V03 V02 + boot mtime SDE (1792321149).
- V04 V02 + boot mtime REF (1792321520).
- V05 V01 + boot mtime SDE.
- V06 V01 + boot mtime REF.
- V07 V00 + boot mtime SDE.
- V08 V00 + boot mtime REF; must equal V00 if V00's boot mtime is already REF.
- V09 V00 + boot mtime 0.
- V10 V02 + boot mtime 0.
- V11 rm boot/EFI/Linux only.
- V12 rm boot/EFI/systemd and boot/EFI/BOOT only.
- V13 V00 + boot/EFI mtime SDE.
- V14 V00 + boot mtime SDE and boot/EFI mtime SDE.
Hypotheses: H1 EFI presence drives the digest; H2 /boot directory mtime drives it (value-dependent); H3 the UKI stage differs from the final image outside /boot.
Gates: G1 V00 must equal INSTALL_EXPECTED or the run is INVALID; G2 each digest is 128 hex; G3 if V00's boot mtime has 0 ns, V08 must equal V00; G4 if /boot holds only EFI and yubios-diag, V03 must equal V05 and V04 must equal V06; G5 ERRORs are reported, never dropped.
Decision rules: R0 if no variant equals UKI_STAGE, conclude H3 (the stage differs outside /boot; diff the stage rootfs against the final rootfs). R1 if V03/V05/V07/V14 equal UKI_STAGE and V00/V04/V06/V08 equal INSTALL_EXPECTED, conclude H2 (boot mtime drives it); then check V13 vs V00 and V14 vs V07 to decide whether the EFI dir mtime also matters. R2 if pinned EFI-absent variants equal UKI_STAGE and pinned EFI-present variants equal INSTALL_EXPECTED, conclude H1 (EFI presence drives it). R3 if only V12 equals UKI_STAGE, inspect bootloader files. R4 any other pattern: report the full table and assign no cause.
