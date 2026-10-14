# Task Sharing (Migration 053)

Task Sharing grants explicit `VIEW` or `EDIT` access to an existing General Task or Meeting Action Item. Grants are **not assignments**: they do not affect completion, assign recipients to subtasks, or transfer ownership.

## Deployment

1. Back up QNHDB. Ensure previous TaskHub migrations (including 050 and 052) are installed.
2. Stop the backend. Preview and apply the Task Sharing patch using the user's ZIP patch script.
3. Execute `server/database/migrations/053_add_task_sharing.sql` manually in SSMS against QNHDB; the ZIP applier does not run database migrations.
4. Run `pnpm --dir server build` and `pnpm --dir client build` from the project root; restart backend and frontend.
5. Check tests and test sharing, editing, revocation, notifications, and permission boundaries in a test environment.

## User-facing behavior

- The task stays in the creator's original list.
- `Shared Tasks` is a virtual list with `Shared With Me` and `Shared by Me` tabs.
- The task owner selects up to 30 active users and assigns an independent `VIEW` or `EDIT` grant to each. The Save operation atomically synchronizes the complete recipient set (including removals).
- `VIEW` exposes the task's shared details and parent-level shared files, not other people's private notes/evidence.
- `EDIT` additionally allows updates to the task's shared metadata, tags, shared parent files, and existing subtask descriptive fields. It does not grant assigning/removing people, completing on behalf of others, changing task status, deleting, moving tasks, or resharing.
- For Meeting Action Items, recipients must be authorized meeting attendees/organizer; this policy is checked at grant time and read time.
- KPI tasks cannot be shared.
- Share grant/revoke/change events are recorded in the task activity log and trigger in-app and preference-controlled email notifications.

## Technical notes

- `TM_task_shares` is the authoritative grant source; no task copies are made.
- Task access uses the existing `resolveTaskAccess` authorization path.
- Shared task collections use authorization-aware database queries with server-side pagination and tag/status/priority filters.
- Private contribution data must not be returned by task-detail, attachment, activity, or collaboration APIs to users authorized **only** through sharing.
- Existing assignees remain assignees even if their share grant is revoked. Access is additive, not destructive to an existing assignment.


## Shared Tasks toolbar and relationship filters (October 2026)

`Shared Tasks` uses the same `TaskCollectionToolbar`, custom Select controls, task-type, status,
priority, tags, due-date, sorting and grouping presentation as regular task lists. Sorting and
all filters are applied on SQL Server before paging; grouping is presentation-only within the
returned page, matching the existing task-list behavior. Sharing does not change a task's
ownership, assignment or completion state.

The People filter only offers users with **active, authorized share relationships** for the
selected tab (`GET /api/task-shares/people?tab=with|by`):

- **Shared With Me**: select a task owner who shared a task with the current user.
- **Shared by Me**: select an active recipient who received one or more of the current user's tasks.

Search within the People picker matches user name, user code and email. Switching tabs resets
only the People selection, because owner and recipient scopes differ. Choosing a recipient
filters the full result set, not just the current page. If the same task is shared with multiple
recipients, that task appears once; its recipient count reflects all active shares, not just the
selected person. Backend query validation and authorization always apply, including the
existing Meeting Action Item participant checks. There are no new grants or data migrations.

`Share Task` continues using the existing searchable multi-user picker; each selected recipient's
VIEW/EDIT permission uses the custom TaskHub Select with icon and explanation. `Edit Shared
Task` reuses the existing custom priority selector and DatePicker. Both remain bilingual and
respect application direction and theme.
