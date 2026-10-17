# SPEC: PWC switches for the jev orchestrator (2026-10-17)

Two systemwide switches on the steady-orbit worker, surfaced as a subsection in the Overview "Tasks by state" card of the /jev/ console.

1. approval_emails: notification switch. When OFF, evolution approval-needed emails are not sent.
2. autoapprove: autoapproval gate, following docs/PWC.md (yubi-OS/yubiOS). When ON, actions on an allowlist are approved by the system instead of a person, only while every check still passes at use.

Doctrine (docs/PWC.md): control by construction, verification at use, record. Owner stays the controller for irreversible or external actions. The autoapproval gate names its mechanism: verification at use (the execute-time gate re-checks the bound approval) plus record (append-only events). No watcher is added.

## Fixed decisions

- D1 Storage: new D1 table `jev_switches`. No policy document change, no policy version bump, so pending approvals are not expired by a switch change.
- D2 approval_emails defaults to ON. When OFF, `makeEvolutionNotify().approvalNeeded` returns without sending and appends `approval_email_suppressed`. Digest emails are unaffected. If the switch cannot be read, the email is SENT (fail open for notifications, because hiding approvals is the riskier failure).
- D3 autoapprove defaults to OFF. Any read failure means OFF (fail closed).
- D4 The autoapproval allowlist is a code constant (control by construction). AUTOAPPROVE_TOOLS = ["github.contents_put", "daytona.sandbox"]. NEVER_AUTOAPPROVE = ["resend.send", "http.post"] is checked even if a name is added to the allowlist. Anything not on the allowlist is never auto-approved.
- D5 Eligibility, all of the following must hold: switch is exactly `true`; gate outcome is `needs_approval`; tool is on the allowlist and not on the never-list; the gate reasons are exactly ["tool_requires_approval"] (no band_provisional, risk, guard, low-confidence, or any other reason); fewer than AUTOAPPROVE_CAP_PER_HOUR (20) `approval_autoapproved` events in the last 3600 seconds.
- D6 Mechanism: create the approval row as today, then mark it approved with actor "system:autoapprove" and note "autoapprove:verification-at-use+record". Append `approval_autoapproved`. The engine ranks this action as "allowed". The execute-time gate receives the approvals array (which contains this row) and must accept it through the existing binding checks (payload hash, expiry, policy version). A changed payload fails at execute.
- D7 Record: every switch change appends `system_switch_changed` with {name, enabled, actor, previous}.
- D8 Routes: GET /api/jev/system/switches and POST /api/jev/system/switches. Same bearer check as the other /api/jev routes. Invalid name or enabled not a boolean returns 422. Empty actor returns 422 INVALID_ACTOR.

## Module contract: jev-switches.js (new)

Exports (names are fixed):
- SWITCH_NAMES = ["approval_emails", "autoapprove"]
- AUTOAPPROVE_TOOLS (frozen), NEVER_AUTOAPPROVE (frozen), AUTOAPPROVE_CAP_PER_HOUR = 20, AUTOAPPROVE_WINDOW_SECONDS = 3600
- autoApproveDecision({ switchOn, tool, outcome, reasons, usedLastHour }) returns { eligible: boolean, reason: string }. Pure. Reason is one of: "switch_off", "not_needs_approval", "tool_never_autoapprove", "tool_not_allowlisted", "reasons_not_tool_only", "cap_reached", "eligible". Check order is exactly this list.
- makeSwitches({ readRows, writeRow, appendEvent, now }) returns:
  - getAll() -> { approval_emails: {enabled, updated_at, updated_by}, autoapprove: {enabled, updated_at, updated_by} }. Missing rows use defaults: approval_emails enabled true, autoapprove enabled false, updated_at null, updated_by null.
  - set(name, enabled, actor, nowIso) -> state. Validates name and boolean. Writes the row. Appends system_switch_changed.
  - approvalEmailsEnabled() -> Promise<boolean>. Fail open: returns true on any error.
  - autoapproveEnabled() -> Promise<boolean>. Fail closed: returns false on any error.
  - usedLastHour(nowIso) -> Promise<number>. Counts approval_autoapproved events in the window. On error returns AUTOAPPROVE_CAP_PER_HOUR (fail closed).
- ensureSwitchesTable(db) runs `CREATE TABLE IF NOT EXISTS jev_switches (name TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)` once per isolate.

## Other touchpoints

- jev-notify.js: makeEvolutionNotify(deps) gains deps.approvalEmailsEnabled (async () => boolean) and deps.appendEvent. approvalNeeded(directive) checks it first. Caller sites: jev-evolution2-routes.js lines ~407 and ~511.
- jev-engine.js runPipeline, around line 180: after `deps.createApproval(...)` for an outcome of needs_approval, call `deps.maybeAutoApprove({ dbx, task, action, approval, outcome, reasons: greasons, policy: pol.doc, helpers })`. It returns `{ approval, outcome }`. Its outcome may become "allowed". Existing behaviour is unchanged when the switch is off or the row is absent.
- jev-main.js: wire the new deps (maybeAutoApprove, approvalEmailsEnabled) where deps objects are built.
- routes-jev.js: add the /api/jev/system/switches branch next to the pause routes (about line 1265), before any broad prefix match.

## Console contract (Overview > Tasks by state card)

Two subsections below the state chips, each styled like the Pause subsection:
- "Approval emails" switch, role="switch", aria-checked from server state. Sub text explains the effect. Status line shows updated_at and updated_by.
- "Autoapproval gate" switch. Sub text lists AUTOAPPROVE_TOOLS and the cap, and says owner-facing sends always need a person. Status shows used in the last hour out of 20. Turning it ON asks for confirmation.
- IDs: sw-approval-emails, sw-approval-emails-note, sw-autoapprove, sw-autoapprove-note. Fetch GET on load and in the 15s poll. POST with actor "console".

## Acceptance

1. With no switch rows, behaviour is identical to today.
2. With defaults, no approval is ever auto-approved.
3. Every eligibility branch has a test, including band_provisional or risk reasons (ineligible), resend.send (never), and cap reached (ineligible).
4. approval_emails OFF: approvalNeeded sends nothing and records approval_email_suppressed. Digest still sends. A read error still sends.
5. End to end with the memory driver: switch ON, github.contents_put with only the tool requirement: approval row is approved by system:autoapprove, the action is allowed, and the execute gate accepts it. Mutating the payload after approval makes the execute gate return needs_approval.
6. Console: two subsections, state matches the server, toggles POST, no tile-cost, no regressions in the other cards.
