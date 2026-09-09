# Point-to-point map for unlabeled latent space: from `CurvedCorpus.lean` + curve-compass to a browser/Worker module

**2026-09-06.** Source ingest: 99 `#github-yubios` skills (curve family read in full: `curve-compass-skill`, `curved-corpus-create`, `single-action-curve-rsi`, `hyperspherical-harmonic-curve`, `learned-latent-curve`, `ideate-solo`), `papers/README.md`, `papers/data/lean/CurvedCorpus.lean` (1285 lines, §§1–15), `tools/injective-mapping` (D6), and the deployed `sos-agent` app (`fit.ts`, `latent.ts`). Framing log: `session/point-map-solo-2026-09-06.md` (ideate-solo, 7 variations, V4 won 19/20).

## 0. One sentence

An item is a **key** (row ordinal + content hash), a **state** (a binary vector under a stated binarization rule), a **place** (k-shell + S² point + geodesic gap to the ideal pole), and an **edge set** (atom moves, curveball trades, slerp bridges); every edge carries a **certificate** naming the Lean theorem it shadows and the float check that passed, and the whole thing is one dependency-free TypeScript module that runs identically in the browser and in a Cloudflare Worker.

## 1. What the proof gives us, and what it doesn't

`CurvedCorpus.lean` proves identities over exact arithmetic. The scope block disowns every measurement claim. That split is the design axis of this scheme:

| Lean § | Theorem | Runtime shadow in the map | Class |
|---|---|---|---|
| 1 | `atom_delta_nonneg` | every atom edge asserts `Δ = d_pre − d_post ≥ 0` | identity |
| 2–3 | `corpus_sum_nonneg`, `cumulative_monotone` | a path of atom edges asserts running Σ Δ non-decreasing | identity |
| 4 | `gate_rank_identity` | the V₂ ≥ 0.40 gate is *reported* as `r̂ = 2/V₂ ≤ 5`, never as evidence | identity |
| 5 | `phi_ladder_telescope` | Φ(0) − Φ(d) = Σ drops; checked on the empirical ladder | identity |
| 6 | `heat_exponent_monotone/additive` | spectral defocus E_ℓ(t) = E_ℓ(0)·e^{−2ℓ(ℓ+1)t}; assert exponents ordered | identity |
| 7 | `mh_flux_symm` | compass edge acceptance uses `min(1, e^{−ΔF/T})`; flux J(k↔k+1) symmetry checked | identity |
| 8 | `trade_preserves_rowSum/colSum` | every curveball trade asserts row + column sums unchanged | identity |
| 9–10 | `trade_reversible`, `stationary_unique_uniform` | null draws are reported as samples of THE uniform law on the fibre (irreducibility is checked per instance, not assumed) | identity + instance check |
| 14 | `heat_exp_dominates_hamming` | k-shell (Hamming) spectrum shown beside the S² spectrum; sphere is the harsher idealization | identity |

**Not shadowed, by design:** null adequacy, MC convergence, float ≡ real. Those become *measurement* certificates (below) that can honestly fail.

## 2. Inputs: what "unlabeled latent space" means here

Input is `{ vectors: number[][], ids?: string[], rule?: BinarizationRule }`. Vectors are anything: Workers AI embeddings (`@cf/baai/bge-base-en-v1.5`, 768-D), PCA scores, raw feature rows. No primitive names, no slugs.

### 2.1 Identity layer (D6 lesson, non-negotiable)

`key = { ordinal: i, hash: fnv1a64(float32 bytes of vectors[i]), label?: ids[i] }`. D6 showed 2286 items → 176 measurement classes and 117 duplicate slugs; only the ordinal is injective. The map is 1-to-1 **as keyed rows**; the measurement subspace is many-to-one and the collision histogram is printed, not hidden.

### 2.2 Binarization rule (compass constraint: "continuous data must be binarized under a stated rule")

Default rule `R0`:
1. Choose `d` (default 9, hard cap 24; C1 says never compare V₂ across d).
2. Axes = top-d principal directions of the centered cloud (or the raw dims when D ≤ d).
3. `bit_j = [score_j > median_j]`.

