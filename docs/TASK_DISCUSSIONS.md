# Task Discussions (TaskHub, October 2026)

## Product scope

One parent discussion exists per assigned task; each subtask has its own discussion. Both use the same source-of-truth messages table, authorization policy, file storage, and live-event API. Discussion messages are **shared communication**, not private collaborator Work Notes, evidence, completion summaries or task activity.

- Task creator may access all scopes; ordinary assignees may access their currently assigned main task / child scopes only.
- Collaborative teams share each scope with all active members **of that same scope**, without revealing private evidence or sibling-subtask discussions.
- Inherited subtask teams change authorization as assignments change. Revoked members lose API and live-stream access. Original message author IDs survive reassignment.
- Meeting Action Items, including historical Meeting Action Items, follow the same task rules. A Meeting invitation alone does not grant discussion access. Task Sharing alone does not grant discussion participation.
- KPI tasks do not receive discussions. Cancelled tasks retain readable history but reject new discussion writes.
- Message authors can edit/soft-delete their own messages. Subtasks with discussion history may not be physically deleted; the API explains this with `SUBTASK_DISCUSSION_EXISTS` (409).
- Messages are saved in SQL Server before live events; client request IDs prevent duplicate sends on retry. Historical messages are loaded from SQL Server after reconnection.

## Data and operations

Migration **059_add_task_discussions.sql** is additive: messages, immutable edit/delete audit revisions, per-scope last-read markers and protected file metadata. It preserves existing task and meeting data; it also extends (rather than replaces) existing notification and email-preference type constraints.

The server uses authenticated **HTTP streaming (Server-Sent Events)** instead of an extra Socket.IO package. Messages and typing signals arrive without page refresh, with existing JWT Bearer authentication. This is a deliberate zero-new-dependency alternative; it supports one server process and requires the reverse proxy to permit streaming and disable response buffering. **Multiple Node/PM2 instances require a shared broker** before deployment to ensure users on different instances receive the same live events; SQL remains the source of truth and periodic query reconciliation is the safety net.

Main task cards and Assigned to Me cards use one batch unread-count endpoint with backend SQL membership filtering. Subtasks have a direct discussion shortcut; unread numbers are refreshed periodically on cards and immediately for an open conversation.

Main endpoints are `/api/task-discussions/:taskId/scopes`, `/messages`, `/members`, `/typing`, `/read`, `/live`; message edit/delete and file download/preview are under `/api/task-discussions/messages` and `/files`. Every read, write, download and live subscription applies independent scope authorization. The user-code `@mention` picker contains only eligible participants.

Notifications: in-app notifications for ordinary messages and mentions; ordinary discussion emails default OFF, direct user-code mentions default ON and respect master preferences / send-time membership checks. Notifications do not reveal message bodies or private evidence.

Files: use the same private storage, upload limits and authorized preview/download pattern as regular task files. File metadata belongs to the message, not to the public task attachment list. **Migration 060** adds optional deletion metadata to discussion files. The original message author (the only permitted uploader) may delete a file while still authorized for that discussion. Deletion is confirmation-based, makes the file disappear from lists, revokes preview/download by ID, removes its stored binary after the SQL transaction, and preserves the original filename, author relationship, and deletion actor/time for audit. Deleted messages remain read-only and their files cannot be changed.

## Deployment

1. Apply the consolidated source ZIP via **PREVIEW** first and inspect the list; deploy backend and frontend from the same release.
2. Back up QNHDB. Separately review and manually run **migration 059**, then **060** on SQL Server **before starting the new backend**. Never execute migrations automatically from the patch.
3. Build server and client with `pnpm build`, run the focused Vitest suites, and confirm the app's HTTP proxy supports `text/event-stream` at the API path.
4. Test with two Portal accounts simultaneously: main task, shared subtask, subtask-only user, removed member, read-only share, historical Meeting Action Item, attachment preview, reconnect, bilingual messages, notifications and disabled email preference.
5. Perform a production-like smoke test before promoting the release. Runtime DB and browser verification cannot be performed against the user's environment from the snapshot alone.

## Limits and operational safeguards

- Live message delivery is best-effort; SQL messages are durable, and clients re-fetch after reconnect. Do not assume SSE delivery alone means a message was read.
- Email preferences avoid immediate ordinary-chat email spam by default; mentions are opt-in/out through existing Settings.
- Unread markers advance monotonically and cannot be set beyond persisted messages in that exact conversation.
- Rollback through patch backups restores source files, **not** database migration 059. Keep the additive schema during application rollback until a separately approved database remediation plan exists.


## My Discussions inbox contract (October 26, 2026)

- `GET /api/task-discussions/inbox?filter=all|unread|mentions|empty&limit=25` lists authorized task/subtask scopes. Existing discussion histories are shown first (newest message ID first). `all` then includes unstarted scopes, while `empty` lists only unstarted scopes.
- **Unstarted** means the scope has no non-deleted discussion messages. These scopes appear before anyone sends a first message only when at least two currently authorized, active TaskHub/Portal participants can read that same scope. Neither Task Sharing alone nor a sibling-subtask assignment makes a user a participant. Existing one-person conversation histories remain readable.
- An unstarted scope has `lastMessageId: 0`, `lastPreview: ""`, `lastAtUtc: null`, `senderName: ""`, `unread: 0`, `mentions: 0`, and an accurate `participantCount`. No fake message or read-state row is inserted.
- Inbox pagination uses **positive message-ID cursors** for existing message histories and **negative offset cursors** for unstarted scopes. Clients must pass the opaque `nextCursor` unchanged, including when it is negative, until it becomes `null`.
- `GET /api/task-discussions/inbox/mentions?limit=25&beforeId=...` provides one item per mention message (stable mention identity or legacy `@userCode` text). Deleted messages are excluded and current task/subtask authorization is checked before returning any body. The response includes `messageId`, scope IDs/titles, `body`, `createdAtUtc`, `senderName`, `unread`, and `nextCursor`.
- These endpoints reuse existing SQL tables including the stable-mentions table from **migration 063**. No additional migration is needed for this API change, provided all prior discussion migrations are already deployed. Deploy the updated server build, then check All / Unread / Mentions / No messages with a second active user and a child-only assignee. Refresh and repeat after revoking access.
