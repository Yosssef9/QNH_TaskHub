# QNH TaskHub — General Task Assignment Email Notifications

## Scope

Extends the existing General Task assignments (migration 048) using the current TaskHub in-app notification records, preferences, `TM_email_outbox`, email worker, and branded bilingual email templates. No new queue or worker, organizational roles, new approval states, or attachment exposure.

### Email events (each separately selectable; default enabled)

- `GENERAL_TASK_ASSIGNED` — new main assignment, delivered to the new assignee.
- `GENERAL_SUBTASK_ASSIGNED` — new individual/inherited subtask assignment, delivered to that subtask's assignee.
- `GENERAL_ASSIGNMENT_REMOVED` — previous assignee after reassignment or unassignment; message deliberately has no task/subtask title, subtask ID, or deep link.
- `GENERAL_TASK_DUE_CHANGED` — changed (including cleared) main task deadline, main assignee only.
- `GENERAL_SUBTASK_DUE_CHANGED` — changed (including cleared) subtask deadline, that subtask's effective assignee only.
- `GENERAL_TASK_COMPLETED` — main task completed manually or automatically; creator and main assignee (excluding actor).
- `GENERAL_TASK_REOPENED` — main task reopened manually or automatically; creator and main assignee (excluding actor).

`GENERAL_SUBTASK_COMPLETED` is a **bell-only** update for non-final subtask progress; it never creates email. Final subtask completion generates just the main task-completed notification, avoiding double completion alerts. No notification is sent to a user for their own action.

## Privacy, staleness and delivery semantics

- A subtask email contains its parent task title plus only the recipient's own subtask title and deadline. No sibling subtask titles, users, notes, or attachments appear in the email.
- A prior assignee who loses access receives only a generic removal message. Links to revoked content are intentionally absent.
- The email pipeline checks current active Portal + TaskHub status, email master switch, per-event preference, and active (Portal or verified alternate) destination. It revalidates actual general assignment, subtasks, due dates, deletion, completion state and task category **at queue time and again before SMTP delivery**. Stale jobs are cancelled instead of sent. For pending new-assignment events, it also compares the notification time to the assignment-change time to avoid delivering an old notice after reassignment cycles.
- The existing background worker handles retries and delivery; external SMTP cannot guarantee exactly-once inbox delivery in network-failure windows. `SENT` means accepted by the transport, not necessarily read.
- The notification inbox remains permission-safe: task creators see their tasks; assignees can open the main task with server-filtered subtasks. The SQL/HTTP backend is the source of truth.

## Migration 049

Prerequisite: the SQL schema through migration 048 and the bundled TS-build fix. Apply only `server/database/migrations/049_add_general_task_email_notifications.sql` separately against `QNHDB` **before starting the updated backend**.

Migration 049 adds nullable `TM_notifications.subtask_id`, nullable `TM_subtasks.assignment_changed_at_utc`, checked new notification/email-preference values, and seeds missing default-on preferences without changing existing user choices. No backfill or catch-up email blast occurs: older general assignment notifications were already marked processed. This migration is a separate operator-controlled database step and is **not executed by the ZIP patch**.

## Deployment and checks

After applying migration 049, restart the updated backend/email worker and deploy the updated client. Email sending requires existing `EMAIL_ENABLED=true`, working SMTP credentials, and the recipient's active email address/settings. No new environment variables/dependencies are introduced.

Verify:
1. Create assignment A; A receives bell and optional email; self-assignment does not email.
2. Assign subtask B; B receives only their subtask content. A/others do not receive the sibling content.
3. Reassign B to C while the email is queued; B's stale assignment email is cancelled, B receives only a generic removal email, and C gets their own new assignment.
4. Update main/subtask due dates; only affected assignees receive emails. Clear due dates and confirm `No due date`. Revise the due date again before dispatch and verify the obsolete email is cancelled.
5. Complete all subtasks; creator/main assignee receive one main completion email. Intermediate subtask completions are bell-only. Reopen and verify the new main-task status email.
6. Disable one event preference or master email switch; confirm in-app remains active while emails are suppressed.
7. Confirm Meeting Action Item, KPI, private tasks, Arabic/English, inaccessible subtask downloads and email worker retries behave as before.

Tests bundled: `server/tests/unit/general-task-email.test.ts`; these tests are mocked and do not exercise SQL Server or SMTP. Full server/client builds and actual Windows SQL/SMTP tests must be run locally before production use.

## Rollback

Restore project files with the user's patch-tool backup. Do not casually drop column/data or purge email outbox records as part of a source-only rollback. Pause the worker if source/schema versions diverge, and obtain a separate reviewed database rollback plan if needed.
