# jev-corpus RSI rounds refs12-16 - refs/ corpus (5 unit rounds, one PR)

Five consecutive unit rounds of the jev-corpus RSI chain, run 2026-10-03 on one branch. History wiped before the series.

- Gate: level_dbc = 20*log10(|z|) UP = improvement (claim-8 law, nulls>=400); v2.1 hysteresis; bearing read; snapback in level convention
- Decision model: **clef** (policy v6, Workers AI binding, consumed=0)
- Rounds 1-5 (refs12-refs16): one atomic change each; the scorer matrix carries rows forward for unchanged docs (hysteresis semantics for the whole matrix, per refs11 F2 recommendation) — only changed docs re-scored
- Taskcheck gates every commit

Status: round 1 baseline in progress.
