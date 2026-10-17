# Walk-leg verdict and router policy v24 (2026-10-17)

Three build lines ran in parallel: router walk-clause calibration (item 1), walk-leg sign study (item 2), and AGENT.md drift (item 3). Each was pre-registered before measurement. The canonical AGENT.md copy is the KV copy, per Jenny's ruling.

## Item 1: router walk clauses, policy v24

Validation. The router's mask path reproduced the five live values (d_w and D on the gold renders) to 4e-7.

Measurements (26 artifacts: gasket positives at L 320, 352 and 384; uniform random, hexagonal and jittered-gasket negatives over 10 seeds; tri and depth-5 references).

- Frozen rule D3 (regime) failed. The depth-6 gasket positives have D from 1.559 to 1.601, so none fall in the hierarchy-spectral range [1, 1.45).
- Frozen rule D1 (direction) failed. The smallest positive d_w is 2.044 (L 384). The largest negative is 4.645 (uniform random, seed 8). The margin is -2.60.
- Under policy v23, all ten uniform-random seeds selected hierarchy-spectral. Their median d_w was 2.93, against 2.04 to 2.36 for the gasket. The one hexagonal variant also selected it. The jittered gasket was blocked by the 300-droplet floor (267 to 284 traced components).

Decision. Delete the hierarchy-spectral band. Remove the spectral.d_w clause from hierarchy-confirmed, which changes only its label, because its target is lane-draft in both versions. Keeping the band without its walk clause would have widened it to every arrangement with 300 or more droplets and D in [1, 1.45), so that variant was rejected.

Promotion. Policy v24 was promoted through the audited learnings flow: proposal l_2ae0e5c2bded4b8f, actor jenny, zero approvals expired. Live checks: health reports policy_version 24, the router selftest passes all 24 checks, and the band table no longer contains hierarchy-spectral.

Effect. Eleven uniform-random negatives move from hierarchy-spectral (lane-draft) to ordered-image (lane-classify). No gasket positive moves. The six gold calibration artifacts keep their bands.

## Item 2: walk-leg sign study

Line 2 (N = 366 and 1095, ten random seeds, pre-registered). The gasket sits below every random seed at both sizes (median gap -0.541 at 366 and -0.146 at 1095). The hexagonal control reads 2.995 at N = 366 and 2.373 at N = 1095, against an expected 2.0 plus or minus 0.15. The saturation check fails. Verdict: UNINTERPRETABLE at both sizes.

Line 2b (N = 3282, ten random seeds, hexagonal control, pre-registered). The gasket reads 2.371, the random median 2.263, and the gasket is above 10 of 10 random seeds (sign readings pass, gap +0.109). The hexagonal control reads 2.143, which passes by 0.007. The saturation check fails: the random median gap is 0.108 against a limit of 0.10, and only 4 of 10 seeds are within the limit. Walk seed 7 fails the control. Walk seed 1 passes everything. Verdict under the frozen rule: UNINTERPRETABLE.

Measurement mismatch. The router's d_w is the 64-walker walk on the mask grid. Both studies used the 4096-walker walk on the points path. The quantity the router clause reads has never been tested.

Conclusion. In the tested range the walk leg cannot carry hierarchy evidence. Routing now reads edge-standard D and the traced droplet count only. The walk d_w is diagnostic. A revisit would need a larger N, a saturation-robust estimator or a return-probability dimension, under a new pre-registration. None is scheduled.

## Item 3: AGENT.md, KV canonical

Diff check. The git mirror (tools/point-map/AGENT.md) was a strict subset of the KV copy. All 518 mirror lines appear in the KV copy in the same order, and none is replaced or removed. KV adds 78 lines in three blocks: the operator close route, the gold oracle form, and the G2 verdict line. Syncing the mirror to KV therefore loses nothing.

KV change for item 1. Three asserted replacements in the router section: the route description (walk d_w diagnostic only since v24), the band lineage (v24 entry), and the band-location note. The served bytes matched the edited copy after the propagation delay (verified on the third check, 20 seconds apart). The git mirror was then synced to the same bytes.

Content errors in the KV copy, reported and not fixed:
1. The line that says policy v21 is live is stale (health reports v24 now). The approver allowlist claim tied to v21 may be stale too.
2. Unescaped pipes in the audio path row (line 108) split a table row.
3. Unescaped pipes inside code spans split rows at lines 232, 234 and 241.
4. The placements map_url (line 235) points at /map/, which returns 410.
5. The status of the close route and the stale-dispatch sweep (lines 175 to 195) is unclear.
6. The copy has 25 em dashes on 21 lines, against the no-em-dash rule.

Decision for Jenny: fix these in KV first, then re-sync the mirror.
