# Subtask Work Notes — Author Integrity Fix

## Background

Historically `TM_subtasks.work_notes` was a single mutable NVARCHAR field. The creator
could switch a child assignment to themselves, edit the field, then restore the
prior assignee, leaving misleading attribution. Earlier Work Notes have no
reliable author in their saved text; activity history records mutation actors
but not a version of the text for each mutation.

## Behavior

1. For non-collaborative **General Tasks** whose main assignee is another user,
   the creator may not explicitly assign any child back to themselves.
   The server checks both the `PUT /general-assignments/subtask/:id/assignee`
   and initial child creation paths. The picker excludes the owner too.
2. Reassigning the **main** task to someone else is blocked when a child is
   explicitly assigned to the creator. First set those children to *Inherit*
   or select an eligible different executor; then change the main assignee.
3. Existing `TM_subtasks.work_notes` is **preserved untouched** and displayed
   in the child as a read-only legacy note, marked **author unverified**. No
   guessing of historical authors.
4. New notes are **append-only** rows in `TM_subtask_work_note_entries`, with
   the authenticated actor's `author_user_id`, an immutable timestamp, and
   content. The service does not permit editing or deleting these entries.
   The creator can read authorized subtask notes but cannot impersonate authors.
5. Current authorized child executors add a note through
   `POST /api/general-assignments/subtask/:subtaskId/work-notes` with body
   `{ "workNotes": "..." }`. The old `PATCH` returns 409 to prevent stale clients
   from rewriting previous text; reload the frontend after deployment.
6. Reassignments do not remove notes or history. Former assignees lose ordinary
   task access through the existing task policy, not their attribution.
7. Meeting, KPI, and collaborative-assignment workflows retain their existing
   selection/assignment policies. Meeting subtasks use the same append-only
   Work Notes behavior without the General Task creator restriction.
8. Existing task activity records include the actual actor. New note activity
   adds the corresponding `noteId`, and the existing task-activity email event
   continues to notify the task creator when another assignee adds notes.

## Deployment order

1. Back up QNHDB and review the migration. Ensure previous migrations,
   including **065**, were successfully applied.
2. Apply the ZIP patch through the TaskHub patch script and review the preview.
3. Run **server/database/migrations/066_immutable_subtask_work_notes.sql**
   manually in QNHDB, once (idempotent if already present).
4. Deploy and restart backend and frontend together; refresh the browser.
5. Test a new Work Note, verify its saved author; reassign a child and check
   that its old notes stay unchanged; verify an unassigned user cannot POST.
6. Attempt creator self-assignment via UI and API while another user owns the
   main task; verify HTTP 409. Confirm meeting/collaborative tasks still work.

The ZIP patch does **not** execute SQL. Do not deploy the backend before the
new table exists; Task Details now reads it. File uploads and other task
attachments are not altered by this change.

## Validation status

TypeScript/TSX parsing, structural source checks, ZIP manifest and archive
integrity checks are performed in the preparation environment. Project builds,
SQL Server execution, mail delivery, and browser/end-to-end tests require the
local project dependencies and QNHDB and are not claimed here.
