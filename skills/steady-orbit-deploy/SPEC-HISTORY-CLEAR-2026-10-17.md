# SPEC: Clear history button on the Pause card (2026-10-17)

A console button on the Overview Pause card that clears the jev history tables, the same set our normal clears remove. A full backup is downloaded before every clear. The clear refuses while any task is still in flight.

## Cleared (FK-safe order, D1 rows)

| # | table | rows at spec time |
| --- | --- | --- |
| 1 | jev_approvals | 3 |
| 2 | jev_actions | 37 |
| 3 | jev_tasks | 44 |
| 4 | jev_events | 563 |
| 5 | jev_workspace_artifacts | 22 |
| 6 | jev_evolution_events | 865 |
| 7 | jev_evolution_directives | 0 |
| 8 | jev_evolution_sweeps | 0 |
| 9 | jev_evolution_queue | 0 |
| 10 | jev_evolution_atoms | 0 |
| 11 | jev_evolution_candles | 0 |
| 12 | jev_evolution_memory | 0 |
| 13 | jev_memory_log | (count at build) |
| 14 | jev_corpus_runs | 385 |
| 15 | jev_leads | 0 |
| 16 | jev_learnings | 2 |
| 17 | maps | 8 |

## Kept (never touched)

jev_automations (3), jev_policy_changelog (20), jev_workspaces (35), outcomes (12), jev_switches (2), the policy document jev-policy.json in KV, and every other KV key. The KV overflow blobs `map-json:<id>` are NOT deleted. They are not in the normal clear set, so the report must list them as left behind.

## Decisions

- H1 Backup first. GET /api/jev/history/backup returns a JSON envelope: schema "jev-history-backup/1", created_at, counts, `tables` (every table in the cleared list, all rows, ordered by primary key), and `sha256`, the SHA-256 of JSON.stringify(tables) with table keys in list order. Also send header `X-Backup-Sha256` and `Content-Disposition: attachment; filename="jev-history-backup-<ts>.json"`.
- H2 Clear request: POST /api/jev/history/clear with body {confirm: "CLEAR HISTORY", backup_sha256, actor}. Validation: confirm must equal the string exactly, else 422 INVALID_CONFIRM. backup_sha256 must be 64 lowercase hex, else 422 INVALID_BACKUP_SHA. actor must be a non-empty string, else 422 INVALID_ACTOR.
- H3 Stale backup guard. The server recomputes the backup in the same way. A mismatch returns 409 BACKUP_STALE with the current counts, and nothing is deleted.
- H4 In-flight guard. If any jev_tasks row has a state outside the module's terminal set (TERMINAL_STATES, reuse the existing set), return 409 TASKS_IN_FLIGHT with the count, and delete nothing.
- H5 Delete in list order. Each table is one DELETE statement. If the D1 batch API is available, run the whole delete as one batch so it is atomic. The memory driver must behave the same. After the delete, append `history_cleared` to jev_events with {actor, backup_sha256, cleared: {table: n}, kept: [...]}. Return {ok: true, cleared, backup_sha256}.
- H6 Partial failure. If a step fails, stop, return 500 CLEAR_PARTIAL with the counts already removed. Rows are not restored, but the backup exists.
- H7 Auth is the same operator bearer as the other /api/jev routes. No policy write, no version bump, no change to approvals.
- H8 The sha check is the concurrency guard. The console runs GET then POST quickly. A 409 BACKUP_STALE means retry from the start.

## Console contract (Pause card)

A "History" subsection below the Pause controls. Sub text: "Clears task, event, learning, corpus run, evolution, and map history. Automations, the policy changelog, workspaces, outcomes, and switches stay. A backup downloads first. Refused while any task is in flight."

- Button `id="clear-history"`, danger style. Status line `id="clear-history-status"`.
- Click flow:
  1. GET /api/jev/history/backup. Trigger a download of the body under the attachment filename. If the GET fails, stop and show the error.
  2. Open dialog `id="clear-history-dlg"`. List the row counts from the envelope and the kept tables. Show a text input `id="clear-history-input"` that must read exactly CLEAR HISTORY. The confirm button `id="clear-history-confirm"` stays disabled until it matches. Cancel is `id="clear-history-cancel"`.
  3. POST /api/jev/history/clear with backup_sha256 from the envelope and actor "console".
  4. Show "cleared N rows across M tables". Refresh the overview.
  5. 409 BACKUP_STALE shows "Data changed while backing up. Try again." 409 TASKS_IN_FLIGHT shows "N tasks are still running. Clear after they finish." Other errors show the message.
- Use a native dialog element like the existing action dialogs. Do not use window.confirm for this one, since the typed phrase is required.

## Acceptance

1. GET backup returns every listed table. Counts equal D1 COUNT(*) at that moment. The sha matches a recomputation.
2. POST with a wrong sha returns 409 BACKUP_STALE. Row counts are unchanged.
3. POST while a task is non-terminal returns 409 TASKS_IN_FLIGHT. Row counts are unchanged.
4. POST with a wrong confirm string returns 422. Row counts are unchanged.
5. POST with a correct request empties only the listed tables. Kept tables keep their counts. The history_cleared event is present. (The build does NOT run this live. It needs Jenny's explicit go.)
6. The console has the button in the Pause card, a typed confirmation, the download before the POST, and no path that skips the dialog.
7. Unit tests (memory driver) cover H1 to H8, the delete order, and the kept set.

## Live checks allowed during the build

Acceptance 1 to 4 only. No live clear.
