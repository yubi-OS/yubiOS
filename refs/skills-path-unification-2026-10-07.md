# Skills path-unification fix SPEC (2026-10-07)

Scope: `yubi-OS/yubiOS/skills/` on main. Source audit: `session/skills-path-reference-audit-2026-10-07.md` (fresh tarball of main, 131 skills / 741 companion files).

Directive (Jenny, 2026-10-07): fix the 5 dead/wrong path classes via parallel build lanes; advisor review; push to main; sync local space copies + regenerate registry.

## Canonical path vocabulary (the invariant)

1. **Repo-truth paths** — `yubi-OS/<repo>/<path>` or repo-relative (`refs/…`, `tools/…`, `papers/…`). Default for anything durable.
2. **Ephemeral session paths** — `session/…` allowed ONLY as "capture at run time" language or subagent write paths (`session/subagent/…`). Never cited as a durable input.
3. **Declared references** — host paths, connection ids, operator identity files referred to by role/label; concrete ids live only in the `-connection` skills (which document ids by design) and stay staleness-corrected, not variable-ized.

## Class rules

### R1 — Connection ids
- `conn_6rp6oRY9DBJG` (rock1 bridge, dead + deleted 2026-09-24) → `conn_W36n4EetFoNp` (radio-queue, play-audio-on-rock1, ascii-uart-animator).
- `custom-connection`: the 5 dead Cloudflare rows (`conn_GgxyXnYTg53J`, `conn_3q0lnKopzUjk`, `conn_WvQf4m8LKf1s`, `conn_IDyE2Xmk0AsM`, `conn_x7vt48bbDCmj`) → replaced by the working row `conn_pd_apn_1KhdoD7` (managed auth, account `b57ee20cd90ebc4e4db28728e450a4b8`, workers.dev subdomain `systems-a`); note the dead rows were removed from Settings.
- Truncated `conn_pd` refs → complete to the live id (`conn_pd_apn_Jjhzk0j` Linear, `conn_pd_apn_1KhdoD7` Cloudflare per context).
- All other ids are live; leave.

### R2 — `yubi-OS/agent-skills` → upstream (Jenny's "change it to upstream refs directly")
- Operative instructions (push targets, workflow steps): single target `yubi-OS/yubiOS` on `main` via Git Data API / Contents API. Remove "push to both repos" language.
- Citations of artifacts that were mirrored byte-identically → repoint to the `yubi-OS/yubiOS` equivalent path when one exists (verify plausibility; the mirror PRs were same-content pushes).
- Pure historical changelog citations with no yubiOS equivalent → keep but append "(repo retired 2026-09-24; historical)" so no future agent treats it as a live target.

### R3 — Space dirNames
- `skills/personal-WbtUgeUv/…` (paths deleted by the 2026-09-24 retirement) → in-repo path (`<skill>/scripts/…`, `<skill>/examples/…`) or `yubi-OS/yubiOS/skills/<skill>/…`.
- `skills/github-yubios-KS9n5GAT/<skill>/…` self-links → `yubi-OS/yubiOS/skills/<skill>/…` (repo-truth form).
- `memory/personal-WbtUgeUv/<file>` in OPERATIVE instructions → role wording ("the operator's personal memory space, `memory/<personal-dirname>/<file>`"); historical citations unchanged.

### R4 — Session/documents paths
Per hit, one of:
- **(a) Repoint to repo-truth** when the artifact was pushed (RSI artifacts → `yubi-OS/yubiOS/refs/…`, corpora → `yubi-OS/knowledge/…`, sources of record → `papers/…`, `tools/…`).
- **(b) Rewrite as runtime-capture** ("write to `session/` during the run") when the path describes where a run's output should land.
- **(c) Leave + annotate** `(session artifact, not repo-truth)` when purely historical changelog evidence.
- EXCLUDE vendor/upstream reference docs — `cloudflare/**`, `sandbox-*/**`, `agents-sdk/**`, `workers-best-practices/**`, `brag/slim.md` (`work/`), docker `cache/attestations`: their "session"/"work"/"cache" strings are product concepts, not Sauna paths.

### R5 — Broken `../../references/*.md` template links
5 skills (`security-and-hardening`, `shipping-and-launch`, `performance-optimization`, `test-driven-development`, `using-agent-skills`) reference checklists never committed. Try to source the canonical files from `anthropics/skills` (public repo) once; if found, ship at `<skill>/references/<file>.md` and fix the link to `references/<file>.md`; if not found, replace the link with "(reference checklist not shipped with this skill)".

## Boundaries
- Edit ONLY the assigned skill dirs. No prose rewrites beyond what a rule requires.
- Never alter frontmatter `name:`/`description:` semantics; YAML must still parse.
- Never change dates, SHAs, numbers, or verdicts — path strings only (plus the exact clause wording a rule prescribes).
- `session/subagent/…` paths are sanctioned; do not "fix" them.

## Lane partition (disjoint files)
1. **Lane 1 (smart)**: single-action-curve-rsi, repo-refs-skill, repo-history-skill
2. **Lane 2 (smart)**: jev-orchestrator (+SPEC/EVOLUTION/CAPABILITY files), jev-corpus (+SPEC-CORPUS/SPEC-VISCO), knowledge-corpus-mint (+MINT-BRIEF*), self-archaeology
3. **Lane 3 (smart)**: restful-self (+ companion), internal-big-picture, internal-nonlex-tokens, curve-guided-rsi-self, curve-guided-rsi, curve-compass-skill, hyperspherical-harmonic-curve, continuous-runtime-detection-falco, runtime-attestation-keylime, least-privilege-pod-security-standards
4. **Lane 4 (general)**: custom-connection, radio-queue (+scripts/examples), play-audio-on-rock1, ascii-uart-animator, chromium-overlay-ship, the-cult, the-follower, human-for-feasibility, prior-art-search, parallel-build-lanes, parallel-deep-research, refs-refresh-sweep, novelty-indication, pr-launch, systemd-homed, 0pointer-mastery
5. **Lane 5 (general)**: security-and-hardening, shipping-and-launch, performance-optimization, test-driven-development, using-agent-skills, token-efficiency, recursive-self-improvement, context-isolation, nss-knowledge-recursion, nss-adjacent-problems, nss-composition, nss-mode

## Output contract (per lane)
- Copy your assigned skill dirs into `session/subagent/<lane-id>/skills/` and edit THERE (sandbox write restriction).
- Write `session/subagent/<lane-id>/REPORT.md`: per file, each hit → line, old string, new string, rule applied (R1-R5), decision (a/b/c).
- Do NOT push. Do NOT touch other lanes' files.

## Advisor checks
Full-diff review: rule compliance, no over-edits, YAML still parses (`js-yaml`/python yaml), no fabricated repo paths (a repointed path must name a real repo artifact or stay annotated), no vendor-doc false positives, `session/subagent/` preserved, banned-phrase hygiene not violated by new text.

## Ship + sync
Orchestrator pushes changed files + this spec to `yubi-OS/yubiOS@main` via Git Data API (single commit), then syncs `skills/github-yubios-KS9n5GAT/` copies and regenerates `skill_registry.json`.