Consequences worth stating on the artifact: R0 fixes every **column** margin at ⌈N/2⌉, so the curveball fibre is the set of N×d binary matrices with those column sums *and* the observed row sums. `rule_hash = sha256(JSON{d, axes, medians})` is part of the map's identity: two maps are comparable only if `rule_hash` matches (same discipline as `baseline_id` in sos-agent).

Alternative rules the module accepts but does not default to: `Rq` (per-column quantile q ≠ 0.5), `Rabs` (sign of the coordinate, for signed embeddings). Each is a different fibre; the artifact says which.

## 3. Placement (item → point)

Same conventions as `sos-agent/fit.ts` and D6 so the outputs are comparable:

- `k = Σ bits` (Hamming shell, 0..d)
- z-score the bit matrix → PCA top-2 → stereographic lift with `s = 0.9 / max‖uv‖` → `p ∈ S²`
- `pole p* = lift(project(1_d))` (the "covers everything" corner), `gap = chordal(p, p*)`
- `Φ(k) = mean gap over shell k` (the empirical ladder; `Φ(d)` uses the measured value, never the 0.0 sentinel)

Two spectra are reported side by side: SH ℓ≤3 shares `E_ℓ` of the point cloud on S², and the Krawtchouk/shell occupancy on H(d,2). The S² one is the idealization; §14 says its level penalty is strictly harsher.

## 4. Edges (point → point)

### 4.1 Atom edges (single-action-curve-rsi, T → 0)
For item i, candidates = { flip one 0→1 } ∪ { identity }. Select the minimizing post-distance. Emit edge `(i → i')` with `Δ`, `|dk| = 1`, and certificate `{ theorem: "atom_delta_nonneg", ok: Δ ≥ 0 }`. A path of atoms carries `{ theorem: "cumulative_monotone", ok: prefix sums non-decreasing }`. Edges with `ok = false` are not rendered and are counted as bugs, not findings.

### 4.2 Compass edges (designed dynamics, T > 0)
Signed ± proposal, Metropolis on `F_T(k) = Φ(k) − T·log C(d,k)`. Emit the k-marginal `π_T(k)`, `<k>`, `Var[k]`, acceptance, and `T_×` by bisection on `argmax π_T`. Certificates: `mh_flux_symm` (|z(J)| ≤ 3 per rung), quantization (`max|dk| = 1`). Everything here is a property of the designed chain; the artifact carries the wall sentence verbatim from the compass skill.

### 4.3 Null edges (curveball trades, the vacuum)
A trade picks rows i≠j, columns a≠b with `M[i,a]=1, M[i,b]=0, M[j,a]=0, M[j,b]=1` and swaps. Certificate per trade: row sums and column sums unchanged (`trade_preserves_rowSum/colSum`). K draws (default 100) of ≥ 5·N·d trades each give `E₀[V₂], SD₀[V₂]` and hence `ΔV₂z`. **Membership check:** if `SD₀ < 1e-3` the coordinate is inadmissible and the map says so rather than printing a z. Optional instance check: on tiny fibres (N·d ≤ 12 bits), enumerate and confirm connectivity (CLAIM 6 pattern).

This replaces sos-agent's column-permutation null. Column permutation destroys row margins and is a different (weaker) medium; the Lean file certifies the fixed-margin one.

### 4.4 Bridge edges (slerp, the continuous half)
`slerp(p, q; t) = [sin((1−t)Ω) p + sin(tΩ) q] / sin Ω`, `cos Ω = p·q`. Between an item and the pole (bloom parameter t ∈ [0,1], replacing the k ladder) or between any two items (point-to-point transport). Rungs at constant ratio. Certificate: geodesic distance to `q` is monotone non-increasing along the rungs (the continuous Δ ≥ 0). Defocus: `E_ℓ(t) = E_ℓ(0)·e^{−2ℓ(ℓ+1)t}` printed for t ∈ {0.05, 0.2, 1}, exponents checked ordered (`heat_exponent_monotone`).

