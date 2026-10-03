# jev-corpus RSI round refs11 - refs/ corpus (first unit round on the optimized harness)

Round refs11 of the jev-corpus RSI chain, run 2026-10-03. UNIT round (cycle count 1), run with `skills/jev-corpus-unit-round/scripts/baseline.mjs` - the optimized frozen-baseline harness shipped after refs10's timing analysis (scorer concurrency 12, parallel fetch phases). This round doubles as the harness's measured validation against the refs10 sequential numbers (~100s API time sequential -> ~38s estimate).

- Gate: level_dbc = 20*log10(|z|) UP = improvement; audits at nulls>=400; v2.1 hysteresis re-scores; bearing read; snapback in level convention
- Lens snapshot feeds /visco/mobility; rungs drive the single atomic change
- Taskcheck gates the commit

Status: frozen baseline check in progress.
