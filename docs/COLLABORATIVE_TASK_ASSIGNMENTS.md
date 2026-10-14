# QNH TaskHub — Collaborative Task Assignment (final integrated release)

## Scope and business rules

- General Tasks and Meeting Action Items can have 1–30 primary assignees. KPI tasks remain unchanged.
- Tasks created with an `assigneeUserIds` array activate collaborative mode atomically with task creation. Existing single-user tasks can be explicitly converted by their owner in Task Details.
- Each assigned person has a separate immutable work-update history, evidence attachments, individual TODO / IN_PROGRESS / DONE state, and completion/reopening history. Notes and files are optional.
- The parent Task is DONE **only when all active main assignees** and all nondeleted subtasks are DONE; each subtask is DONE only when all active assignees for that child are DONE. Empty teams never satisfy completion.
- Subtasks inherit the parent's currently active members by default. An explicit custom team does not change when the parent team is edited. Adding/removing members recalculates all affected status values.
- The creator/Meeting organizer can view every individual's work and can reopen their submissions, but cannot complete a different person's assignment. A participant may submit/complete only their own assignment. Completed/reopened timestamps and removed-assignee work remain in history.
- Server-side list/read, direct download, write, and legacy Task/subtask APIs enforce content visibility. Private work entries/files are **never stored in** the old public-within-task `TM_attachments`/`TM_subtasks.work_notes` fields.
- A team member assigned only to a child can see the main task for context, and only their assigned child, their own private entries and files, plus permitted aggregate progress. Other children and individual contributions are not returned to them.
- Meeting eligibility remains restricted to invited active Portal users with active TaskHub access, excluding the organizer as an executor where the legacy meeting picker excludes them.
- Legacy assignment records are not dropped. Converting an existing completed task requires reopening it first. Legacy work notes/attachments are preserved.
- Reassigning in an already-collaborative Meeting Action Item uses its Team panel, not the legacy one-person Reassign action.

## Migration and deployment

1. Back up QNHDB and pause TaskHub server and background workers.
2. Preview/apply the patch ZIP to the Git project using `Apply-TaskHubPatch.ps1` with the documented manifest workflow.
3. Review then manually run **once**: `server/database/migrations/050_add_collaborative_task_assignment_foundation.sql` in QNHDB, after existing migrations 048 and 049.
4. Build both server and client, run the tests below, and start the upgraded TaskHub server/client together.
5. Perform test assignments in a non-production copy first, including a private-attachment direct URL test.

The ZIP does NOT run SQL migrations. It makes no changes to the database automatically.

## Verification checklist

- Create a General Task for user 573 and user 750; verify exactly two independent assignment entries, no duplicate task card, TODO before work starts.
- Add individual notes and attachments from each account; verify that the other user's account cannot read any sibling entries, file URLs, or assignment metadata.
- Complete only one user; parent remains IN_PROGRESS. Complete the last user; parent is DONE automatically.
- Reopen a member assignment as that member or creator; parent reopens. Preserve the prior completed history.
- Add inherited subtask: it starts with the current parent team. Change the parent team: inherited child updates, custom child does not.
- Change main/subtask deadlines: notifications go only to currently eligible assignees, with deduplicated in-app/email events.
- Meeting Action Item: select multiple invited attendees at creation; verify parent list shows team count; no legacy one-person status/reassignment controls.
- Subtask-only user sees the parent and their own child in Assigned to Me, not private sibling child data.
- Legacy one-person assignment and KPI tasks still behave as before.
- Verify soft-revoked users cannot access their old private files, while organizer audit history remains intact.
- Test absence of email, inactive Portal accounts, cancelled tasks, and closing/reopening a task with prior work.

## Automated checks

```powershell
pnpm --dir server build
pnpm --dir client build
pnpm --dir server exec vitest run tests/unit/collaboration.policy.test.ts tests/unit/collaboration.creation-schema.test.ts tests/unit/meeting-subtasks.privacy.test.ts
pnpm --dir client exec vitest run src/features/tasks/assignment/TaskAssigneeMultiPicker.test.tsx src/features/tasks/assignment/TaskAssigneePicker.test.tsx
```

`tsc` builds, Vitest suites, actual SQL transactions and SMTP delivery must be validated on the user's local environment if full dependencies and live services are unavailable in the patch-authoring environment.

## Recovery

Use the patch tool's restore/backup for source files. Do not remove new database tables or undo recorded assignment history without a separately reviewed SQL rollback and a backup. A source-only rollback against a database with active collaborative rows requires pausing all workers and evaluating data compatibility first.
