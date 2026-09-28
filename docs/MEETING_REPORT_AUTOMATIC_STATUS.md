# Meeting Reports — Timing and delivery status (Phases 4 and 5)

## What this release does

Every authorized Meeting viewer sees a compact **Meeting report** row integrated into the Meeting header, above the tabs. It shows the actual status and the relevant due/send/retry time. **View details** opens a centered delivery dialog; the single **Export PDF** button is grouped with the row and remains independent of status loading, automatic email settings, and Meeting lifecycle.

The backend computes the report due time as **the current approved Meeting end + 30 minutes**. It does not use a proposed reschedule, the browser clock, attendance completeness, or an invented COMPLETED Meeting status. Approving a reschedule recalculates the time. Pending approval, rejected, cancelled, or invalid/unapproved schedules are not eligible for post-Meeting automatic reports.

Phase 4 originally supplied the read-only status panel. Phase 5 now implements its sender in the existing email worker. Effective availability requires migration 044, its enabled activation record, `EMAIL_ENABLED=true`, and `MEETING_REPORT_EMAIL_ENABLED=true` (default). The status response explains missing migration, a paused report sender or disabled system email. It also exposes the persisted activation cutoff and last completed dispatch scan. Enabled means configured availability, not proof that the worker is healthy or any message was sent. See `MEETING_REPORT_AUTOMATIC_EMAIL.md` for the complete sender/deployment contract.

The status endpoint itself remains read-only and does not schedule jobs or render/send PDFs. Delivery evidence is still read from the existing outbox. Phase 5 adds one singleton activation configuration, not a second queue, status table or report-file store.

## Backend API

```http
GET /api/meetings/:meetingId/report-status
```

The route is in the existing authenticated Meetings router, uses the same Meeting visibility policy as Meeting Details and requires a positive safe-integer Meeting ID. The query is strict and empty: callers cannot supply actor IDs, delivery states, dates or enable flags.

The reader authorizes before reading any outbox or schedule information and again afterwards. If the Meeting changes while it is read, the request fails with `MEETING_REPORT_SCHEDULE_STALE` rather than returning a mismatched schedule. Database failures are not misrepresented as empty delivery history. Responses are `private, no-store`; no addresses, recipient identities, raw errors, or template payloads are exposed.

The response includes:

- Meeting status and approved revision/start/end.
- `reportDueAtUtc`, `graceMinutes`, `scheduleState`, and pending-reschedule indicator.
- `checkedAtUtc` from SQL Server and application time zone.
- Effective `automaticDeliveryEnabled` and `automaticDeliveryReason`.
- `activatedAtUtc` and `lastAutomaticScanAtUtc`, which never substitute for delivery evidence.
- Aggregate delivery evidence for the **current Organizer + attendee roster**, deduplicated by user ID.

### Schedule states

| State | Meaning |
|---|---|
| WAITING | Valid scheduled Meeting; approved end + 30 minutes has not arrived |
| DUE | That time has arrived; this does NOT imply queued, processing or sent |
| AWAITING_APPROVAL | No automatic report is scheduled for an unapproved Meeting |
| REJECTED | Rejected Meetings are not eligible |
| CANCELLED | Cancelled Meetings are not eligible |
| INVALID_SCHEDULE | No valid current approved revision/start/end is available |
| BEFORE_ACTIVATION | Approved Meeting end predates the persisted automatic-email activation cutoff |

Manual PDF export is not disabled by these states.

### Delivery states: actual evidence only

The repository reads existing `TM_email_outbox` records through its unique dedupe key. With no matching rows, status is `NOT_QUEUED`, even when the report time is in the past. No fake outbox entries or report events are inserted by the status endpoint.

| State | Evidence |
|---|---|
| NOT_QUEUED | No current matching recorded dispatch |
| QUEUED | PENDING outbox records without a previous attempt |
| PROCESSING | At least one matching PROCESSING record |
| RETRYING | PENDING records with a previous attempt |
| SENT | Every current expected recipient has a matching SENT record with a valid send timestamp |
| PARTIAL | Some messages were sent/skipped, but not all current recipients have a send record |
| FAILED | Terminal FAILED records, without a pending/processing attempt taking precedence |
| SKIPPED | All current expected recipients have CANCELED records |
| REVIEW_REQUIRED | Unknown, malformed or stale-schedule evidence; not counted as current success |

Counts include sent, queued, processing, retrying, failed, skipped, not queued and needs review. `lastSentAtUtc` is derived from recorded sends, not the due time. Sent timestamps before the due time, in the future, or missing are not accepted as current evidence. Zero recipients does not mean all sent.

A partial batch is never labelled sent to everybody. A previous approved revision's report is not presented as delivery for the new schedule. Existing skipped records do not reveal the person's private email preference or address. A recipient with no outbox row is **not queued**, not assumed skipped, failed, or delivered.

