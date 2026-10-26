# Task Discussions — UI & interaction upgrade (October 2026)

## Intended experience

The existing `TaskDiscussions` is the *only* discussion implementation for normal, collaborative and Meeting Action Item tasks. No second chat application or independent message store was introduced. Task Details retains its existing navigation, while Discussions uses responsive chat bubbles, a scoped conversation list (hidden when there is only one), compact context actions, sticky composer, date/unread separators, saved conversation previews, and a full-screen workspace using the same React component.

- Full screen is local view state and does not navigate or clear a draft. `Esc` exits it. The floating layer is below the application's attachment preview/confirmation modal layer.
- Search is **server-side** within the selected authorized task or subtask discussion, matches persisted message bodies including older pages, and returns at most 50 most recent matches per request. SQL LIKE metacharacters are escaped; parameters are bound. Clicking a hit loads its surrounding older page and highlights it.
- The emoji picker is searchable and inserts into the draft. The eight supported quick reactions are persistent; each user may add/remove their own reaction per message. Reaction count, own reaction state, and message updates reload after SSE events.
- Reader counts use current authorized discussion membership and persisted read markers. They are not fake delivery receipts; the UI displays `read by X / Y` for messages written by the current user when at least one participant has actually marked the message read.
- Main and child scopes retain existing permissions: the creator accesses all conversations; assigned main/child members access only their own authorized scopes; sharing alone does not grant chat access. Private Work Notes and evidence remain separate.
- Attachments preserve preview/download and uploader-only audited deletion introduced in the preceding source patch. This UI release does not modify storage or revocation policies.
- Compose with Enter, add newline with Shift+Enter. The composer is sticky relative to its independently scrolling messages region; it shows reply context, edit mode and pending attachments.
- Existing authenticated SSE updates remain the live transport. No Socket.IO or dependency installation is introduced. Search and reactions are authorized REST endpoints. Read events now refresh other viewers' read-state indicators.

## Database deployment

**Requires** the deployed Task Discussions backend plus migration 059 and uploader-only deletion migration 060. Apply the source patch with Preview first. Review and run **migration 061** manually against a backed-up QNHDB before starting the new server. It adds only `dbo.TM_task_discussion_reactions` with composite PK and FKs; no existing messages or attachments are modified. This migration can be safely rerun. Never execute SQL migrations as part of the ZIP apply script.

Deploy the backend and client together. Verify the LAN proxy does not buffer `text/event-stream`. This in-memory SSE implementation assumes one Node.js/PM2 instance; multiple instances require a shared event broker, not round-robin listeners.

## Before production: exact regression checklist

1. `pnpm build` in both `server` and `client`; run `server/tests/unit/task-discussions.reactions.test.ts` and the previously delivered policy / attachment-deletion tests.
2. Two active Portal accounts on the same task: compose, reply, edit, delete, emoji, add/remove reaction, and verify instant SSE updates.
3. Fullscreen -> normal while typing, Esc close, mobile narrow layout, AR/EN language switch, theme switch. Attachment preview, download, author-only delete work in both views.
4. Search for an older message not in the initial 60, and for `%`, `_`, `[`, and `~` literal characters. Ensure other task/subtask messages never appear in results.
5. Creator, main-assignee, child-only assignee, inherited/custom collaborative teams, revoked assignee, read-only Task Sharing recipient and historical Meeting Action Item. Attempt direct URL/API reactions and search using unauthorized IDs.
6. Multiple users read a message and check the read counter. Check that opening a different tab or minimizing TaskHub does not falsely mark unseen messages read.
7. With stale SSE/disconnection, refresh and recover SQL history and reactions. Verify one-instance PM2 deployment and reverse-proxy SSE streaming.
8. Before applying migration 061, database backup; verify the table's composite PK, FK integrity, and that old messages remain unchanged after migration.

## Validation performed with the patch

Static TS/TSX parsing, changed import resolution, SQL migration structure, ZIP manifest and payload consistency, and focused pure helper checks. No real SQL Server instance, browser session, actual Portal JWT, email delivery or production PM2 runtime is accessible in this environment. The patch is **not** claimed production-validated until local build and functional tests have passed.

## Interaction corrections — October 25, 2026 (migration 062)

- Full-screen `TaskDiscussions` renders inside the **existing Task Details Radix DialogContent container**, not in `document.body` outside the Dialog's inert/focus boundary. It occupies the viewport but stays within the authorized task view. Esc and the collapse control restore normal size; selected discussion and unsent draft remain in React state.
- Composer emojis, mentions, per-message reactions and message actions now reuse the existing `components/ui/popover.tsx` Radix popover with collision handling, keyboard accessibility, outside-pointer dismissal, focus restoration, and `ui-popover-motion` opening/closing. Their layer is above the full-screen chat panel.
- Message deletion uses the same localized, destructive `ConfirmModal` component as discussion-file deletion. Browser `window.confirm` is not used.
- **One active reaction per user/message:** selecting a different emoji replaces the user's previous reaction, selecting the same active emoji removes it. The backend locks the message row and replaces the user's reaction transactionally. Migration 062 deduplicates only pre-existing multi-reaction records (retaining each user's most recently created reaction; emoji as deterministic tie-breaker) and adds `UX_TM_discussion_reactions_message_user` to enforce one reaction in SQL Server. Existing messages/files are not touched. This migration is required before deploying the updated service.
- The correction does **not** change discussion authorization, attachment permissions, SSE transport, message history, email policy or task completion rules.

### Focused post-deployment checks

1. Open Task Details → Discussions. Expand/collapse full screen repeatedly; verify the chat remains visible and interactive, selected scope/draft are preserved, Esc closes the full-screen view, and parent Task Details remains open.
2. In normal and full-screen mode, open the emoji picker, click outside, reopen, press Esc, type in its search, select emoji, and confirm the popup never clips at screen edges or flickers. Repeat with a message reaction picker and `@mention` picker.
3. On one message, choose 👍 then ❤️. The server and all connected users must show only ❤️ for that user. Choose ❤️ again; it must be removed. Repeat quickly and from two browser tabs to check concurrent updates.
4. Delete one's own message; verify the TaskHub confirmation dialog has Cancel/Delete and the browser native confirmation never appears. Cancel must preserve the message. Confirm soft-deletes it and retains the audit record.
5. Verify behavior on desktop/mobile and Arabic RTL/English LTR, with a second user; authorization and attachment preview/download must remain unchanged.
6. Run `pnpm build` in both `server` and `client`, and tests for discussion reactions and the discussion policy. Review/run SQL migration 062 manually on a backup before server deployment.

Source and migration have not been exercised in a live SQL Server/browser in this environment.
