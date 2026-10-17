# SPEC: /jev/ console redesign (2026-10-17)

Source of truth: KV `SITE` (namespace b9de35ecd3ca44999b38cfd107c0d44a), key `jev-index.html`, served at `/jev/`.
Live snapshot before this round: 406,337 bytes, 6,345 lines, sha256 11604ab449fa20b425b4e6044ad70ecc0c7167aed7b807e320ac3dd36428512c.
Rollback = PUT that exact file back (kept at session/jev-design/live-jev-index.html).
No worker code, API, or route changes in this round. Console (KV) only.

## Directives (Jenny, 2026-10-17)

1. The Pending approvals section sits directly below the Prompt console.
2. Overview and Workspace become collapsible sections, each with an arrow button. Both start collapsed on every page load. Do not persist the state.
3. Remove the "Cost · 24h" tile from Overview (`tile-cost`, `tile-cost-total`). Nothing else about cost changes (the task table cost column and the taste/scorer cost notes stay).
4. Full visual redesign is approved. Keep the Steady Orbit brand: navy base, violet accent, Space Grotesk headings, Inter body, mono for data and identifiers.

## Final section order inside `<main id="app">`

1. `section#prompt-console` (unchanged content, restyled)
2. `section[aria-labelledby=h-approvals]` (moved up from below Workspace)
3. Overview, collapsible: `section.sec` with `h-overview`, body `#ov-body`
4. Workspace, collapsible: `section.sec` with `h-workspace`, body `#ws-body`. The workspace chip row (`.ws-chip-row`, `#ws-chip`, `#ws-chip-copy`) moves from Overview into the top of the Workspace body.
5. `#diag-panel` (hidden by default, toggled by `#chip-policy`). Placement unchanged, after everything above.

## DOM contract (must survive with the same ids)

Every id that the scripts read or write must still exist exactly once. Confirm by grepping `$("…")`, `getElementById`, and `querySelector("#…")` in the live file. Known set (non-exhaustive): chip-policy, policy-ver, diag-arrow, chip-models, pause-pill, pause-label, btn-refresh, btn-logout, banner, prompt-input, btn-run-prompt, prompt-count, prompt-ws-note, prompt-note, prompt-banner, prompt-result, prompt-result-text, prompt-result-btn, state-chips, tile-approvals, btn-pause-toggle, pause-scope, pause-scope-val, pause-scope-note, ws-chip, ws-chip-id, ws-chip-count, ws-chip-copy, ws-empty, ws-list, ws-status, ws-viewer-name, ws-raw-toggle, ws-content, ap-grid, ap-empty, diag-panel, diag-nav tabs (diagtab-*), and every h-* id that a section's aria-labelledby points to.

Removed by this round (allowed): `tile-cost`, `tile-cost-total`.
New ids (allowed): `ov-toggle`, `ov-body`, `ov-summary`, `ws-toggle`, `ws-body`, `ws-summary`.

## CSS class contract

- A class used anywhere in markup or in a JS template string must keep a style rule, or be deliberately unstyled. Do not delete a selector that inner cards depend on (taste, spectral, forecast, map, visco, router, automations, evolution, corpus, scorer, learnings, allowlist, sweep, tasks).
- Restyling a shared class (`.panel`, `.tile`, `.chip`, `button`, `.empty`, `.jev-*`, `.diag-*`, `.ws-*`, `.ap-*`) is expected. Keep its meaning. Inner cards inherit it.
- New classes for this round: `.sec`, `.sec-head`, `.sec-head-text`, `.sec-toggle`, `.sec-arrow`, `.sec-summary`, `.sec-body`, `.status-cluster`, `.header-actions`.
- Do NOT add a global `[hidden]{display:none!important}` rule. Hidden panes rely on the current cascade. Scope any hidden rule, for example `.sec-body[hidden]{display:none}`.

## Behavior contract

