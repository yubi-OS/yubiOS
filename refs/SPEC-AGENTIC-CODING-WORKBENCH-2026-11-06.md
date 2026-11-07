# Spec: Agentic Coding Workbench (Monaco Editor + Isomorphic-Git Local Repo + 7-Category LLM Stack)

Date: 2026-11-06
Target System: `steady-orbit` Cloudflare Worker (`steadyorbitsystems.com/jev/`)
Companion Artifacts:
- `refs/prior-art-browser-git-monaco-ide-2026-11-06.md`
- `refs/agentic-coding-workbench-solo-2026-11-06.md`
- `refs/capability-map-agentic-coding-workbench-2026-11-06.md`

---

## 1. Objective

Add a headlining **Agentic Coding Workbench** alongside `/jev/` Chat and expand the Policy LLM Stack from 6 to **7 categories**:
1. **7-Category Model Stack (`llm-stack-7cat`):**
   - Promote all currently active KV models to be the canonical defaults for their categories:
     - `classify`: `@cf/meta/llama-3.1-8b-instruct-fp8`
     - `draft`: `@cf/meta/llama-4-scout-17b-16e-instruct`
     - `guard`: `@cf/meta/llama-guard-3-8b`
     - `decision`: `@cf/cloudflare/clef`
     - `extract`: `@cf/cloudflare/clairic`
     - `embeddings`: `@cf/baai/bge-m3`
   - Add the **7th category `coding` (`Coding Model` / `Coding & Refactoring LLM`)** with default `@cf/deepseek-ai/deepseek-v4.1-flash-1017` (`100/100` benchmark quality, `14/14` code score, `6.2s` latency, `toolCalling: Pass`), plus full selector support in `#llm-stack-dlg` (`#llm-sel-coding` and `data-cat-filter="coding"`).
2. **Interactive Agentic Coding Session (`coding-engine-api` + `monaco-git-workbench-ui`):**
   - When a coding-related prompt is submitted in `/jev/` Chat (or when the user selects the **Code** mode in the chat mode bar), the Chat workspace specializes (`data-chat-state="coding"`) into a **3-Pane Agentic Coding Workbench**:
     - **Left Rail (Agentic Coding Step Stream & Interjection Control):**
       - Displays the prompt, active Harness² badge (`tree_hash` + active skill count), active `coding` model badge, and the live step-by-step execution stream:
         - **Step 0 (`coding.repo_init`):** Initializes the browser's local Git repository (`isomorphic-git` + `LightningFS`) from the remote repo specified in the prompt, the project's default assigned Git repo (`yubi-OS/yubiOS` or `steady-orbit` workspace), or the selected repo in the right sidebar.
         - **Step 1..N (`coding.plan` -> `coding.step`):** Applies changes to the code **one step at a time**, updating the working tree in `isomorphic-git` + `LightningFS`, creating an atomic local Git commit per step, and streaming the diff + rationale.
       - **Controls:**
         - **`☑ Live Refresh` checkbox (`#coding-live-refresh`):** When checked (default ON), automatically switches the center Monaco Editor to the file currently being modified, scrolls/highlights the changed lines, and refreshes the live AST/syntax diagnostics & preview after every step.
         - **`⏸ Pause Session` button (`#coding-pause-btn`):** Immediately halts the active step loop after the current step finishes and pops up the **Interject New Direction** chat bar (`#coding-interject-bar` / `#coding-interject-input`) so the operator can inject a new instruction or course-correct the remaining steps before clicking **`▶ Resume Session`** (or **`↵ Apply Direction & Continue`**).
     - **Center Stage (`Monaco Editor` + Built-in JS/TS Language Service):**
       - Full-height **Monaco Editor** (`vs/loader.js` from CDN with resilient inline syntax/diff editor fallback) displaying the file currently being worked on.
       - Registers Steady Orbit / Cloudflare Worker `.d.ts` type definitions via `monaco.languages.typescript.typescriptDefaults.addExtraLib` and `javascriptDefaults.addExtraLib` (`Env`, `ExecutionContext`, `D1Database`, `KVNamespace`, `VectorizeIndex`, `Ai`, `HarnessTree`, `JevTask`) for instant browser-side autocomplete and hover types on the V8 path.
       - Shows open file tabs, active line range decorations (`deltaDecorations` highlighting agent-inserted/modified lines), an **`Editor` ↔ `Diff View`** toggle, and live syntax/diagnostics status in the footer.
     - **Narrow Right Sidebar (`isomorphic-git` + `LightningFS` Local Browser Git Repo & Directory Browser):**
       - Powered by **`isomorphic-git`** + **`@isomorphic-git/lightning-fs`** (IndexedDB-backed POSIX `fs` in the browser, found via `prior-art-search`).
       - Displays the repository selector / remote binding (`yubi-OS/yubiOS`, `steady-orbit`, `yubi-OS/knowledge`, or custom `owner/repo`), active branch badge (`main` / `agent/coding-*`), and working-tree status summary.
       - **Directory & File Tree Browser (`#coding-git-tree`):** Expandable folder/file hierarchy with live Git status badges (`M` modified, `A` added, `U` untracked, `✓` clean); clicking any file loads it into the center Monaco Editor.
       - **Local Git Commit Log (`#coding-git-log`):** Lists every local `isomorphic-git` commit created during the session (SHA, step title, timestamp, touched file) with one-click inspect/checkout and a gated **Stage Push / PR (`github.contents_put`)** button.

---

## 2. API & Module Contracts

