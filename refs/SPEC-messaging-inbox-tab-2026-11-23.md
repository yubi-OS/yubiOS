# Spec & Implementation Plan: Ops Console Messaging Inbox Tab (Twilio SMS + Resend Email + Clairic/Small-Model Templated Outreach)

- **Date:** 2026-11-23
- **Target Deployment:** Cloudflare Worker `steady-orbit` (93 module parts, etag pulled live to `session/cf-live/`) + KV `SITE` (`b9de35ecd3ca44999b38cfd107c0d44a`) key `jev-index.html` (`1,756,296 B`, sha256 `a686272f32366794`)
- **Governing Skills:** `frontend-ui-engineering`, `glass-design-skill`, `spec-driven-development`, `prior-art-search`, `steady-orbit-deploy`, `workers-ai-router`

---

## 1. Capability Map (Phase 0 Scope Decomposition)

Per `spec-driven-development`, this request spans five independently testable modules that compose into the new Messaging Inbox tab:

| Module ID | Responsibility | Touched Worker Parts / KV | Depends On |
|---|---|---|---|
| `msg-switches-webhook` | Add `twilio_ai_autoreply` (and optional `resend_ai_autoreply`) to `jev_switches`; gate `runSiteAssistantReply` + `sendTwilioSmsDirect` in `/api/jev/webhooks/twilio` on the switch while always logging inbound SMS to D1 for inbox visibility. | `jev-switches.js`, `routes-automations.js`, `routes-jev.js` | — |
| `msg-inbox-backend` | Unified inbox read/reply routes (`/api/jev/messaging/threads`, `/api/jev/messaging/threads/:id`, `/api/jev/messaging/reply`) aggregating Twilio (`fetchTwilioMessages` + `jev_events` + `jev_actions`) and Resend (`jev_leads` + `jev_events` `lead_reply` + `jev_actions` `resend.send`). | `jev-messaging.js` (new part), `routes-jev.js`, `jev-console-funnel.js`, `dbx.js` | `msg-switches-webhook` |
| `msg-template-pipeline` | Two-stage `<marker>` normalization & replacement engine: (1) `@cf/cloudflare/clairic` typed extraction over CSV/lead rows into `<marker>` schema + E.164/email validation; (2) small-model (`classify` route / `granite-4.0-h-micro` or `llama-3.1-8b-instruct-fp8`) contextual `<marker>` replacement + zero-unresolved-marker check. | `jev-messaging.js`, `jev-llm.js`, `jev-decide.js` | `msg-inbox-backend` |
| `msg-batch-hold-gate` | Hard tab-local approval hold (`NEVER_AUTOAPPROVE` override): batches created from CSV upload, Agentic Console `Execute` mode, or DAG Lead Finder output always land in `held_on_messaging_tab` state and **never** auto-execute even when `jev_switches.autoapprove` is `ON` systemwide. | `jev-switches.js`, `jev-agentic-console.js`, `jev-n8n-dag.js`, `jev-lead.js`, `jev-messaging.js` | `msg-template-pipeline` |
| `msg-inbox-ui` | New top-level `#dock-btn-messaging` / `#sec-messaging` tab in `jev-index.html` engineered with `frontend-ui-engineering` + `glass-design-skill`: 3-pane inbox layout, Twilio ↔ Resend channel switch, corner AI Auto-Reply switch, held batch approval inspector, and `<marker>` CSV/Lead-Finder List Input Dialog (`#msg-list-dialog`). | `jev-index.html` (KV `SITE`) | `msg-switches-webhook`, `msg-inbox-backend`, `msg-template-pipeline`, `msg-batch-hold-gate` |

**Build Order:** `msg-switches-webhook` → `msg-inbox-backend` + `msg-template-pipeline` → `msg-batch-hold-gate` → `msg-inbox-ui` → Advisor Review & Live CDP Verification.

---

## 2. Open-Source Prior Art & Architectural Patterns Adopted

