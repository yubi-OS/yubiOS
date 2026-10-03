# jev-corpus RSI round refs7 - refs/ corpus

Round refs7 of the jev-corpus RSI chain, run 2026-10-03. FIRST ROUND under the corrected gate (the refs6 post-round level_dbc correction).

- Corpus pinned at main (see steps.log; 252 docs x 12 NSS axes after the refs6 record landed)
- Gate: level_dbc = 20*log10(|z|) UP = improvement (verify_claims.py claim-8 law); gate-grade audits at nulls>=400; v2.1 hysteresis on every edited-row re-score
- Bearing read: predicted (lens, level convention) vs realized (level convention) - aligned+meaningful = keep, aligned+tiny = small-but-real, inverted = revert, zero = no-flip; positive realized level deltas never auto-dropped
- Lens runs with the ledger-derived skip-list (declined/reverted doc+axis pairs)
- Frozen task check (tools/point-map/taskcheck_refs.sh C1-C7) gates every commit
- First cycles: pre-registered revert of the merged roadmap axis8 edit (z regression, ledger rows 1370), re-application of the two improvements the dbc gate dropped (ledger rows 1372/1374)

Status: baseline in progress. This record is appended as cycles land.