## 5. Certificates: two classes, never mixed

```ts
type Certificate = {
  theorem: string;             // Lean name, or "measurement:<name>"
  class: "identity" | "measurement";
  ok: boolean;
  detail: Record<string, number | string>;
};
```

- **identity** certificates must be 100% green. A red one halts the map and reports a code defect (float vs exact model; §4 of the Lean scope).
- **measurement** certificates (`ΔV₂z`, `PC1+PC2`, `holdout R²`, null SD floor) may be red; red is a finding. Verdicts use exclusion-only language: `excluded / not-excluded / not-tested / void`.

The compass red flag "100+ lenses all YES" is the reason for the split: a map whose every certificate is an identity would be theater.

## 6. Outputs

`MapResult` (JSON, deterministic given `seed`):

```
{ rule_hash, seed, n, d, keys[], states[], places[], ladder: {Φ[], drops[], telescope_ok},
  collisions: {classes, largest, histogram},
  edges: { atoms[], compass: {T, pi[], Tx, acceptance, flux_z[]}, null: {K, V2, E0, SD0, dV2z, admissible}, bridges[] },
  spectra: { S2: {E_l[], decay: {t, E_l[]}[]}, hamming: {shell_counts[]} },
  certificates: Certificate[] }
```

## 7. Deployment shape (why this fits the SOS Worker)

- One module `pointmap.ts`, stdlib TS, no npm deps (Jacobi eigensolver, ridge, PRNG already exist in `fit.ts` and are reused verbatim).
- **Browser:** `<script type="module">` imports the same file; N ≤ 5,000 × d ≤ 24 with K = 100 null draws runs in well under a second on a laptop.
- **Worker:** `POST /api/map` ← `{vectors|texts, rule, seed}`. If `texts` is given, embed with the Workers AI binding (`@cf/baai/bge-base-en-v1.5`) then apply R0. Persist `MapResult` to D1 keyed by `(rule_hash, seed, content_hash)` so populations are comparable exactly like sos-agent FITs. Free-plan subrequest cap is not an issue: the whole pipeline is CPU, zero fetches after the embedding call.
- **Where it plugs into sos-agent:** replace the column-permutation null with §4.3; add `keys` (§2.1) to `FitItem`; expose atom edges + slerp bridges to `client.tsx` as drawable segments. `baseline_id` semantics carry over as `rule_hash`.

## 8. MVP (client-side first) and what it must show

Ship `pointmap.html` (prototype in `session/point-map/`) that:
1. loads or generates an unlabeled cloud, applies R0, prints `rule_hash` + collision histogram;
2. draws S² with points colored by k, the pole, atom edges, one slerp bridge;
3. runs K = 100 curveball draws with per-trade margin assertions and prints `ΔV₂z` or `inadmissible`;
4. runs the compass chain at one T and prints `<k>`, `π_T`, `T_×`, `max|dk|`;
5. prints the certificate table split by class.

Pre-registered outcome for the null degeneracy bet (framing log): on a 240×32 Gaussian-mixture cloud under R0, expect `SD₀[V₂] > 1e-3` (admissible). If it isn't, R0 is the wrong default and the spec changes before any Worker work.

## 9. Not doing, and why

- Full Riemannian score-based generative model in WebGPU: G5 in `papers/README`; N is tiny and atomic; months before an honest number.
- A learned "qualia" coordinate to break measurement collisions: no null exists for it (D6 epistemics).
- Treating the compass equilibrium or any z as a corpus fact: wall sentence carried verbatim.
- Comparing maps across different d or different rules: C1.

## 10. Open questions

- Is per-column median the right R0 for signed embeddings, or does `Rabs` give a more natural fibre? Test: run both on the same cloud, compare `SD₀` and `ΔV₂z`; pick the one with the healthier null, record the loser as a negative.
- Should bridge edges between two *items* (not item→pole) require their own admission null? Probably yes (uniform-on-S² rotation null); defer to v2 with V6.
- Does the Worker need the identity certificates at all, or only the browser? Keep both; a red identity cert in production is exactly the float-vs-exact signal the Lean scope block says we cannot prove away.