`SENT` reflects the existing worker recording mail-server acceptance. It cannot prove inbox arrival, opening or reading. Aggregate counts refer to the current roster, not an immutable historical recipient snapshot. If future requirements need exact historical batch membership, introduce a separately approved explicit dispatch batch record rather than inferring it from the current roster.

## Phase 5 outbox integration contract

Phase 5 implements this contract; the status endpoint continues to read it without writes.

```text
template_key = MEETING_REPORT_AVAILABLE
dedupe_key   = MEETING_REPORT:<meetingId>:<recipientUserId>
owner_user_id = <recipientUserId> when a TaskHub access row exists, otherwise NULL
```

The structured payload must identify the schedule used to generate the report:

```json
{
  "meetingId": 127,
  "recipientUserId": 200,
  "revisionId": 12,
  "scheduledEndAtUtc": "2026-09-27T07:00:00.000Z"
}
```

The sender adds only generation time, filename, byte count and SHA-256 metadata after rendering. PDF bytes, HTML, addresses and raw SMTP errors are never returned by the status API. A NULL-owner unresolved intent is matched only with the exact template/key and matching `recipientUserId` payload.

The lookup is by the exact meeting/recipient dedupe key and template, then checks the current approved revision and end time. It does not scan unrelated template payloads or treat lifecycle/invitation/Action Item emails as report delivery. Rows for people who are no longer in the roster do not appear in current counts.

The implemented dispatcher must continue to preserve these invariants:

1. Reuse this approved-end + 30-minute policy and stable dedupe helper; revalidate current Meeting state and recipient access immediately before generation/send.
2. Reuse the existing outbox/worker, not insert a second queue. Add the new event/preference/defaults and PDF-attachment support deliberately.
3. Resolve current destination, active account/access, master email switch and event preference. Include the non-attending Organizer and absent/not-marked invitees when eligible.
4. Preserve recipient-specific authorization for Related Meetings and activity. Broad Action Item visibility alone does not make every recipient's entire report identical.
5. Reconcile stale scheduled records explicitly; do not bypass the meeting/recipient dedupe key or resend automatically merely because the approved revision changes.
6. Define the activation cutoff/catch-up policy so rollout cannot unexpectedly email every historical Meeting. Define how skipped-before-queue recipients and PDF generation failures are persisted for status reporting.
7. Wire `automaticDeliveryEnabled` to the real dispatch feature's effective availability. A configured flag or elapsed time is not proof that a worker is processing.
8. Preserve outbox evidence/dedupe state for the required retention period. SMTP retries cannot promise exactly-once inbox delivery in every network failure scenario.

Phase 5 queues an unresolved intent before recipient/PDF processing. An actual ineligible attempt is recorded as CANCELED and a PDF failure uses the outbox retry/FAILED state. Unsent schedule changes defer/update the same row. A SENT row is not deleted or recreated after a reschedule; the previous revision remains REVIEW_REQUIRED rather than falsely showing new delivery. Terminal skipped/failed jobs are not automatically revived. Initial activation excludes Meetings whose approved end predates migration 044. These are real persisted attempts, not fabricated pre-queue facts.

## Frontend behavior

The report row uses the existing Badge, Button, Dialog, date/time helper and current-user/query conventions. It is integrated into the Meeting header, not a separate card or accordion. It is available above all Meeting Details tabs. Partial/failed/review results remain visible in the row; details such as audience, counters, timestamps, activation, sender availability and explanations are in the delivery dialog. One query result supplies both views, with no extra polling or email side effects on opening the dialog. It supports Arabic RTL, English, light/dark styling and the user's 12H/24H preference. See `MEETING_UI_REFINEMENTS.md` for the UI update and acceptance checks.

The status query is scoped by Meeting ID, authenticated user and Meeting row version. It refreshes on focus or manual refresh, polls every 60 seconds while visible, and uses a 10-second interval when real outbox records are queued/processing/retrying. Background polling is disabled. Authorization failures stop interval polling. Failed refreshes suppress stale success data instead of continuing to claim current delivery success.

The page does not run its own sending timer or infer SENT when the due time passes. The current UI explains the effective sender configuration and pre-activation schedule exclusions. If sending is enabled but no scan has completed, it explicitly says it is awaiting the first scan. No Send Now button or new editing permission is added.

## Meeting Activity correction included

The Phase 3 review found that Decisions/Notes were saved without corresponding Meeting activity, while Action Item events existed only in Task history. This patch records these future events in `TM_meeting_activity`:

- `DECISION_CREATED`, `DECISION_UPDATED`.
- `NOTES_UPDATED` for successful creation or update.
- `ACTION_ITEM_CREATED`, `ACTION_ITEM_REASSIGNED`.
- `ACTION_ITEM_STATUS_CHANGED`, including completion/reopen/cancellation when already permitted by the existing task rules.

