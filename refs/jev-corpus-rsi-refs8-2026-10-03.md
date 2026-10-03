# jev-corpus RSI round refs8 - refs/ corpus (structure-level round)

Round refs8 of the jev-corpus RSI chain, run 2026-10-03. First STRUCTURE-LEVEL round: the axis-fill class is closed (refs7 finding F3 - level-negative 5/5 under the corrected gate), so this round adds NEW docs authored to join isolate clusters, per the map's ADD rungs and the isolate census.

- Gate: level_dbc = 20*log10(|z|) UP = improvement; audits at nulls>=400; v2.1 hysteresis on every edited-row re-score; bearing read; snapback in level convention
- Lens runs with the ledger-derived skip-list
- Task check: taskcheck_refs.sh C1-C7 gates changes; for NEW docs the round runs the applicable subset (C1 shape, C5 axis-vocabulary, C6 grounding) - C2/C3 are change-shaped (append-only, single-section) and do not apply to a fresh file
- Adds are measured via /api/map/preview {action:add} + audit with the extended matrix

Status: baseline in progress. This record is appended as cycles land.
