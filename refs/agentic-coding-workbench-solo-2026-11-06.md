# Agentic Coding Workbench (Monaco + Isomorphic-Git + 7th Coding LLM) [SOLO]

Date: 2026-11-06
Source: ideate-solo (no dialogue)
Scope class: systemic
Variations generated: 6
Finalist: V5 — Tri-Pane Live Agentic Coding Workbench (Chat/Steps Rail + Center Monaco JS/TS IDE + Right Isomorphic-Git Tree Sidebar, Driven by 7th `coding` LLM & Active Harness²)

## Problem Statement
How might we transform `/jev/` Chat whenever a coding task begins so the operator and agent collaborate inside a live browser-resident Git repository (`isomorphic-git` + `LightningFS`) with Monaco Editor center stage, step-by-step atomic code application, live refresh, mid-loop pause/interjection, and a dedicated 7th `coding` LLM category?

## Recommended Direction
Adopt **V5 (Tri-Pane Live Agentic Coding Workbench)**. When a coding-related prompt is submitted in `/jev/` Chat (or when the user selects **Code** mode / clicks **Code Workbench**), the Chat surface specializes (`data-chat-state="coding"`) into a three-zone layout:
1. **Center Stage — Monaco Editor (`vs/loader.js` + built-in JS/TS Worker):** Displays the file currently being edited with syntax highlighting, Steady Orbit / Cloudflare Worker `.d.ts` autocomplete (`addExtraLib`), live agent line-change decorations (`deltaDecorations`), an inline `Editor ↔ Diff` toggle, a **`☑ Live Refresh`** checkbox (auto-switching the editor/preview to each file as the agent touches it and running live syntax/AST checks), and a **`⏸ Pause Session`** button.
2. **Narrow Right Sidebar — Browser-Resident Local Git & Directory Browser (`isomorphic-git` + `LightningFS`):** Initializes a real in-browser `.git` repository in IndexedDB (`LightningFS`), seeded on step 1 from the user-specified remote GitHub repo, the active workspace's default repo (`yubi-OS/yubiOS` or `steady-orbit` modules), or a starter template via `/api/jev/coding/repo-init`. Shows the current branch, working-tree file hierarchy with `M`/`A`/`U`/`✓` badges, and a local commit log where each agentic step records an atomic local Git commit that can be inspected, diffed, or rolled back with one click.
3. **Left Rail — Agentic Coding Loop & Interjection Bar:** Streams each coding cycle step-by-step (Step 0: Repo Init -> Step 1..N: Plan, File Edit, Diff & Local Git Commit, Harness²/Syntax Verify) driven by the active **Harness²** configuration and the new **7th LLM Category (`coding`)** in the Policy `Select LLMs` dialog. Clicking **`⏸ Pause Session`** halts the step loop immediately after the in-flight step and pops up the **Interject New Direction** prompt input so the operator can redirect the next steps without losing local Git state.

Simultaneously, the Policy tab's **Select LLMs** dialog (`/api/jev/models` and `jev-llm.js`) expands from 6 to **7 categories**, promoting all currently active KV models to be the new canonical defaults (`classify`: `@cf/meta/llama-3.1-8b-instruct-fp8`, `draft`: `@cf/meta/llama-4-scout-17b-16e-instruct`, `guard`: `@cf/meta/llama-guard-3-8b`, `decision`: `@cf/cloudflare/clef`, `extract`: `@cf/cloudflare/clairic`, `embeddings`: `@cf/baai/bge-m3`) and adding `coding` (**Coding & Refactoring LLM**) with default `@cf/deepseek-ai/deepseek-v4.1-flash-1017` (`100/100` benchmark quality, `14/14` code score, `6.2s` latency).

## Key Assumptions to Validate
- [ ] **A1 (Browser Git + Worker Seed Speed):** `isomorphic-git` + `LightningFS` in the browser can initialize a local `.git` repository and commit working-tree files from `/api/jev/coding/repo-init` in `< 1.5s` without CORS failures.
- [ ] **A2 (Step-by-Step Pause & Interjection):** Running the agentic coding loop as discrete step calls (`/api/jev/coding/step`) lets the browser check `paused` between every file edit, immediately halting the loop and injecting the user's interjected direction into the next step's context.
- [ ] **A3 (7-Category Model Stack Backward Compatibility):** Expanding `DEFAULT_MODEL_STACK` and `MODEL_CATEGORY_SPECS` from 6 to 7 categories (`+ coding`) and promoting `llama-4-scout-17b-16e-instruct` (`draft`) and `bge-m3` (`embeddings`) preserves all existing `/api/jev/models` callers and selftests.

