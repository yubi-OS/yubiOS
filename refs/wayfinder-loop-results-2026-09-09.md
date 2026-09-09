# Wayfinder Frozen-Frame Loop: Round-1 Results + Round-2 Interim (2026-09-09)

Results record for the two 10-cycle SOS-wayfinder runs on the `refs/` corpus, in the same
fit-results family as `refs/cycle4-results-2026-08-06.md` and
`refs/hyperspherical-harmonic-curve-v1-fit-2026-08-05.md`. Instrument:
`steady-orbit.systems-a.workers.dev` pointmap/0.2, per `refs/wayfinder-audit-2026-09-09.md`
limitations. All facts verified live via GitHub API + the Worker's own map store on 2026-09-09.

## Round 1 (PR #229, merged 2026-09-09T19:19:22Z)

| Fact | Value |
|---|---|
| Corpus | `refs/*.md` at main, 160 files |
| Map runs | 10 (baseline + 8 edit cycles + fixpoint confirm) |
| Edits attempted | 8 |
| Edits survived (task check + sign direction) | 2 |
| Edits reverted | 6 (sign-check failures against the pre-registered rung prediction) |
| Declined | 1 destructive suggestion (removal of `refs/sbsign-pkcs11-validate-2026-07-23.md` — canonical SoftHSM cross-version signing record; declined per AGENT.md no-deletion rule) |
| Merged by | foil-copy-overrate, 2026-09-09T19:19:22Z |

Surviving round-1 edits (verified present on main at `55b68ca`):

- ADD: `refs/dhi-io-base-image-digest-rotation-2026-09-08.md`
- ADD: `refs/mkosi-tools-tree-tracking-2026-09-08.md`
- ADD: `refs/slsa-provenance-tag-verification-2026-09-08.md`
- CHANGE: `refs/point-to-point-latent-map-2026-09-06.md`
- CHANGE: `refs/vgpu-vfio-user-trust-boundary-2026-07-25.md`

Survival rate: 2 of 8 attempted edits (25%). Consistent with the audit's warning that geometric
movement does not authorize keeping content — most rung-directed edits failed their sign-check
even when the underlying documents were real.

## Round 2 (this run, branch `sos-wayfinder-refs-2026-09-09`)

Baseline: map 51, frame `f90cf5ba805322a5`, 160 docs, isolated = 43, 12/12 sectors occupied,
gate v2 = 0.303.

| Cycle | Rung | Edit | Predicted | Observed (isolated) | Verdict |
|---|---|---|---|---|---|
| 1 | L1 change | post-cycle-4 resolution table on `repo-history-skill-cycle-4` | iso −4 | 43 → 41 (−2) | KEEP (sign correct; prediction is a synthetic one-bit estimate, real edit carried more content) |
| 2 | L1 change | broken Source path + Figure D.1 fix in `appendix-D-manifold-coord` | iso −2 | 41 (0 bits, quantization-silent) | KEEP (task check passed; real broken-reference fix) |
| 3 | L2 add | `chromium-provenance-overlay-status-2026-09-09.md` (first refs/ record for OMN-165) | iso −1 | 41 → 39 (−2) | KEEP (sign correct) |
| 4 | L3 add | this doc | iso −1 | (pending map) | pending |

## Limitations

- Sign-checks compare a synthetic one-bit rung prediction against a real multi-paragraph edit;
  magnitude mismatch with correct sign is expected and recorded, not massaged.
- Quantization-silent edits (cycle 2) are invisible to the binary placement by construction;
  content verification is what keeps them.
- Isolated-count reduction is an instrument reading, not a quality score. The independent task
  checks (live API verification of every claim, append-only edits, no duplication) are the keep
  gate. `task_verdict` remains not-tested per the instrument's own contract.
