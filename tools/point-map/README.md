# SOS point map v0.2

Live UI: https://steady-orbit.systems-a.workers.dev/map/

Contract: [AGENT.md](AGENT.md). Audit: [wayfinder audit](../../refs/wayfinder-audit-2026-09-09.md). Source findings: [point-map spec, Addenda 12–13](../../refs/point-to-point-latent-map-2026-09-06.md).

## Test and build

Node 22+; tests have no external dependencies:

```sh
node tools/point-map/test-pointmap.js
node tools/point-map/test-api.mjs
node --test tools/point-map/test-tar.mjs
```

Numerical tests include the real 301×24 fixture. Provider/DB calls in the API suite are explicit test doubles. Live 159-reference re-embedding evidence is in `data/wayfinder-v0.2-verification-2026-09-09.json`.

Install the pinned dev dependency from this directory, then `npm run build`. `build.mjs` inserts the one canonical `pointmap.js` module into the Worker template and bundles `lib/*.mjs` with esbuild 0.25.12. The generated `worker.js` is the deployment artifact; it is not tracked as a second handwritten source.

## Cloudflare deployment mapping

Existing Worker: `steady-orbit`. Preserve its existing AI, DB, SITE and VEC bindings and secrets. No destructive schema migration. Upload `worker.js` as module `index.js`.

| SITE KV key | Source |
|---|---|
| pointmap.js | pointmap.js |
| map-app.js | app.js |
| map-index.html | index.html |
| AGENT.md | AGENT.md |
| llms.txt | llms.txt |

Back up Worker source/settings and the five keys before deployment. Compare source hashes to avoid overwriting concurrent changes; verify all five public assets and API health after propagation. The legacy marketing/chat/FIT endpoints are retained in `worker-base.js`.

## Scope and limitations

- Full-content byte coverage with explicit size bounds; lossy pooled embeddings are not semantic completeness.
- Same frozen frame plus matching instrument is required for edit comparisons. Raw embeddings up to 768-D are accepted directly.
- Geometric candidates require source inspection and an independent task verifier. No inferred NSS meaning, automatic deletions, or geometric keep/revert rule.
- `changed_input_names` and `quantization_silent_names` distinguish a changed document/embedding from unchanged binary coordinates.
- Fixed-attempt switch null, analytical identity checks, finite-sample tail estimates. Sampling convergence and predictive quality remain separate evidence requirements.
- Spectroscopy blocks are non-admitted diagnostics. No measured Raman/IR response is claimed.
- Existing map storage is shared/public. Do not submit secrets. The Sauna app mirror remains on its previous version.

## wayfinder-math/1

Eleven threshold and ADD/CHANGE ledger theorems in `papers/data/lean/WayfinderBounds.lean` are kernel-checked on core Lean 4.33.0. The scope manifest and printed-axiom checker run in the existing Lean CI job. Exact integer/count statements do not certify float error bounds or forecast quality.

Run the added suites: `node test-math.mjs`, `node test-preview.mjs`, `node test-storage.mjs`. Math tests include 38,172 exhaustive graph cases and the compact historical maps 51–61 fixture. Their ten exact replays are retrospective. `pointmap.baseline.js` is a test-only historical oracle, never served to the UI.

The `/api/map/preview` endpoint validates every untouched source SHA256 and frozen anchor, computes an actual candidate without inserting a map, and returns a named-neighbour ledger and margins. UI previews preserve the saved baseline. Homepage source now lives in `home.html`; deploy it to SITE KV `index.html`. Copy agent guide fetches `/AGENT.md` as the sole source.

Storage packs diagnostic objects losslessly into numeric tuples; API reads decode the same public fields. A 400×768,d=24 test stores 1,294,143 bytes rather than the 2,100,906-byte expanded object. The safe storage cap is 1.9 MB; oversize persistence returns 413 instead of silently dropping diagnostics.