Events use the actual actor and the same transaction as the successful business write. Denied operations, stale failures, unchanged task status and unchanged assignment do not generate fake success events. Private non-Meeting tasks do not generate Meeting activity. Decision/Notes text is not duplicated into the audit payload.

The existing Meeting timeline and the PDF's allowlisted human-readable activity labels now display these events. Relevant client mutations invalidate the Meeting Details query so the timeline refreshes. Organizer/assignee/Viewer permissions are unchanged.

**No historical events are invented or backfilled.** Previously missing Decision/Notes history cannot be reconstructed reliably from only the latest content. New events appear only for changes made after deploying this patch. Existing Task history is retained.

## Historical Phase 4 installation and rollback

Phase 4 itself required no new migration, dependency, browser installation or environment setting. **Installing the current Phase 5 sender additionally requires migration 044; follow `MEETING_REPORT_AUTOMATIC_EMAIL.md` before starting the updated backend.** Previously applied migrations through 043 and the Phase 3 PDF browser setup remain prerequisites. Deploy both updated server and client builds. Do not rerun migration 043 solely for this patch.

Use the normal TaskHub patch preview/apply flow and the backup directory printed by the apply script for rollback. Source rollback does not erase newly recorded activity, and no schema rollback is needed.

## Verification

From the project root:

```powershell
pnpm --dir server build
pnpm --dir client build
pnpm --dir server exec vitest run tests/unit/meeting-report-schedule.test.ts tests/unit/meeting-report-schedule.repository.test.ts tests/unit/meeting-report-schedule.http.test.ts tests/unit/meeting-followup-activity.test.ts tests/unit/meeting-action-items.readonly.test.ts tests/unit/meeting-action-items.collections.test.ts
pnpm --dir client exec vitest run src/features/meetings/reports/meeting-report-status.presentation.test.ts src/features/meetings/reports/MeetingReportStatusPanel.test.tsx
pnpm --dir server run pdf:smoke --render
```

The panel test explicitly selects jsdom and imports the existing setup, so it does not depend on an implicit global DOM test environment. The HTTP test mocks the service/authentication context; it does not validate the production Portal authentication chain. Repository tests capture query contracts and mappings, not SQL Server execution.

Manual acceptance:

- Open a scheduled Meeting as Organizer, attendee and authorized Coordinator. Confirm the same approved end + 30-minute calculation and correct effective sender availability.
- With report sending paused, let the calculated time pass: it must not become Sent/Processing or queue/send mail. With Phase 5 enabled, verify the real worker/outbox progression instead of a clock-derived success state.
- Submit a reschedule proposal: the time remains based on the current approved schedule. Approve it: the time updates. Reject/cancel a proposal: it continues to use the unchanged approved schedule.
- Pending/rejected/cancelled Meetings show an eligibility explanation. Manual export still follows ordinary Meeting visibility.
- Deny/revoke Meeting access and call the status endpoint directly. No schedule or delivery data should be returned. Simulate a failed refresh and confirm old success is not shown.
- Make new Decision, Notes, Action Item, assignment and task-status changes. Confirm Meeting activity and the manually exported PDF show the new events with correct actor/time. Confirm forbidden/no-op mutations do not add events.
- Verify English/Arabic, a narrow screen, and 12H/24H formatting. An unavailable status endpoint must not disable manual Export PDF.

## Historical validation performed for Phase 4

For current Phase 5 validation and remaining deployment tests, see `MEETING_REPORT_AUTOMATIC_EMAIL.md`.

- 100 focused cases passed through a local Node assertion harness executing the supplied TypeScript test bodies with mocked repository/storage dependencies: 36 timing/authorization cases, 2 repository query-contract cases, 10 activity-write cases, 36 existing read-only/owner/assignee cases, 12 existing collection/scope cases and 4 presentation cases.
- Strict TypeScript semantic compilation passed for the pure schedule reader/policy/types, the modified report template/labels and their actual local type dependencies using TypeScript 5.8.3.
- All 33 added/changed TS/TSX files passed TypeScript syntax parsing.
- Real local Chromium generated English and Arabic regression PDFs with the new activity events (5 pages each for those fictional fixtures); rendered pages were visually inspected. Local rendering used the available Playwright 1.57 beta driver, not the project's pinned 1.62.1 driver, with an isolated-root test-only sandbox override. Production sandbox behavior was not modified.
- ZIP payload/manifest equality and complete-file paths were verified during packaging.

Not executed: full server/client builds under the project's pinned dependencies, the actual Vitest runtime, live SQL Server queries/migrations, production Portal/permission flows, Windows/PM2, React interaction/browser tests and SMTP. No production data was accessed or changed, and no email was queued/sent in this implementation session.