## MVP Scope
1. **7-Category LLM Stack (`jev-llm.js`, `routes-automations.js`, `jev-index.html`):** Add `coding` category (`@cf/deepseek-ai/deepseek-v4.1-flash-1017` default, plus `@cf/moonshotai/kimi-k2.7-code`, `@cf/qwen/qwen2.5-coder-32b-instruct`, `@cf/qwen/qwen3-30b-a3b-fp8`, etc.) and update `DEFAULT_MODEL_STACK` so `draft` defaults to `@cf/meta/llama-4-scout-17b-16e-instruct` and `embeddings` defaults to `@cf/baai/bge-m3`.
2. **Backend Agentic Coding Engine (`jev-coding.js` + `jev-console-funnel.js`):**
   - `GET|POST /api/jev/coding/repo-init` (`coding.repo_init`): Fetches file tree from a specified GitHub repo (`owner/repo`), default project repo (`yubi-OS/yubiOS`), or `steady-orbit` workspace artifacts to seed the browser's `isomorphic-git` repo.
   - `POST /api/jev/coding/plan` (`coding.plan`): Uses the active `coding` LLM + active Harness² tree/skills to decompose a coding prompt into ordered, single-file atomic edit steps (`steps: [{ step_index, file_path, action, summary, target_symbols }]`).
   - `POST /api/jev/coding/step` (`coding.step`): Executes one atomic coding step against the current file content (honoring any user interjection prompt), returns the updated code, unified diff, line range modified, commit message, and AST/syntax verification receipt.
   - `GET /api/jev/coding/selftest` (`coding.selftest`): Deterministic selftest verifying repo-init, plan, step patch generation, interjection steering, and 7-category model routing.
3. **Frontend Tri-Pane Coding Workbench (`jev-index.html`):**
   - Auto-engages when a coding prompt is sent in Chat (or via the `Code` mode pill in the chat composer).
   - Center Monaco Editor (`vs/loader.js` with fallback syntax-highlighted code/diff editor if offline/blocked) + `.d.ts` extra libs + `☑ Live Refresh` checkbox + `⏸ Pause Session` button + `Interject New Direction` popup bar.
   - Narrow right sidebar running `isomorphic-git` + `LightningFS` with directory tree, file status badges (`M`/`A`/`U`), branch indicator, and local Git commit history.

## Not Doing (and Why)
- **External Java / Eclipse JDT LS Container:** Per the Duck.ai seed conclusion, we need JS/TS/web/worker tooling, which Monaco's built-in TypeScript worker + `.d.ts` `addExtraLib` handles natively in the browser without container cold starts.
- **Un-gated remote `git push` to `main`:** All steps commit locally in browser `isomorphic-git` first; pushing to GitHub remains gated behind Policy v27 (`github.contents_put` on a scratch/PR branch).

## Open Questions
- Should the default repository when none is named in the prompt be `yubi-OS/yubiOS` (with a quick selector in the right sidebar to switch to `steady-orbit` worker modules or any `yubi-OS/*` repo)?

## Generation log (for review)
- **V1 (Inversion — Editor-First, Chat-in-Tooltip):** Replace `/jev/` Chat entirely with a full-screen IDE where chat only exists as inline code comments. *Score: Pain 3 + Switch 2 + Def 3 + Test 3 = 11/20.* (Critique: breaks non-coding operational chat workflows in `/jev/`.)
- **V2 (Constraint Removal — Full Cloud Container + WebSocket LSP Cluster):** Spawn a remote Docker container per chat turn running `typescript-language-server` and remote `git` over WebSockets. *Score: Pain 4 + Switch 2 + Def 4 + Test 1 = 11/20.* (Critique: violates the zero-container V8 Worker architecture from the Duck.ai seed and adds 5-15s cold starts.)
- **V3 (Audience Shift — Read-Only Diff Reviewer for Non-Coders):** Show only static side-by-side diffs cards in chat without an editable Monaco instance or local Git tree. *Score: Pain 2 + Switch 5 + Def 2 + Test 5 = 14/20.* (Critique: misses the interactive Monaco editor + right-sidebar local Git browser requirement.)
- **V4 (Simplification — Single-File Scratchpad Drawer):** Add a slide-over textarea with no Git state and one-shot LLM code replacement. *Score: Pain 2 + Switch 5 + Def 1 + Test 5 = 13/20.* (Critique: no `isomorphic-git`, no directory browser, no step-by-step loop.)
- **V5 (Combination — Tri-Pane Live Agentic Coding Workbench: Chat/Steps + Center Monaco JS/TS IDE + Right `isomorphic-git` Sidebar + 7th `coding` LLM):** Specializes `/jev/` Chat on coding prompts into a 3-pane workbench combining Monaco Editor (`.d.ts` intelligence, live refresh, pause/interject) + `isomorphic-git`/`LightningFS` narrow right sidebar + Harness²-guided `coding` LLM step loop. *Score: Pain 5 + Switch 5 + Def 5 + Test 4 = 19/20.* (**Justification for 5s:** Directly solves every requirement in Jenny's prompt and Duck.ai seed with zero switching cost inside `/jev/` and deep Harness² + Policy v27 integration.)
- **V6 (Combination — WebWorker AST + Multi-Candidate PPC Code Tournament):** Run `k=2` parallel `coding` LLM candidates per file step and pick the winner via Clef + AST syntax check. *Score: Pain 4 + Switch 4 + Def 5 + Test 4 = 17/20.* (Folded the AST/syntax check into V5's step verifier.)
- **Dropped below threshold (<8):** None.
- **Finalists:** V5 (19/20) and V6 (17/20).
- **Stress-test critique of winner (V5):**
  - *Strongest critique:* If a remote GitHub repo has thousands of files, cloning every blob into browser IndexedDB upfront will stall step 1.
  - *Mitigation:* `/api/jev/coding/repo-init` loads the full directory tree metadata + top working files immediately (under 200 KB) and lazy-fetches any additional file blob on demand when the agent or user clicks it, committing all touched files into `isomorphic-git` locally!
