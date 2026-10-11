# QNH TaskHub — General Task Assignment Phase 2 (Frontend & Integration)

## Prerequisites

Apply the complete Phase 1 backend ZIP **first**, separately review/run SQL migration `server/database/migrations/048_add_general_task_assignments.sql` against QNHDB, and deploy its backend before opening Phase 2 UI. **Phase 2 has no new SQL migration.** Never run migrations merely by extracting or applying a ZIP.

This patch assumes the Phase 1 `general-assignments` routes and the Phase 1 task/subtask detail response shape. If Phase 1 is not already installed, the Phase 2 UI will not work. Installation is separate from production deployment/build/restart.

## Frontend behavior

- The existing **Create Task** dialog includes one optional searchable assignee field for ordinary personal-list tasks; leave it unselected for personal/private tasks. KPI task creation and Meeting Action Item creation retain their own workflows and do not gain this field.
- The existing **Task Details** workspace includes a permitted-status selector, main-task assignee control for the creator of an ordinary task, optional Completion Summary, and optional Work Notes for each permitted subtask. Editors save notes explicitly. The existing subtask-create dialog allows one optional individual assignee; existing child assignments can be changed from the subtask row by the creator.
- An individual child assignee sees the parent task and authorized main-level context, plus **only** their own child entries, notes and files. Their editing controls work only on those permitted children. The creator sees all children; the main assignee sees only the children assigned to them. The parent progress count still reflects all children.
- A task without any subtasks can be completed by the authorized executor. A task with incomplete children cannot be manually marked Done, and the UI gives a concrete localized toast indicating how many remain without revealing hidden child names. Backend remains the authority. When the last child completes, Phase 1 automatically marks the parent Done and invalidates related views.
- The same Task Details status control covers personal/Meeting/general tasks, preserving server capabilities (assignee cannot cancel; Meeting viewers are read-only). Cancellation still requires a reason. No completion approval, mandatory evidence, or comments workflow is introduced.
- **Assigned to Me / مسندة إلي** has All, Meeting Tasks and General Tasks source tabs. Meeting items continue through their original authorized endpoint, while general items come from the new endpoint. All shows two distinct sections, each with its own server-paginated results, rather than merging two incomplete pages into a misleading global sort. Search/status/priority/due/sort apply to both; grouping operates within the visible page. Main and child assignments are grouped under one parent card; general subtasks shown in it are limited by the server to current user's authorized children.
- Task assignment drop-downs search active TaskHub users by name/user code, and resolve the current selection by ID even outside the initial search page.
- Arabic/English, RTL/LTR, theme components, query invalidation, safe private attachments and original meeting authorization are retained.

## Backend addition in ZIP 2

The Phase 1 general-assignment listing endpoint now accepts optional validated `status`, `priority`, `due`, `sortBy`, and `sortDirection` parameters, with the same `search`, `page`, and `pageSize`. SQL ordering is selected only from an internal fixed map, not request-supplied SQL text. An authenticated active-user ID-lookup endpoint, `GET /api/general-assignments/eligible-users/:userId`, resolves the chosen person's name for the picker. It does not authorize task access; assignment/task details still enforce the existing server policies.

## Security and rollout

- Task assignments grant no access to the owner's list or KPI/Meeting contents. Backend Phase 1 still controls parent, child, history and attachment authorization; React UI never substitutes for it.
- A main assignee who is not a child executor cannot edit anyone else's child. Child-only assignees are not offered a parent-file upload. Task creator retains assignment management. The main task summary is editable by its executor; Work Notes by the child executor.
- This patch changes no permissions on the existing Meetings source. Meeting Action Items continue to use their original full-meeting-viewer read policy.
- No external email event or new email preference is created; Phase 1 continues using in-app notifications.
- Existing private, KPI and Meeting task records are not backfilled or rewritten by ZIP 2.

## Validation and manual acceptance

The ZIP was statically checked for TypeScript/TSX syntax, relative file references, and complete-file manifest integrity. Full frontend/server builds, TypeScript semantic checks under the project's pinned node_modules, Vitest/Playwright, live SQL Server, real Portal accounts, browser, notifications and production deployment **were not run in this container**. The modified Task Editor regression test checks the new optional assignee payload, but the test runner has not been executed here.

Recommended on the user's PC:

```powershell
Set-Location "D:\My Projects\QNH\QNH_TaskHub"
pnpm --dir client exec vitest run src/features/tasks/components/TaskEditorDialog.test.tsx
pnpm --dir server exec vitest run tests/unit/general-task-assignments.security.test.ts tests/unit/meeting-action-items.readonly.test.ts
pnpm --dir server build
pnpm --dir client build
```

Manual acceptance using at least five active test users (creator, parent assignee A, child assignees B/C/D): create an ordinary task and assign A; create three children assigned B/C/D; verify A sees parent + aggregate progress but not B/C/D's child details; B/C/D each sees only own child, adds notes/files and completes their own child; parent auto-completes at 3/3; incomplete manual Done shows a clear toast; owner can view all children, edit/reassign their assignees, and cannot complete another's children. Verify Meeting Action Items, private personal tasks, KPI tasks, direct guessed subtask/file URLs, and both languages. Inspect notifications and activity after all changes. Test cancellation and due-date filters.

## Install and rollback

Use `D:\ChatGPTZipTools\Apply-TaskHubPatch.ps1` with the ZIP stored at `D:\Downloads` and the project at `D:\My Projects\QNH\QNH_TaskHub`. First run **preview without `-Apply`**, then rerun with `-Apply`, confirm uppercase `APPLY`. After applying review `git status --short` and `git diff` and run your local validation before deploying/restarting the application. For a source rollback, use `D:\ChatGPTZipTools\Restore-TaskHubPatch.ps1` with the actual generated backup folder and confirm `ROLLBACK`; do not remove migration 048's data as part of a source rollback.
