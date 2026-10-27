# Completion Summary — author-attributed updates (Migration 067)

## Why
Previously `TM_tasks.completion_summary` was a single editable text column. Reassignment allowed a new executor to replace the text another employee wrote.

## New behavior
- The legacy `TM_tasks.completion_summary` value is **not altered or migrated**. It is displayed read-only as **historical content with unverified authorship**. Do not label it as the original creator or last editor.
- New writes use `POST /api/general-assignments/task/:taskId/completion-summary`. The server takes the author ID only from the authenticated request; each nonblank summary creates a new immutable row with UTC timestamp. The current accountable assignee (or the owner on an unassigned personal task) can add new entries.
- `PATCH` to the previous endpoint intentionally returns HTTP 409 `COMPLETION_SUMMARY_UPGRADE_REQUIRED` rather than silently overwriting the legacy field from a stale client.
- Task details return `completionSummaryEntries` ordered by timestamp and ID. Creator and current authorized assignee can read history; unauthorized task users cannot. The existing external-share and restricted collaborative-task privacy masking applies.
- Activity history records `COMPLETION_SUMMARY_UPDATED` with `{entryId}` and the actual actor. Existing activity codes remain valid; no new notification event is introduced.
- Reassignment does not modify prior summary entries or authorship. Reopen does not delete history.
- Entries are append-only via the API; there is no edit/delete action. Do not grant write access to a removed assignee.

## Deployment
1. Back up QNHDB. Apply all previous TaskHub migrations, including 065 and 066.
2. Apply this ZIP using the TaskHub preview/apply script and review source changes.
3. **Manually review and run `067_immutable_completion_summary_entries.sql` once** against QNHDB before starting the updated server. Applying a ZIP does not execute SQL.
4. Deploy backend and frontend together. Refresh browser sessions so no stale client uses PATCH.
5. Run backend/client builds and focused tests. Test creator/assignee permissions, an old task with saved text, reassignment with multiple entries, and returning task history.

## Rollback and compatibility
- Source can be rolled back with the project restore script. Keep additive database table in place unless a separate reviewed data migration is approved; never drop historical entries for rollback.
- Legacy Completion Summary text remains readable, but older clients cannot update it once the new backend is live.
- This update does **not** implement Completion Summary email alerts; that separately requested feature remains pending.