Per `prior-art-search`, we surveyed open-source projects across three domains: (A) omnichannel SMS/email inbox UIs, (B) CSV schema normalization with LLM extraction, and (C) human-gated templated outreach campaigns.

### A. Omnichannel Inbox Formatting (SMS + Email)
1. **[chatwoot/chatwoot](https://github.com/chatwoot/chatwoot)** (MIT, 40.3k stars — Vue.js + Rails)
   - **What it does:** Unified omnichannel inbox supporting Twilio SMS and Email with an AI assistant ("Captain") handoff toggle per inbox.
   - **Patterns adopted for `/jev/` Messaging Tab:**
     - **3-Pane Split Layout:** Left Conversation List (`300px`, filter pills `All | Unread | AI Handled | Outreach`, search bar, contact badge + last-message snippet + relative time) → Center Thread View (`1fr`, chronological bubbles, distinct visual styling for `Inbound`, `Operator Sent`, and `AI Auto-Reply` with model/SID metadata, bottom reply composer) → Right Context & Campaign Inspector (`360px`, lead details + held batch approval queue).
     - **AI Auto-Response Handoff Toggle:** Top-right header switch that toggles whether inbound Twilio webhooks trigger the AI agent (`SOS Agent` on Llama 4 Scout) or hold the thread as `Needs Human Reply`.
2. **[freescout-help-desk/freescout](https://github.com/freescout-help-desk/freescout)** (AGPLv3, 4.6k stars) & **[papercups-io/papercups](https://github.com/papercups-io/papercups)** (MIT, 6.1k stars)
   - **Patterns adopted:** Email-thread vs. SMS-bubble density switching. When the channel switch is on **Twilio SMS**, messages render as compact SMS bubbles with segment/character counters (`160 chars / 1 seg`) and E.164 badges. When switched to **Resend Email**, threads show `Subject:` headers, `From/To` pills, HTML-sanitized expandable email cards, and `jev_leads` audit findings (`finding_code`, `evidence_url`).
   - **Failure lesson from Papercups:** Papercups mixed live-chat and email without a dedicated outbound campaign/list staging state, forcing users to manage bulk outreach externally. We keep a dedicated **Outreach Batches (`Held for Approval`)** view directly inside the tab.

### B. CSV Schema Normalization & `<marker>` Template Replacement
3. **[climik/excel-normalizer](https://github.com/climik/excel-normalizer)** & **[importcsv/importcsv](https://github.com/importcsv/importcsv)** & **[NPA-AI-Co-Lab/schema-mapping-cli](https://github.com/NPA-AI-Co-Lab/schema-cli-tool)**
   - **What they do:** Map arbitrary, messy CSV headers and cell values into a canonical typed schema using a hybrid deterministic rule engine + structured LLM extraction, then reverse-bind into template placeholders (`{{...}}` / `<...>`).
   - **Patterns adopted:**
     - **Two-Stage Extract-then-Render Pipeline:**
       1. **Clairic Typed Normalization (`@cf/cloudflare/clairic`):** Instead of trusting raw CSV column names, we parse the `<markers>` defined in the user's template (e.g., `<first_name>`, `<business_name>`, `<pain_point>`, `<estimated_loss>`) into a typed Clairic `fields` schema (`text`, `number`, `estimate`, `date`, `datetime`), run Clairic over each row's concatenated key-value text, and deterministically normalize contact endpoints (`normalizeTwilioPhone` → E.164 `+1...`, `RESEND_EMAIL_SCAN` → lowercase email).
       2. **Small-Model Contextual Replacement (`granite-4.0-h-micro` / `llama-3.1-8b-instruct-fp8`):** A fast, low-cost model substitutes the Clairic-normalized fields into the `<markers>` template, fixing boundary articles/capitalization (e.g. turning `"spotted <pain_point>"` + `"No online booking"` into `"spotted that you don't have online booking"`) while preserving the exact template structure and enforcing a deterministic post-check that zero `<...>` tokens remain.
4. **[dittofeed/dittofeed](https://github.com/dittofeed/dittofeed)** (MIT) & **[knadh/listmonk](https://listmonk.app/docs/templating/)** (AGPLv3)
   - **Patterns adopted:** Live side-by-side **Template Editor + Per-Row Preview Scroller** inside the List Input Dialog (`◀ Row 1 of N ▶`), highlighting replaced `<markers>` in cyan/emerald pills so the operator can inspect the exact normalized values before staging the batch.

### C. Human-Gated Outbound Campaign Control Planes
5. **[Kazemkhani/outbound-intelligence-engine](https://github.com/Kazemkhani/outbound-intelligence-engine)** (Apache-2.0) & **[negativexq/smart-campaign-composer](https://github.com/negativexq/smart-campaign-composer)** & **[RossDmello2/finimatic-email-ops](https://github.com/RossDmello2/finimatic-email-ops)**
   - **What they do:** Separate discovery/enrichment/drafting from send execution via a hash-bound approval queue where AI models extract and draft, but backend code enforces a hard human approval gate that voids if the draft or audience changes.
   - **Patterns adopted:**
     - **Hash-Bound Batch Approval on the Messaging Tab:** Every staged list batch computes a `batch_sha256` over `(channel, template, recipients_rendered[])`. Editing any recipient row or template marker re-runs normalization and mints a new `batch_sha256`.
     - **Systemwide Autoapprove Override:** Even when `jev_switches.autoapprove` is `ON`, list/batch outreach actions carry `requires_tab_approval: true` and tool IDs `twilio.batch_send` / `resend.batch_send` (added to `NEVER_AUTOAPPROVE`), guaranteeing they pause on the Messaging tab until explicitly approved there.

---

## 3. Live Codebase Audit & Exact Integration Touchpoints

From our live pull of `steady-orbit` (`session/cf-live/`):

1. **Twilio Inbound Webhook (`routes-automations.js` L191–288):**
   - Currently `POST /api/jev/webhooks/twilio?k=<TWILIO_WEBHOOK_KEY>` parses `From`, `To`, `Body`, `MessageSid`, loads 6 recent messages via `fetchTwilioMessages`, calls `runSiteAssistantReply(env, { message: smsBody, history: smsHistory })`, and immediately sends the reply via `sendTwilioSmsDirect(env, { to: fromPhone, from: toPhone || "+16502500485", body: assistantReply })`.
   - **Gap:** There is no switch to turn off the AI auto-reply when the operator wants to handle SMS manually, and if AI auto-reply is skipped, the inbound message still needs a `jev_events` record (`twilio_inbound_received`) so D1 + the console know an unread inbound SMS arrived.
2. **System Switches (`jev-switches.js` L25–33 & L249–315):**
   - Currently `SWITCH_NAMES = Object.freeze(["approval_emails", "autoapprove"])` and `NEVER_AUTOAPPROVE = Object.freeze(["resend.send", "http.post"])`.
   - **Bug/Seam found in `jev-switches.js` L263–272 & `jev-agentic-console.js` L4064–4104:**
     - In `jev-switches.js` L263, `policyToolEligible` checks `policy.tools[action.tool]` WITHOUT checking `!NEVER_AUTOAPPROVE.includes(action.tool)`! And in `jev-agentic-console.js` L4064, `mode === "execute"` checks `autoApproveSwitchOn` and auto-dispatches `resend.send` and `twilio.send`!
     - For the new list-send flow, we must ensure `twilio.batch_send` and `resend.batch_send` (and any task/action with `list_send: true` or `hold_on_messaging_tab: true`) are **strictly excluded** from both `maybeAutoApprove` in `jev-switches.js` and the `autoApproveSwitchOn` auto-runner in `jev-agentic-console.js`.
3. **Resend Inbox Data Sources (`jev-lead.js` L660–730 & `dbx.js` L34–120):**
   - Inbound email replies arrive at `POST /api/jev/webhooks/reply?k=<JEV_API_KEY>` (`handleReplyWebhook` in `jev-lead.js`), which updates `jev_leads` (`stage = 'replied'`, `data_json.reply_snippet`, `data_json.replied_at`) and appends `kind = 'lead_reply'` to `jev_events`.
   - Outbound emails live in `jev_actions` where `tool = 'resend.send'` (`body_json` has `{ from, to, subject, html }`, `response_json` has Resend `id`, `state` has `verified_success` / `proposed` / `approved`), plus `jev_leads` (`draft_subject`, `draft_body`, `contact_email`, `business_name`, `finding_code`, `finding_text`).
   - Combining `jev_actions (tool='resend.send')` + `jev_events (kind='lead_reply')` + `jev_leads` by normalized email address gives a complete, real-time two-way **Resend Inbox** without needing a separate IMAP server.
4. **Agentic Console `Execute` Mode & DAG Lead Finder (`jev-agentic-console.js` & `jev-n8n-dag.js`):**
   - In `jev-agentic-console.js` (`mode === "execute"`), when a prompt supplies a list of contacts or asks to message/email a list of leads with a template, we add a list-outreach intent detector that stages a batch into `jev_messaging_batches` (status `held_for_approval`) and returns `{ messaging_batch_id, channel, recipient_count, hold_tab: "messaging" }` so the UI can show a `"Review & Approve Batch in Messaging Inbox →"` action button.
   - In `jev-n8n-dag.js` (`lead-research` / `lead-enrichment-outreach` / `enrich.run` kind `lead` or `batch`) and `jev-lead.js`, we expose a `"Send to Messaging Inbox List"` bridge (`POST /api/jev/messaging/import-leads`) and DAG node `messaging.stage_batch` that pipes discovered leads (with `business_name`, `contact_email`, `nationalPhoneNumber`, `domain`, `finding_text`, `automation_gaps`) straight into the Messaging tab's template pipeline.

---

## 4. Detailed Feature & Component Design

### 4.1 Switch 1: Corner AI Auto-Response Switch (`twilio_ai_autoreply`)
- **Backend (`jev-switches.js` & `routes-automations.js`):**
  - Add `"twilio_ai_autoreply"` to `SWITCH_NAMES` in `jev-switches.js` with `DEFAULT_ENABLED.twilio_ai_autoreply = true` (preserving current live behavior until toggled off, or `false` if fail-closed default is preferred — configurable).
  - Add helper `switches.twilioAiAutoreplyEnabled()`.
  - In `routes-automations.js` (`POST /api/jev/webhooks/twilio`):
    1. Check `const autoReplyOn = deps.switches ? await deps.switches.twilioAiAutoreplyEnabled() : true;`.
    2. If `autoReplyOn === false`:
       - Do **not** call `runSiteAssistantReply` or `sendTwilioSmsDirect`.
       - Append event `kind: "twilio_inbound_received"` to `jev_events` with `{ inbound_sid: msgSid, from: fromPhone, to: toPhone || "+16502500485", body: smsBody, auto_reply_enabled: false, received_at: new Date().toISOString() }`.
       - Return `200 OK` JSON `{ ok: true, driver: "manual-inbox-hold", auto_reply_enabled: false, inbound_sid: msgSid, from: fromPhone, to: toPhone || "+16502500485", body: smsBody, reply: null }`.
    3. If `autoReplyOn === true`:
       - Run `runSiteAssistantReply` + `sendTwilioSmsDirect` as today and record `twilio_inbound_reply`.
- **Frontend (`#sec-messaging` Top-Right Corner):**
  - Liquid Glass lip-bezel switch `#sw-twilio-ai-autoreply` (`class="sw-switch"`, `role="switch"`) with live status badge (`ON · SOS Agent Auto-Reply` in emerald vs. `OFF · Manual Inbox Hold` in amber), wired to `GET/POST /api/jev/system/switches` (`{ name: "twilio_ai_autoreply", enabled, actor }`).

### 4.2 Switch 2: Channel Switch (`Twilio SMS Inbox` ↔ `Resend Email Inbox`)
- **Segmented Lens Control (`#msg-channel-switch`):**
  - Located in the header of `#sec-messaging` using `.workspace-dock` / `.chat-mode-bar` convex liquid-glass pill geometry (`role="radiogroup"`, `aria-label="Messaging channel"`):
    - **Option 1: `Twilio SMS` (`data-channel="twilio"`)** — Sender badge `+1 (650) 250-0485`, threads grouped by normalized E.164 phone number, SMS bubble timeline, 160-char/segment counter, SMS template `<markers>`.
    - **Option 2: `Resend Email` (`data-channel="resend"`)** — Sender badge `site@axel.steadyorbitsystems.ai`, threads grouped by contact email (`jev_leads` + `resend.send` actions + `lead_reply` events), subject line + HTML/text email preview cards, Lead Finder audit badges (`finding_code`, `domain`, `MX status`), email subject + body `<markers>`.

### 4.3 Input List Dialog (`#msg-list-dialog`): `<markers>` Template + Clairic Normalization + Small-Model Replacement
- **Opening the Dialog:**
  - Triggered via **"+ New List / Outreach Batch"** button in `#sec-messaging`, or pre-populated automatically when routed from **Agentic Console (`Execute` mode)** or a **DAG Lead Finder run**.
- **3-Step Interactive Flow inside `#msg-list-dialog`:**
  1. **Source & Raw Input Intake:**
     - **Tab A — Paste / Upload CSV:** Drag-and-drop `.csv` file or paste CSV / TSV / freeform lines (e.g. `name, business, phone, email, pain_point`).
     - **Tab B — Import from Lead Finder / DAG Run:** One-click selector pulling recent `jev_leads` rows or DAG `places.search` + `enrich.lead` outputs (filtering by `has_phone` for Twilio or `has_verified_email` for Resend).
     - **Tab C — From Agentic Console (`Execute` Mode):** Displays the list passed directly by the operator's prompt in `#jev-chat-surface`.
  2. **Template Definition with `<markers>`:**
     - **Subject Input** (shown when channel is `Resend Email`, supports `<markers>` like `Quick question about <business_name>'s <pain_point>`).
     - **Message Body Editor** with live `<marker>` syntax highlighting (`<first_name>`, `<business_name>`, `<city>`, `<pain_point>`, `<website>`, `<custom_offer>`).
     - **Detected `<markers>` Schema Bar:** Automatically parses every `<([a-zA-Z0-9_]+)>` token in the template and displays a row of typed schema pills where each marker's Clairic extraction type (`text` | `number` | `estimate` | `date` | `datetime`) and optional extraction instruction can be inspected or refined.
  3. **Clairic Normalization + Small-Model Replacement Preview (`POST /api/jev/messaging/batches/stage`):**
     - **Step 3a (Clairic System-One Extraction):** For each input row, the worker constructs a `state` block from the CSV columns / lead fields and invokes `@cf/cloudflare/clairic` (with deterministic regex/alias fallback so offline/dry-run never fails) to extract and normalize each `<marker>` field + the target address (`phone` in E.164 for Twilio, `email` for Resend).
     - **Step 3b (Small-Model Replacement):** Calls the small, fast Workers AI model (`getActiveModel("classify")` — `@cf/ibm-granite/granite-4.0-h-micro` or `@cf/meta/llama-3.1-8b-instruct-fp8`) with a strict replacement prompt that substitutes the Clairic-normalized typed fields into the `<markers>` template, polishing natural phrasing at the splice boundaries while keeping the template body intact.
     - **Step 3c (Deterministic Verification Gate):** Verifies that:
       - Every recipient has a valid E.164 phone (Twilio) or valid email + `@axel.steadyorbitsystems.ai` sender (Resend).
       - Zero unresolved `<marker>` or `[Placeholder]` tokens remain in any rendered message.
       - Llama Guard (`runGuard`) passes on the rendered text.
     - **Stage to Tab Hold Queue:** Saves the batch to D1 table `jev_messaging_batches` (and per-recipient rows in `jev_messaging_batch_items`) with `status = 'held_for_approval'`.

### 4.4 Hard Tab-Local Approval Hold (Immune to Systemwide `autoapprove`)
- **Security Invariant:**
  - A staged list batch **never** sends during staging, **never** auto-approves via `jev_switches.autoapprove`, and **never** auto-executes inside `jev-agentic-console.js` `Execute` mode.
  - When the user triggers a list send from the Agentic Console under `Execute` mode (e.g., *"send this template to the 5 landscaping leads"*), `jev-agentic-console.js` stages the batch in `jev_messaging_batches` (`status: "held_for_approval"`), skips the `autoApproveSwitchOn` auto-dispatch block, and returns a response card with a **"Review & Approve Batch (N recipients) in Messaging Tab →"** button that switches the Ops Console to `#sec-messaging` and focuses the held batch card.
  - Inside `#sec-messaging`, the **Held Outreach Batches** queue displays:
    - Batch title, source (`CSV Upload` | `Agentic Execute` | `DAG Lead Finder`), channel badge (`Twilio SMS` | `Resend Email`), recipient count, and `batch_sha256` fingerprint.
    - Expandable per-recipient preview table showing: `Recipient`, `Clairic Normalized Fields`, and `Final Rendered Message` (with inline edit or row-exclude checkbox).
    - **"Approve & Send Batch (N)"** primary button (requires operator confirmation; calls `POST /api/jev/messaging/batches/:id/approve` with `surface: "messaging_tab"`, `actor`, and `batch_sha256`) and **"Reject / Cancel Batch"** danger button.

---

## 5. D1 Schema & Backend API Contract (`jev-messaging.js`)

### 5.1 New D1 Tables (Idempotent DDL in `dbx.js` / `jev-messaging.js`)
```sql
CREATE TABLE IF NOT EXISTS jev_messaging_batches (
  id TEXT PRIMARY KEY,              -- 'mb_' + 16 hex
  channel TEXT NOT NULL,            -- 'twilio' | 'resend'
  source TEXT NOT NULL,             -- 'csv_upload' | 'agentic_execute' | 'dag_lead_finder'
  title TEXT,
  template_subject TEXT,            -- nullable for twilio
  template_body TEXT NOT NULL,
  markers_schema_json TEXT NOT NULL,-- JSON array of { marker, type, instructions }
  status TEXT NOT NULL,             -- 'held_for_approval' | 'approved_dispatching' | 'completed' | 'rejected' | 'partial_failure'
  batch_sha256 TEXT NOT NULL,       -- SHA-256 of canonical (channel + rendered items)
  total_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  clairic_model TEXT,
  replace_model TEXT,
  approved_by TEXT,
  approved_at TEXT,
  rejected_by TEXT,
  rejected_at TEXT,
  task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jev_messaging_batch_items (
  id TEXT PRIMARY KEY,              -- 'mbi_' + 16 hex
  batch_id TEXT NOT NULL REFERENCES jev_messaging_batches(id),
  seq INTEGER NOT NULL,
  recipient TEXT NOT NULL,          -- E.164 phone or email address
  raw_row_json TEXT NOT NULL,       -- original CSV / lead object
  normalized_fields_json TEXT NOT NULL, -- Clairic typed extraction output
  rendered_subject TEXT,
  rendered_body TEXT NOT NULL,
  status TEXT NOT NULL,             -- 'held' | 'excluded' | 'sent' | 'failed'
  provider_ref TEXT,                -- Twilio SID or Resend email ID
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 5.2 REST & Funnel Endpoints (`/api/jev/messaging/*`)
| Method & Path | Role | Auth & Gate |
|---|---|---|
| `GET /api/jev/messaging/inbox?channel=twilio\|resend&q=&filter=` | Returns unified conversation threads, unread/held counts, and current `twilio_ai_autoreply` + `autoapprove` switch states. | Bearer `JEV_API_KEY` (Read-only) |
| `GET /api/jev/messaging/threads/:contact` | Returns full chronological message history for one phone number or email address + linked `jev_leads` dossier. | Bearer `JEV_API_KEY` (Read-only) |
| `POST /api/jev/messaging/reply` | Sends a single 1-to-1 reply in an active thread through the Policy v27 `twilio.send` / `resend.send` gate. | Bearer `JEV_API_KEY` + Policy v27 |
| `POST /api/jev/messaging/batches/stage` | Parses CSV / Lead Finder / Agentic list, runs Clairic typed normalization + small-model `<marker>` replacement, and saves a batch with `status: "held_for_approval"`. Never dispatches. | Bearer `JEV_API_KEY` (Staged only) |
| `GET /api/jev/messaging/batches` | Lists held, completed, and rejected outreach batches for the active channel. | Bearer `JEV_API_KEY` (Read-only) |
| `POST /api/jev/messaging/batches/:id/approve` | Verifies `surface === "messaging_tab"`, `actor` in approvers allowlist, and `batch_sha256` match; creates a governed `jev_tasks` record and dispatches each non-excluded item via Twilio/Resend. | Bearer `JEV_API_KEY` + Tab-Local Human Approval |
| `POST /api/jev/messaging/batches/:id/reject` | Marks the held batch `rejected` and appends `messaging_batch_rejected` to `jev_events`. | Bearer `JEV_API_KEY` |
| `GET /api/jev/messaging/selftest` | Deterministic selftest (`M1..M8`): switch gating on webhook, `<marker>` parser, Clairic normalization, small-model replacement, unresolved-marker rejection, and `autoapprove=ON` hold immunity. | Bearer `JEV_API_KEY` |

---

## 6. UI Architecture (`frontend-ui-engineering` + `glass-design-skill`)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Drawer · Messaging & Outreach                                                            │
│ Messaging Inbox                                                                          │
│ ┌───────────────────────────────┐  ┌────────────────────┐  ┌───────────────────────────┐ │
│ │ [ 💬 Twilio SMS ] [ ✉️ Resend ] │  │ + New List Batch   │  │ AI Auto-Reply [●━━] ON    │ │
│ └───────────────────────────────┘  └────────────────────┘  └───────────────────────────┘ │
├────────────────────────┬───────────────────────────────────────┬─────────────────────────┤
│ THREADS (280px)        │ CONVERSATION TIMELINE (1fr)           │ HELD BATCHES & LEAD     │
│ [🔍 Search phone/email]│ +1 (818) 641-5757 · Verdant Ridge     │ INSPECTOR (350px)       │
│ [All][Unread][AI][Held]│ ───────────────────────────────────── │ ─────────────────────── │
│ ────────────────────── │ [Inbound · 10:14 AM]                  │ ⚠️ HELD FOR APPROVAL (1)│
│ ● +1 (818) 641-5757    │  Do you guys integrate with Jobber?   │ ┌─────────────────────┐ │
│   "Do you guys..."  2m │                                       │ │ Batch: Landscaping  │ │
│   [AI Auto-Replied]    │ [Outbound · SOS Agent AI · 10:14 AM]  │ │ Source: DAG Leads   │ │
│ ────────────────────── │  Yes, we connect directly to Jobber   │ │ 6 recipients · SMS  │ │
│ ○ +1 (310) 555-0142    │  via webhooks... (SID: SM8a9f...)     │ │ <business_name>,    │ │
│   "Thanks, let's..."1h │                                       │ │ <pain_point>        │ │
│   [Outbound Batch]     │ ───────────────────────────────────── │ │ [Preview 6 Rows ▾]  │ │
│                        │ [ Type SMS reply...            ]      │ │ [✓ Approve & Send]  │ │
│                        │ [✨ Suggest AI Reply]   [Send SMS ↵]  │ │ [✕ Reject Batch]    │ │
│                        │ 142 / 160 chars · 1 segment           │ └─────────────────────┘ │
└────────────────────────┴───────────────────────────────────────┴─────────────────────────┘
```

### Accessibility, Theme & Responsive Guardrails (`frontend-ui-engineering` & `glass-design-skill`)
- **5-Layer Liquid Glass:** Uses `--lg-surface-1` on `#sec-messaging`, `--lg-surface-2` on thread cards and held-batch cards, concave `.sw-track` + convex `.sw-knob` on `#sw-twilio-ai-autoreply`, and raised convex lens pills on the `Twilio SMS` / `Resend Email` segmented channel switch.
- **Dark & Light Mode Parity:** All text tokens use semantic variables (`var(--ink)`, `var(--muted)`, `var(--border)`) with explicit `html[data-theme="light"]` overrides so message bubbles, `<marker>` pills, and diff previews maintain `>= 4.5:1` contrast in both themes.
- **Modal Tooltip Rule:** Any tooltip inside `#msg-list-dialog` (`<dialog>`) mounts inside the dialog element itself so it renders in the top layer above `::backdrop`.
- **Keyboard & Screen Reader Support:** WAI-ARIA `role="radiogroup"` on the channel switch, `role="switch"` with `aria-checked` on the AI auto-reply toggle, roving `tabindex` on thread rows (`ArrowUp`/`ArrowDown`), focus trap + `Escape` close on `#msg-list-dialog`, and `aria-live="polite"` status announcements.
- **Responsive Breakpoints (`320px`, `768px`, `1024px`, `1440px`):**
  - `>= 1100px`: 3-column grid (`280px 1fr 350px`).
  - `768px–1099px`: 2-column grid (`260px 1fr`) with Held Batches / Lead Inspector collapsible as a top drawer inside the right column.
  - `< 768px`: Single-column view with segmented sub-view bar (`Threads | Active Chat | Held Batches (N)`).

---

## 7. Parallel Build Lanes & Verification Plan

1. **Lane 1 (`msg-switches-webhook` + `msg-batch-hold-gate`):**
   - Patch `jev-switches.js` (`twilio_ai_autoreply` switch + `NEVER_AUTOAPPROVE` enforcement on `twilio.batch_send` / `resend.batch_send` / `list_send`).
   - Patch `routes-automations.js` (`/api/jev/webhooks/twilio` checks `twilioAiAutoreplyEnabled()`, logs `twilio_inbound_received` when `OFF`).
2. **Lane 2 (`msg-inbox-backend` + `msg-template-pipeline`):**
   - Author `jev-messaging.js` (D1 tables `jev_messaging_batches` + `jev_messaging_batch_items`, unified Twilio + Resend thread aggregator, `<marker>` parser, Clairic typed extraction adapter, small-model replacement runner, batch stage/approve/reject handlers, `M1..M8` selftest).
   - Wire into `routes-jev.js`, `jev-console-funnel.js` (new funnel targets `messaging.inbox`, `messaging.stage_batch`, `messaging.batches`, `messaging.selftest`), `jev-agentic-console.js` (`Execute` mode list staging), and `jev-n8n-dag.js` (`messaging.stage_batch` DAG node + Lead Finder export).
3. **Lane 3 (`msg-inbox-ui`):**
   - Add `#dock-btn-messaging` to `#workspace-dock` (visible in both default and `?dev=true` modes) and `#sec-messaging` + `#msg-list-dialog` to `jev-index.html` following `frontend-ui-engineering` and `glass-design-skill`.
4. **Lane 4 (Advisor Integration & Live CDP QA):**
   - `node --check` all 94 worker parts, verify HTML tag balance (`0` unmatched closes), run `M1..M8` selftests + existing worker selftests, deploy to Cloudflare, and visually verify in both Dark and Light modes across desktop and mobile viewports.
