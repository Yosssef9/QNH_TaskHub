# General Task Assignment — Phase 1 (Database + Backend)

This release is the backend foundation for a two-stage TaskHub feature. The frontend controls, combined Assigned to Me view and status editor will be completed in ZIP 2. It does not introduce HOD/CEO hierarchy, approvals, mandatory evidence or another Task engine.

## Data model

- `TM_tasks` remains the only parent Task engine. An assigned general task is identified by a row in `TM_general_task_assignments` (one optional main assignee). It is **not** a Meeting Action Item and cannot be a KPI task.
- `TM_subtasks.assignee_user_id` is an optional explicit single-user override. NULL inherits the general main-task assignee, or the creator when the main assignee is NULL. Existing rows remain NULL and work as before.
- Work Notes on each subtask and Completion Summary on each task are optional, preserved on reopen and separate from instructions/Description.
- `auto_completed_from_subtasks` distinguishes automatically completed tasks from pre-existing/manual DONE tasks.
- New assignments may target active Portal users with active TaskHub access only. Application ADMIN remains separate from Task content visibility.

## Authorization

- Creator: controls parent/task properties, reassignment and subtask metadata; reads all subtasks. Cannot complete a main task assigned to someone else; may complete only their own effectively assigned children.
- Main assignee: reads main-task context, total aggregate progress, and only their effectively assigned subtasks. May change eligible main status and provide Completion Summary. Cannot complete another user's subtask.
- Individual child executor: reads the main task plus only their effectively assigned subtasks, Work Notes and child files; cannot modify the parent or other children.
- Full related Meeting content permissions remain unchanged; Meeting assignments are intentionally separate. Personal and KPI task permissions remain unchanged.
- Parent-level progress totals are intentionally global. Child titles, Work Notes, attachments, and child activity are filtered server-side. Old ambiguous attachment-removal events are hidden from general assignees.

## Backend interfaces (all authenticated)

- Existing `POST /api/lists/:listId/tasks` optionally accepts `assigneeUserId` (created atomically with task).
- Existing `POST /api/tasks/:taskId/subtasks` optionally accepts `assigneeUserId`; no value means inherited responsibility.
- `PUT /api/general-assignments/task/:taskId/assignee`: `{ "assigneeUserId": 123 | null }`.
- `PUT /api/general-assignments/subtask/:subtaskId/assignee`: same payload.
- `PATCH /api/general-assignments/subtask/:subtaskId/work-notes`: `{ "workNotes": "..." | null }`.
- `PATCH /api/general-assignments/task/:taskId/completion-summary`: `{ "completionSummary": "..." | null }`.
- `GET /api/general-assignments/eligible-users?search=&page=1&pageSize=20`: active users only.
- `GET /api/general-assignments/assigned?search=&page=1&pageSize=20`: one row per parent task, individually authorized child list.
- Existing Task detail, subtask-completion and attachment endpoints enforce general-assignment access.

## Task lifecycle

- When every non-deleted child is complete, the non-KPI, non-cancelled parent automatically changes to DONE inside the same transaction. With an incomplete child, manual parent DONE is rejected (TASK_SUBTASKS_INCOMPLETE). A previously auto-completed parent returns to IN_PROGRESS when a child reopens; cancelled parents remain cancelled. No-subtask tasks still complete manually.
- Work Notes and Completion Summary are optional, and can be edited after DONE. Meaningful mutations create activity. Assignment and completion generate in-app notifications only; no new email preferences/templates are activated in this stage.
- The creator's own My Tasks list remains private. General assignees gain per-task relationship access only, not the creator's list or any siblings' work.

## Installation

1. Preview and apply ZIP through `D:\ChatGPTZipTools\Apply-TaskHubPatch.ps1` against `D:\My Projects\QNH\QNH_TaskHub`.
2. **Before starting the updated backend**, back up the database and manually review/run only `server/database/migrations/048_add_general_task_assignments.sql` against QNHDB. No SQL is executed by the patch script.
3. Deploy/restart the backend. This stage does not yet expose a new create/assign control in the UI. ZIP 2 will provide the frontend.
4. Build/check backend and verify old personal/Meeting/KPI Task behavior. Perform cross-user privacy tests against direct guessed IDs, child attachments and activity endpoints.

## Rollback

Restoring source files via Restore-TaskHubPatch.ps1 does not reverse migration 048; the additive columns/table should be retained until a separately reviewed data migration is designed. Stop the updated backend before reverting source to avoid a mixed migration/runtime version.

## Validation status

Static TypeScript syntax parsing, ZIP path/manifest checks and basic SQL text checks can be performed without running the app. Live SQL Server execution, actual production Portal accounts, dependency installation, full TypeScript build and end-to-end tests require your local environment; they have not been performed here.
