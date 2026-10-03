# jev-corpus RSI round refs10 - refs/ corpus (timed unit round)

Round refs10 of the jev-corpus RSI chain, run 2026-10-03. UNIT round (cycle count 1) instrumented with wall-clock timing per runflow step, per Jenny directive ("run a unit to time it, then see if we can optimize the speed").

- Same protocol as refs9 (skill lesson 13): pin, frozen baseline check (matrix + nulls-400 audit + map + control + admission + lens snapshot), instruments, ONE atomic change, pre-register, hysteresis re-score, gate-grade audit, bearing + level_dbc gate, taskcheck, realized row before remap, snapback, rollups, record.
- NEW: every step carries a wall-clock timing entry (TIMING table in this record + the steps log). No protocol semantics changed - the timing is observational.

Status: frozen baseline check in progress.
