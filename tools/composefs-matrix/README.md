# composefs-matrix (integrated v2)

Location note: the requested path `session/composefs-matrix/` is read-only for this subagent (only `session/subagent/` is writable). The integrated tree is here: `session/subagent/composefs-matrix/`. Move it to the canonical location if needed.

Sources (read-only inputs, all under `session/subagents/`):
- Lane A: `ses_eb06648fbffeHGKlEgZYKWuoOV/composefs-matrix/A/`
- Lane B: `ses_eb0661905ffe6nDqIG4UvMOWVt/composefs-matrix/B/`
- Lane C: `ses_eb066183effe5uXdWT71VVuN6y/composefs-matrix/C/`

| file | origin | status |
|---|---|---|
| method_v2.sh | Lane A | edited by integrator: writes BASE_BOOT_MTIME to targets.txt; writes per-row logs/<id>.boot-before.txt and .boot-after.txt. Stub suite still 90/90. |
| method_v2_tests/run_tests.sh | Lane A | unchanged. 90 checks, all pass after the edit. |
| method_v2_tests/fakebin/{bootc,df,mount,objcopy,podman,umount} | Lane A | unchanged. Stubs for the stub suite. |
| method_v2_tests/variants_fakeroot_check.py | Integrator (new) | runs every TSV command against a fake /boot tree and checks the intended end state at ns precision. 46/46 PASS. |
| variants_v2.tsv | Lane B spec, regenerated | 23 ids x 2 bases = 46 rows. Adds V21 and V22. Tiers per lead. |
| make_variants_v2.py | Lane B, edited | adds V21, V22; tier priorities; regenerates variants_v2.tsv. |
| VARIANTS-v2.md | Lane B, rewritten by integrator | lead's decision rules RA, RA2, RB, RC, RD replace lane B's; gates kept (G3, G4, G8 adjusted); V21/V22 rows; lane C predictions; nanosecond check. |
| Containerfile.main.txt | Lane B | reference only (not in the lead's list). VARIANTS-v2.md cites its line numbers. |
| BOOTC-SEMANTICS.md | Lane C | copied unchanged. Note its Q1 says /boot children are cleared before hashing; see VARIANTS-v2.md. |
| RUNBOOK.md | Integrator (new) | launch, duration (unmeasured), STATUS, resume, decisive results, stop conditions. |
| README.md | Integrator (new) | this file. |
| logs/ | Integrator | stub-tests-after-edit.log, fakeroot-check.log, dryrun-FA02.log, dryrun-D7E.log, ns-probe.txt, test-baseline (before the harness edit). |

Not copied (superseded): lane B's `VARIANTS.old.md`, `matrix.old.sh`, `old_tool_listing.txt`. `matrix.old.sh` is the in-container runner that VARIANTS-v2.md H5 says is contaminated.

No digest has been computed. rock1 was not touched. Nothing was pushed.
