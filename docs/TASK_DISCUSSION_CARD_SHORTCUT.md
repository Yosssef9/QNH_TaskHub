# Discussion shortcut on task cards

## UI behavior

- A compact, green-accented speech-bubble icon appears for a task with an authorized, multi-person discussion audience, even when the unread count is zero.
- Unread messages are indicated by a small numeric badge (up to `99+`).
- Clicking the shortcut opens Task Details directly on Discussions. Other clicks on the task card continue opening its regular overview.
- Covers My Tasks, Assigned to Me (general and Meeting Action Items), Meeting Follow-up overview/list, and assigned-task entries in Shared Tasks. Shared-only VIEW/EDIT access does not grant discussion permissions.
- Legacy subtasks show a matching shortcut when a distinct assignee participates in their conversation, and its unread count is scoped to that subtask.
- Personal/KPI/unauthorized cards do not show the shortcut.
- Search-result focus rings clear after 2.5 seconds with a fade; they do not remain selected.

## API behavior

The existing batch `GET /api/task-discussions/unread?taskIds=...` response retains the same `Record<number, number>` shape. Keys now identify tasks with an eligible multi-person discussion, including a value of `0` for no unread messages; keys are omitted for solo tasks, KPI tasks, and requests without assignment rights. Clients should use key presence to decide visibility and values for unread badges.

The eligibility query follows the existing owner, collaborative-assignment, legacy main-assignment and delegated subtask membership paths. Existing discussion authorization remains the final authority for reads/writes. No new database migration is required.

## Deployment / validation

- Apply the ZIP with the normal PREVIEW workflow; deploy server and client from matching versions.
- No SQL migration.
- Validate My Tasks/Assigned to Me/Meeting Follow-up/Shared by Me with two accounts, with and without unread messages.
- Check that a recipient with only Task Sharing permission cannot open discussion; check child-only assignees see only permitted subtask conversations.
- Verify chat icon clicks open Discussions and normal card clicks open Overview.
- Validate live updates, Arabic/English, RTL/LTR and mobile layout in browser.
- Confirm server and client builds and run `pnpm exec vitest run src/features/tasks/discussions/DiscussionShortcut.test.tsx` from `client`.