### 2.1 `jev-llm.js` & `/api/jev/models` (`llm-stack-7cat`)
- `DEFAULT_MODEL_STACK`:
  ```js
  export const DEFAULT_MODEL_STACK = Object.freeze({
    classify: '@cf/meta/llama-3.1-8b-instruct-fp8',
    draft: '@cf/meta/llama-4-scout-17b-16e-instruct',
    coding: '@cf/deepseek-ai/deepseek-v4.1-flash-1017',
    guard: '@cf/meta/llama-guard-3-8b',
    decision: '@cf/cloudflare/clef',
    extract: '@cf/cloudflare/clairic',
    embeddings: '@cf/baai/bge-m3',
  });
  ```
- `WORKING_CODING_MODELS`: Prioritizes top coding models from the Workers AI benchmark (`@cf/deepseek-ai/deepseek-v4.1-flash-1017`, `@cf/moonshotai/kimi-k2.7-code`, `@cf/deepseek-ai/deepseek-v4-pro-0813`, `@cf/qwen/qwen3-30b-a3b-fp8`, `@cf/qwen/qwen2.5-coder-32b-instruct`, `@cf/openai/gpt-oss-120b`, `@cf/zai-org/glm-5.3-flash`, `@cf/meta/llama-4-scout-17b-16e-instruct`, plus all `WORKING_TEXT_LLMS`).

### 2.2 `jev-coding.js` & Funnel Targets (`coding-engine-api`)
- **`GET|POST /api/jev/coding/repo-init` (`coding.repo_init`):**
  - Accepts `{ repo?: "yubi-OS/yubiOS" | "steady-orbit" | string, branch?: string, prompt?: string, workspace_id?: string }`.
  - Resolves target repo (from explicit `repo`, repo mentioned in `prompt`, or project default `yubi-OS/yubiOS` / `steady-orbit` workspace).
  - Returns `{ ok: true, repo, branch, default_assigned: boolean, head_sha, files: [{ path, mode, size, sha, content, language }], tree_count }` ready to hydrate `LightningFS` + `isomorphic-git.init` / `isomorphic-git.commit` in the browser.
- **`GET|POST /api/jev/coding/plan` (`coding.plan`):**
  - Accepts `{ prompt: string, repo?: string, files?: Array<{path, content?}>, harness_id?: string, interjection?: string, session_id?: string }`.
  - Uses `getActiveModel("coding")` + the active Harness² tree (`jev-harness2.js`) to build a 3–5 step atomic coding plan:
    `{ ok: true, session_id, model: getActiveModel("coding"), harness_tree_hash, repo, steps: [{ step_index, id, title, file_path, action: "modify"|"create"|"inspect"|"verify", rationale, target_Goal }] }`.
- **`GET|POST /api/jev/coding/step` (`coding.step`):**
  - Accepts `{ prompt: string, step_index: number, step: object, file_path: string, current_content: string, interjection?: string, session_id?: string, repo?: string }`.
  - Runs `getActiveModel("coding")` (with deterministic syntax-checked code transform fallback so every step produces valid, runnable JS/TS/Markdown/HTML code and a unified diff even in dry-run/test mode).
  - Returns `{ ok: true, step_index, file_path, action, model_used, previous_content, updated_content, unified_diff, changed_lines: { startLine, endLine, added, removed }, commit_message, diagnostics: { valid: boolean, language, errors: [] }, summary }`.
- **`GET|POST /api/jev/coding/file` (`coding.file_get`):**
  - On-demand lazy loader for any additional file in the remote GitHub repo (`{ repo, path, ref? }`) so the right-hand directory tree can open any file in the repo into Monaco and commit it into `isomorphic-git`.
- **`GET /api/jev/coding/selftest` (`coding.selftest`):**
  - 8-gate deterministic selftest (`C1_model_stack_7cat`..`C8_interjection_steering`) wired into `/api/jev/selftest/coverage`.

---

## 3. Boundaries

- **Always:**
  - Initialize the local browser Git repo (`isomorphic-git` + `LightningFS`) as Step 0 before applying code edits.
  - Apply code edits **one step at a time** so the user sees each file open in Monaco, watches the lines update, sees the local Git commit land in the right sidebar, and can click **`⏸ Pause Session`** at any point.
  - Keep outbound GitHub writes (`github.contents_put`) fail-closed behind the Policy v27 approval gate.
- **Never:**
  - Never expose internal worker bundle secrets or bypass Policy v27 for remote repo pushes.
  - Never lose local edits when the user pauses and submits an interjection.

---

## 4. Success Criteria

1. `GET /api/jev/models` returns all **7 categories** (`classify`, `draft`, `coding`, `guard`, `decision`, `extract`, `embeddings`) with `DEFAULT_MODEL_STACK` having `draft: "@cf/meta/llama-4-scout-17b-16e-instruct"`, `embeddings: "@cf/baai/bge-m3"`, and `coding: "@cf/deepseek-ai/deepseek-v4.1-flash-1017"`.
2. `#llm-stack-dlg` in `/jev/` displays 7 category dropdowns and filter chips (including `coding`) and resets to the new 7-category defaults.
3. Submitting a coding prompt in `/jev/` Chat (or clicking `Code` mode) transitions the view to the 3-pane Agentic Coding Workbench (`#coding-workbench`), initializes the local `isomorphic-git` repo in the narrow right sidebar (`#coding-git-sidebar`), loads the active file into the center Monaco Editor (`#coding-monaco-host`), steps through the plan one step at a time with `☑ Live Refresh` (`#coding-live-refresh`), and halts + opens the interjection input (`#coding-interject-bar`) when `⏸ Pause Session` (`#coding-pause-btn`) is clicked.
4. `GET /api/jev/coding/selftest` passes `8/8` checks (`100%`) and `GET /api/jev/console/selftest` passes all checks.
