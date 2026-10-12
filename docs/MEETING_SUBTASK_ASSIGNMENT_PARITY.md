# Meeting Action Items — private individual subtask assignment

Meeting Action Items use the existing general-task individual subtask-assignment functionality. This extension does **not** replace the Meeting organizer, meeting attendee, or main Action Item assignment model.

## Authorization

- Only the Meeting Action Item organizer/creator manages child records, assignment, due dates and ordering.
- A child can have exactly one explicitly assigned user, chosen from active TaskHub users who are attendees of that Meeting. The existing Meeting Action Item assignee picker intentionally excludes the organizer.
- A child with no explicit assignee inherits the *current* main Action Item assignee. Reassigning the main Action Item changes ownership of inherited children, not explicitly assigned children.
- Organizer/creator: all child names, notes, attachments, and child activity.
- Main Action Item assignee: parent context, parent summary/attachments, plus only explicit/inherited children assigned to that person.
- Child-only assignee: parent context, parent summary/attachments, plus only their own explicit/inherited children; cannot change parent status, completion summary, or parent metadata.
- Other invited attendees/coordinators: read-only parent context and parent attachments; no child names, notes, or child attachments, apart from aggregate completion counts.
- Subtask read permissions are checked in server-side Task Details serialization, and direct attachment/download/work-note/complete routes recheck effective assignment. Child activity mentioning someone else's child is redacted.
- Parent Completion Summary is written by the current main Action Item assignee, while each child's Work Notes and completion are written only by its effective assignee. Parent auto-completes when every child is complete, and auto-reopens after a child is reopened if it was auto-completed.

## Other surfaces

- Assigned to Me includes Meeting Action Items with at least one child explicitly/inherited assigned to the current person, even if they are not the main assignee.
- Assignment/reassignment, due-date and parent reopen flows reuse the existing verified general-task notifications and email worker. Meeting Action Item completion continues to use the existing Meeting notification path.
- Meeting-specific screens, PDF reporting, and action-item list cards contain parent information and aggregate child counts, **not** child titles, notes or individual attachments.

## Deployment

This patch requires the existing General Task Assignment migrations `048_add_general_task_assignments.sql` and `049_add_general_task_email_notifications.sql` to have been applied. **No SQL migration is included** because `TM_subtasks.assignee_user_id`, `assignment_changed_at_utc` and Work Notes storage already exist.

Run locally:

```powershell
pnpm --dir server build
pnpm --dir client build
pnpm --dir server exec vitest run tests/unit/meeting-action-items.visibility.test.ts tests/unit/meeting-action-items.readonly.test.ts tests/unit/meeting-subtasks.privacy.test.ts
```

Manual acceptance: create one Meeting Action Item with children assigned to separate attendees; verify owner sees all, each worker sees only their child, direct sibling file URL rejects, Work Notes write is restricted, child-only cannot change parent, inherited child follows main reassignment, Assigned to Me lists child-only parent, all children completed auto-completes main, reopening a child auto-reopens main, and old unrelated General/KPI tasks still behave as before.
