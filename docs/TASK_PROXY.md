# Task Proxy / وكيل المهمة

## Purpose

A main responsible employee may appoint **one active proxy per task**, and each responsible
subtask employee may appoint **one active proxy per subtask**. The responsible employee remains
the accountable assignee; a proxy is not a second main assignee or a collaborator.

### Example

The CEO assigns a general task to Ahmed. Ahmed appoints Mohammed as task proxy.
Mohammed can update status, append Completion Summary entries, attach evidence, and participate
in the main discussion. He may complete Ahmed's task if all subtasks meet the existing completion
rules. Task details still identify Ahmed as responsible, and the Activity Log records Mohammed
as the actual actor. The CEO receives the normal task completion event.

If a child subtask belongs to Youssef, Mohammed's main proxy grant **does not** give him
Youssef's subtask. Ahmed can appoint a separate proxy for each eligible subtask of his own;
other responsible employees can choose their own subtask proxy.

### Boundaries

- Normal single-responsible **general tasks** and collaborative **general-task assignments** are supported.
  Every collaborative assignee manages only the proxy on *their own individual assignment*.
  Existing one-member collaborative tasks are supported without conversion. Meeting Action Items,
  KPI/personal tasks and their authorization rules are unchanged.
- Only the *current responsible assignee* manages their own proxy; the task creator, unless
  themselves the responsible assignee, and existing proxies cannot re-delegate.
- The task creator cannot be appointed as proxy, and self-appointment is rejected.
- Every write rechecks the current assignee, active proxy row, and authorized task/subtask scope.
- For a collaborative assignment, one proxy can execute that particular active assignment,
  including its personal notes, uploads, chat scope and Done/Reopen action. The member still
  counts as one responsible employee in progress (a proxy is not an additional obligation).
  Parent and child collaborative assignments have separate proxy grants: assigning a main
  proxy does not automatically delegate another child's assignment. This prevents crossing
  another worker's private subtask scope.
- Proxy can execute tasks, complete eligible subtasks, write separately attributed work notes,
  upload authorized attachments, participate in discussion and add Completion Summary entries.
- Proxy cannot change the primary responsible assignee, manage task metadata as the creator,
  assign or remove a proxy, access a different employee's subtask, or bypass completion rules.
- Proxy actions preserve the authenticated user's own ID in the audit log, Work Notes,
  Completion Summaries, and uploaded file metadata. Historical contributions remain after
  removal; the proxy loses access through this role immediately.
- Task main-assignee changes revoke its main proxy and proxies on inherited subtasks;
  explicit subtask reassignment revokes that subtask proxy if responsibility changes.
- Proxy access to in-app discussion messages and attachments is limited to authorized scopes.
- New tasks created with exactly one selected assignee now use the standard single-assignee
  assignment engine. Tasks created earlier as one-person collaborative tasks retain their
  original collaborative progress and history, but now expose the proxy control in My Work.
- Collaborative proxy permissions depend on an active principal assignment; when its
  membership is removed, the grant is cleared. All past notes and files remain attributed
  to the actual writer/uploader. The task creator remains responsible for managing team
  membership; only the assignee manages their proxy.
- A collaborative task uses its existing **My Work / Work Notes**, not the legacy single-task
  Completion Summary. Proxy access doesn't introduce a new completion-summary field there.

## Deployment

1. Back up QNHDB and verify migrations **065–067** have been reviewed and applied.
2. Preview/apply TaskHub patch using the established PowerShell patch tool.
3. Manually review and execute `server/database/migrations/068_task_proxies.sql` against **QNHDB**.
   It is additive; it creates a grant-history table and indexes. The ZIP never runs SQL.
4. After 068, apply additive `server/database/migrations/069_collaborative_assignment_proxies.sql`
   manually to QNHDB before starting the revised server; it adds proxy columns to
   collaborative assignments. Nothing in the ZIP executes SQL.
5. Build and deploy **backend and frontend together**, then run a browser and permissions
   smoke test with distinct real accounts; do not substitute mocked tests for live verification.
6. Keep old migrations and tables on rollback: restoring code files does not reverse the DB.

## Regression checklist

1. Creator assigns new task to Ahmed. Ahmed can add Mohammed as proxy; CEO sees Ahmed
   responsible and Mohammed as proxy. Mohammed sees the task under Assigned to Me as Proxy.
2. Mohammed adds a Completion Summary, a child Work Note, a main/child attachment, and a
   discussion message. Each entry identifies Mohammed, never Ahmed, as author.
3. Mohammed completes eligible work. Main status remains blocked if a subtask remains
   unfinished; once eligible the activity log records Mohammed as actor and Ahmed as responsible.
4. With a subtask assigned to Youssef, confirm Mohammed cannot view its notes, files,
   messages, or update/complete it (including guessed direct API requests/URLs).
5. Ahmed removes Mohammed: access and notification membership immediately end. Historical
   contributions remain visible to still-authorized participants.
6. CEO reassigns the main task from Ahmed to Youssef: Ahmed's main proxy ends, and inherited
   child proxy grants cannot revive if reassigned back. Explicit subtask proxies are revoked
   when their own accountable assignee changes.
7. Creator cannot appoint a proxy on someone else's behalf. Proxy cannot add a second proxy.
   Inactive users, creator as proxy, and duplicate grants are rejected.
8. Verify main/subtask chat read receipts, mentions, file previews and downloads are scoped;
   old URLs fail after revocation.
9. Verify Arabic/English and RTL/LTR displays, email worker preference and delivery checks,
   and no proxy access to Meeting Action Items or KPI tasks.
10. Create a task with one assignee from the Task Editor: it must be normal, with the Task
    Proxy control. Create one with multiple assignees: it remains collaborative, with a proxy
    picker per individual assignment in My Work and one-person legacy collaborative tasks.
11. Confirm a collaborative proxy can add a note, upload evidence and complete their
    principal's own assignment, but not a sibling. Remove them and retry saved URLs/API calls.
12. Check the note author and evidence uploader remain the proxy's real name in history,
    including after the grant is removed. Audit completion actor as proxy, while the original
    assignee remains responsible.

## Validation status

Static TS/TSX parsing, SQL structure and ZIP checks can be run in this environment.
Full project build, database migration and real multi-account/browser/SMTP testing must be
run against the target TaskHub installation.