- `initCollapsibles()` binds `#ov-toggle` and `#ws-toggle`. Each click flips `aria-expanded` and the `hidden` attribute on its body, and updates the button label (`Show` / `Hide`). Markup defaults are `aria-expanded="false"` and `hidden` on the body. The default must not depend on JS.
- `expandSection("ws")` opens the workspace body and sets its toggle state. Call it from `openArtifact` (or the prompt-result button handler) so an artifact is never opened into a collapsed section.
- Data loading never depends on collapse state. `workspaceRefresh()`, `renderSummary()`, and the 15s poll keep running while a section is collapsed.
- `renderSummary()` stops writing `tile-cost` and `tile-cost-total`. Optional, null-safe summary text: `#ov-summary` shows "N tasks · M pending"; `#ws-summary` shows "N artifacts" (wsLoad already knows the count).
- Keep every other behavior byte-for-byte: auth dialog, polling, tab switching in the diagnostics panel, approve/reject/guide, the artifact viewer, and the prompt flow.

## Visual direction

- Terminal-operator aesthetic, dark, calm. Brand navy and violet, used with restraint. Accent is for focus, primary action, and active state. Not a wash of gradients.
- Hierarchy: header (brand + status cluster + actions) → section headers with an accent eyebrow, a clear title (about 1.05rem Space Grotesk, not the small muted uppercase style used now), and a one-line description → content.
- Surfaces: flat panels with a 1px hairline border. Radius scale 4 / 6 / 10px. No heavy shadows.
- Spacing on a 4px scale (4, 8, 12, 16, 24, 32). Consistent control heights: 36px, and 44px for coarse pointers.
- Approval cards: title, target as a mono block, limits as chips, footer with id and expiry, then actions. Approve is primary, reject is danger, guide is ghost. Keep the overflow rules (`overflow-wrap:anywhere`, `min-width:0`).
- KPI tiles: small label, large mono value, short sub-line.
- Diagnostics panel: a distinct drawer under a clear divider. Its tab nav is a horizontally scrollable segmented control on narrow screens.
- Motion: chevron rotation and fades at about 160ms. Honour `prefers-reduced-motion`.
- Semantic colour for state (ok, warn, bad), always paired with text or an icon.

## Accessibility and responsiveness

- Widths to verify: 320, 768, 1024, 1440, and 1920. No horizontal page scroll at 320.
- Focus-visible ring: 2px accent with a 2px offset on every interactive element.
- Body text contrast at least 4.5:1. UI and large text at least 3:1.
- Each collapsible button has an accessible name that includes the section name. `aria-expanded` and `aria-controls` are correct.
- Heading order: one h1 (header brand), then h2 per section. Do not skip levels.

## Lanes

- Lane A (general, CSS): owns the head `<style>` content only. Delivers a complete replacement for the whole head style region plus a selector audit.
- Lane B (smart, markup and JS): owns the body region from `<header class="top">` through the closing `</div>` of `.diag-head`. Delivers replacement markup, plus an exact JS edit list for the main script.
- Lane C (general, fast): delivers a preview harness: a sessionStorage polyfill plus a window.fetch mock for every `/api/jev/*` call the page makes, with realistic data. Includes a long-limit approval case, 3 workspace artifacts, and tasks in several states.
- Advisor (smart): integrates lanes A, B, and C into one candidate. Runs the checks in the advisor brief. Renders the preview at each width and reviews the screenshots. Reports defects and fixes them before push.

## Success criteria

1. Section order and collapse behavior match the directives. Both sections start collapsed.
2. `tile-cost` is gone. No console error. No JS reference to a removed id.
3. The HTML parses with zero unmatched closes. Every script block passes `node --check`.
4. Every id contract item is present once. Every class in markup or templates has a rule or is intentionally unstyled.
5. Screenshots at 320, 768, 1024, 1440, and 1920 look correct: no overflow, no clipped approval cards, no overlapping header items.
6. Diagnostics panel still opens from the policy chip and every diag tab still switches.