## 11. Addendum 2026-09-08: NSS ladder + server endpoints

**`map.nss` (in every MapResult).** The S² placement is cut into 12 azimuthal sectors (30° each, by φ), one per negative-skill-space axis in canonical order: Audience, Inputs, Outputs, Mode, Assumption set, Adjacent problems, Failure modes, Lifecycle, Composition, Knowledge sources, Calibration, Recursion. Sector counts and empty sectors are reported. Then three candidate atomic actions are generated and each is *refit and measured*, never asserted:

- **add** — a bit pattern that lands in the thinnest sector (3 co-located copies, so the refit sees a real mass shift);
- **change** — flip the single-action atom bit (Lean §1) on one of the top-3 atoms;
- **remove** — drop the most isolated point / the point farthest from the all-ones pole.

Each candidate records `delta = {pole_shift_geodesic, occupied_sectors_delta, isolated_delta, pc12_delta}`, a `score`, and `verdict` ("moves" iff |pole shift| > 0.02 rad or any sector/isolation count changes). Candidates are ranked into `ladder` L1–L5 with `hypothesis / method / delta / verdict / score / caveat / recommendation`; the recommendation is plain English ("Add 3 items that cover bit 2 and bit 7 but not bits 0, 1, 4 … pole shifts 0.033 rad, isolated −8"). `ideal` selects the rung the caller wants to treat as the target (request field `ideal`, 1–5, default 1); `recommendation` echoes that rung's text. The wall still holds: every number is a property of the refit under the same `rule_hash`; a re-embed of new text lands *near*, not on, the synthetic pattern (stated in `caveat`).

**Server endpoints (steady-orbit Worker).** `POST /api/map {vectors | texts, d, seed, T, K≤40, threshold, ideal, labels}` → `{id, map}`; `GET /api/maps`, `GET|DELETE /api/maps/:id`; `POST /api/embed {texts, source}` → bge-base-en-v1.5 768-D vectors, every embedding also stored in Vectorize `sos-embeddings` (id `e<FNV>`, metadata label/text/source/created); `POST /api/repo-items {repo, subdir}` → one item per text file from the repo tarball (codeload, max 400); `POST /api/vector/search {text, topK}` → cosine neighbours over everything ever embedded. The Sauna `sos-agent` app mirrors `/api/map(s)` for vectors only (no Vectorize there). The `/map/` page renders the ladder under the Wall with a radio per rung; picking a rung re-reads `last.nss.ladder[i].recommendation` client-side and sends `ideal` on the next run.

Request field `names` (string[] aligned with the vectors) carries each item's file name; the ladder's change/remove text cites it ("Remove item #212 (skills/foo/SKILL.md)") and falls back to the label, then the ordinal.

**Wayfinder prompt (2026-09-08).** Every rung carries `prompt`: a copy-ready instruction naming the literal file to open (`change`, `remove`), the nearest neighbour to fold into (`remove`), or the exemplar files to model new content on (`add`, `change`), plus the re-run check (same d/seed/threshold, `rule_hash` must match, predicted pole/occupied/isolated deltas, keep-if-sign-matches rule). `nss.prompt` echoes the ideal rung. The agent guide for the loop is served at `/AGENT.md` (source `tools/point-map/AGENT.md`).

## 12. Addendum 2026-09-09: field findings from the first refs/ wayfinder loop

First full loop on the `refs/` corpus (N=155 baseline, 10 map runs, worker ids 32-39, fixed instrument d=9 / seed=20260906 / threshold=median / K=40): 2 rungs kept, 5 reverted on failed sign-checks, 1 destructive `remove` declined on judgment, loop terminated at the fixpoint. Three findings for this spec:

**1. Rung predictions understate real re-embed movement by an order of magnitude.** Predictions come from applying the candidate action to the bit matrix and refitting on a frozen basis. A real edit changes every embedding, so PCA recompute moves the whole cloud: predicted pole shifts of 0.03-0.6 rad measured at 1.2-1.7 rad. Pole-shift sign is nearly always positive, so it carries no signal; `isolated_delta` is the only usable sign discriminator (5/7 applied rungs failed on it). Recommendation: weight the decision rule toward the isolated delta and treat pole-shift predictions as ordinal at best.

**2. The ingestion window is part of the instrument.** Texts are embedded from their first 2000 characters. An edit that appends structure beyond char 2000 measures exactly zero - a CHANGE rung sat invisible on the map until its new sections were restructured inside the window. Agents applying `change` rungs must land the new structure inside the first ~1800 chars; over-large restructures also overshoot (one restructure moved iso +10 against a -13 prediction and was reverted). A compact block near the top is the working pattern.

**3. `rule_hash` cannot stay constant across a live loop.** It hashes the full rule object, which embeds the per-column medians and the PCA axes - both re-derive whenever the corpus changes (N shifts, medians move). "rule_hash must match" is therefore only satisfiable on no-op re-runs of an unchanged corpus. The identity contract that matters across an iteration loop is the (d, seed, threshold, K) tuple; treat rule_hash as a run fingerprint, not a comparability key.

Also observed: the ladder walk on a fixed corpus state is deterministic (a confirming re-run reproduced the ladder exactly), so once every rung on a ladder has been measured and failed, the loop has no remaining rungs - that state is the loop's fixpoint, not a stall.


## 13. Addendum 2026-09-09: frozen-frame wayfinder v0.2

Addendum 12 correctly diagnosed drift, but its settings-tuple proposal is insufficient to compare coordinates from independently refitted PCAs. v0.2 stores the input PCA means/axes/thresholds AND binary-placement means/scales/PCA/lift as a reusable frame. `POST /api/map` with `baseline_id` projects onto that fixed instrument. Compare `frame_id` and `instrument_id`; `rule_hash` aliases the numerical frame fingerprint. Keep full unique item paths. Separately refitted maps cannot pass this comparison merely by using the same seed/d/threshold/K.

Full-text ingestion now uses Unicode-safe 400-UTF8-byte chunks, explicit BGE mean pooling, byte-weighted document pooling and L2 normalization, with content SHA256 and coverage metadata. Per-document limits reject explicitly; no first-2000-character window remains. A 159-file refs/ ingest at source commit `84785eb321b2cbb8ddc3e46a52612d86cddf9e90` matched every full-content SHA256, covering 1,852,755 bytes in 4,712 chunks. Live baseline map 45 has N=159, D=768, frame `07cb0c4994f0cc8a`, and zero failed identity certificates.

The twelve azimuthal sectors have anonymous geometric labels. Associating them with the twelve NSS axes was an unvalidated semantic inference; the NSS dictionary now states that boundary explicitly. Synthetic candidates are hypotheses, one row or one bit at a time. Pole-shift sign is retired as a keep rule, duplicate three-row fills are removed, and outliers only appear in a review-only audit. No deletion is recommended on isolation alone. Real edits require a task-specific independent verifier that stays unchanged between baseline and treatment, following EnvHarness's frozen-verifier discipline.

Numerical corrections: V2 uses covariance-trace normalization; the rank gate is separated from the gate/rank equivalence identity; analytical MH flux is separated from empirical flux; antipodal SLERP is deterministic and normalized; every false identity certificate halts before persistence. The fixed-margin sampler uses a fixed number of attempted symmetric checkerboard switches, including rejected self-loops. Stopping after successful moves sampled the jump chain, not the same stationary law. This implementation is a switch chain, not the full Curveball algorithm. Finite-sample tails and mixing uncertainty remain measurements, never Lean theorems.

Raman/IR-inspired parity and rank-block spectral summaries are explicitly non-admitted diagnostics. No dipole response, polarizability derivative, physical frequency or spectroscopic intensity has been measured. The A1, FCS, Gaunt, Pennes-loss and second-branch negatives remain in force. Passing implementation checks does not establish a 10/10 real-edit success rate.
