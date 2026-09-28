# Meeting Reports — Phase 5: Automatic PDF email

## Scope

This phase connects the existing professional Meeting report and Phase 4 status panel to the existing TaskHub email worker. It does not add another worker, a second queue, a new Meeting lifecycle status, or permanent report-file storage. Attendance, action-item capabilities and manual export remain unchanged.

The automatic report becomes eligible **30 minutes after the current approved Meeting end**. The worker queues and processes it when it next runs; the due time is not an exact wall-clock delivery guarantee. Rendering time, worker load, downtime and retries can delay delivery.

## Rollout cutoff: no unexpected historical email flood

Migration `044_add_meeting_report_email.sql` records `activated_at_utc = SYSUTCDATETIME()` once in `TM_meeting_report_delivery_config`.

Only Meetings whose **approved end is on or after this cutoff** are eligible. A Meeting that already ended before activation is not automatically mailed, even if its 30-minute grace period has not expired. A future Meeting created before activation remains eligible. Manual PDF export is unchanged for old Meetings.

The cutoff survives process restarts and migration reruns. Restarting does not repeatedly move the window forward and lose work. Post-cutoff Meetings missed during downtime are caught up after the worker resumes. Before-activation Meetings display an explicit explanation in Meeting Details rather than waiting forever for a job which will not be created.

Do not backdate the cutoff or delete outbox rows to test the feature: that can enqueue historical mail or remove duplicate protection. Use a new short test Meeting which ends after activation, then wait through the normal 30-minute grace period.

## Recipients and authorization

The audience is the set union of the current Organizer and current attendee rows, deduplicated by user ID. Attendance status is not a recipient filter. A non-attending Organizer still belongs to the audience. Each Series occurrence is an independent Meeting/job set.

Actually sending requires all of the following at processing time:

- Scheduled Meeting with a valid current approved schedule, due time reached, and post-activation approved end.
- Recipient is still the Organizer or an invited attendee; being an unrelated Coordinator alone does not make someone an automatic email recipient.
- Active Portal identity and active TaskHub access.
- Normal Meeting content authorization.
- Enabled personal master email switch and enabled `MEETING_REPORT_AVAILABLE` preference.
- A currently valid destination resolved by existing Portal/verified-alternate email rules.

These checks run before rendering and again afterwards. A changed language/permission context causes a fresh deferred attempt rather than sending a stale privileged PDF. Related Meetings and related activity references are independently reauthorized before SMTP submission. Content permissions are never replaced with the Organizer's access.

Consequently PDFs are recipient-specific, even though all Meeting viewers can read every non-deleted Action Item. Related Meetings, access-filtered history, language and time preferences can still differ.

## Email preference

The new personal preference is:

```text
MEETING_REPORT_AVAILABLE
Meeting report after Meeting
Default: ON
```

It appears in the existing Meeting email group, in both languages. Migration 044 seeds missing records for existing TaskHub access users. Normal settings initialization adds it for future users. Existing explicit OFF choices, master switches, destinations and verification state are not overwritten. The schema enum, preference defaults, validation, client type and UI list all include the event.

This is an **email-only event**, not a new Notification Bell event. Disabling it does not disable manual PDF export or ordinary Meeting/Action Item emails.

## Queue and processing

```text
Existing email worker tick
    -> existing operational-email synchronization
    -> bounded automatic-report due scan
    -> ordinary email batch
    -> up to five report recipients, claimed one at a time
         -> validate payload identity and claim ownership
         -> current schedule, membership, access, settings and destination
         -> existing authorized PDF engine, recipient-specific
         -> recheck eligibility/context and related content
         -> save resolved envelope + generation metadata
         -> SMTP with in-memory PDF attachment
         -> record SENT, retry/FAILED, CANCELED or deferred state
```

The scan inserts at most 100 missing recipient intents per iteration. It serializes scan inserts with a transaction-scoped application lock, uses the existing unique dedupe key, and uses locked missing-key checks. The outbox remains the only work queue:

```text
template_key: MEETING_REPORT_AVAILABLE
dedupe_key:   MEETING_REPORT:<meetingId>:<recipientUserId>
```

The payload records only trusted Meeting/recipient/schedule identity before generation:

```json
{
  "meetingId": 127,
  "recipientUserId": 200,
  "revisionId": 12,
  "scheduledEndAtUtc": "2026-09-27T07:00:00.000Z"
}
```

### Why unresolved addresses are nullable

An intent is persisted **before** expensive rendering or recipient eligibility checks. This permits genuine CANCELED evidence for a disabled/missing destination and genuine retry/FAILED evidence for a PDF failure.

Migration 044 permits `recipient_email = NULL` only for report jobs in PENDING, PROCESSING, CANCELED or FAILED states. All other templates and every SENT row still require a nonempty address. A fabricated placeholder address is never stored or sent.

An invited Portal user without any TaskHub access row gets an unresolved intent with NULL owner and is then skipped; the payload retains the intended user identity. The aggregate status reader can match this record only through the exact report key/template and matching payload recipient. No private address, recipient-level reason or raw error is exposed by the status API.

### Reschedules and terminal states

- A proposed reschedule does not replace the approved schedule.
- If an unsent job's approved revision/end changes, update/defer the **same row and key** to the new due time. This deferral does not consume a failure attempt.
- Cancellation, rejected/unapproved state, removed membership, revoked access, disabled personal email or invalid destination produces CANCELED at the next processing check.
- SENT rows are never automatically regenerated merely because a schedule changes. Old-revision evidence remains REVIEW_REQUIRED, not success for the new revision.
- CANCELED and terminal FAILED jobs are not automatically revived when a setting changes. A new manual export remains available; manual resend/admin recovery is not part of this phase.
- Outbox recipient counts concern the current roster. Removed people are not included in current totals. This is not an immutable historical batch-membership record.

## Leases, retries and resources

Ordinary mail and report mail share the existing worker, but claim scopes keep report jobs out of the ordinary template-only send path. Reports are claimed individually, not as a large batch waiting behind earlier PDF work.

Every report claim gets a unique token and a 10-second ownership heartbeat. Ownership is asserted before generation and before SMTP. Lost or unknown ownership aborts PDF work and prevents a new send by that processor. Stale jobs use the existing outbox recovery and attempt-limit rules.

PDF/SMTP failures reuse the existing retry schedule: 60 seconds, 5 minutes, 30 minutes, then 2 hours as applicable, bounded by `EMAIL_MAX_ATTEMPTS`. Capacity exhaustion and approved-schedule/context changes are deferred without consuming the failure budget. Invalid identity/PDF payloads and oversized PDF attachments are terminal failures. Failure handling does not alter Meeting data.

Manual and automatic PDF generation share the existing per-process limiter (default two simultaneous exports, one per user), local sandboxed Chromium renderer, size/time limits, network isolation and text escaping. The default automatic-email PDF limit is 10 MiB; MIME/base64 overhead means the SMTP message is larger than the PDF, so set the limit below the mail server's total-message limit. Oversized reports fail explicitly rather than silently omitting sections or emailing without the PDF.

No database transaction is held while rendering or sending. No permanent PDF bytes or report HTML are stored. After generation, the outbox retains filename, generation timestamp, byte count and SHA-256 hash along with schedule identity; retries regenerate live data and can contain later changes. The email summary is built from the exact model used for its attached PDF.

### External-delivery guarantee boundary

The database dedupe key prevents repeated scheduler insertions and new jobs after success. The same outbox ID uses a stable SMTP Message-ID for traceability. These do **not** prove exactly-once inbox arrival: SMTP may accept a message before a connection/process/database failure prevents recording that success. A retry can then deliver a duplicate. Conversely, SENT means SMTP acceptance, not final inbox placement or reading.

Do not delete report outbox records during routine cleanup without a separately designed dedupe-retention mechanism. Deleting their keys can allow a later due scan to recreate jobs.

## Report and email presentation

Both Arabic and English emails use the existing branded email layout and include Meeting title/ID, start/end/room, attendance counts, Decision and Action Item counts, generation time, Meeting link and the PDF attachment. The existing inline logo is retained. PDF attachments are trusted in-memory Buffers, not paths or URLs from users or outbox content.

Automatic PDFs state that QNH TaskHub generated them automatically and identify whom they were prepared for. Manual PDFs retain their normal exporter attribution. Current-state disclaimers, empty sections, complete authorized Action Items and all existing report sections remain available.

## Status and operational controls

The Phase 4 panel now resolves effective availability from actual implemented code/configuration:

| Reason | Meaning |
|---|---|
| ENABLED | Required configuration enables this sender |
| MIGRATION_REQUIRED | Migration 044 configuration is not installed |
| EMAIL_DISABLED | System `EMAIL_ENABLED` is false |
| DISABLED | Report-only environment switch or persisted configuration is off |

`activatedAtUtc` and `lastAutomaticScanAtUtc` are shown. The latter records a completed scan, not worker health or successful delivery. The panel does not infer success from a clock. Pending, processing, retrying, partial, failed and skipped states still come from matching actual outbox evidence. A missing browser can produce failed/retrying jobs even when the sender is enabled; test the runtime browser before relying on delivery.

Report-specific environment settings:

```dotenv
# Defaults; .env is not overwritten by this patch.
MEETING_REPORT_EMAIL_ENABLED=true
MEETING_REPORT_EMAIL_MAX_PDF_BYTES=10485760
```

The existing `EMAIL_ENABLED`, SMTP, public TaskHub URL, worker interval/batch/attempt settings and PDF browser configuration continue to apply. The report flag alone cannot turn on a disabled system email engine. `NODE_ENV=test` does not start the background worker or auto-enqueue jobs.

For an administrator-approved pause without changing other email events, set the report-specific environment switch to false and restart all backend workers, or update the singleton `is_enabled` to 0 using your normal controlled DB process. Do not change `activated_at_utc`. A send already accepted by SMTP cannot be recalled. Paused pending jobs are retained and processed when resumed, subject to current eligibility.

## Deployment

1. Preview/apply the complete-file ZIP using the normal TaskHub patch tool. Review the manifest.
2. Build both projects and run the focused tests below. This patch does not add dependencies or change lockfiles; existing dependencies from earlier phases must be installed.
3. Back up QNHDB and use a controlled deployment window. Stop old backend worker instances before starting the Phase 5 build, rather than running old/new sender implementations simultaneously.
4. Run **only** `server/database/migrations/044_add_meeting_report_email.sql` manually against **QNHDB** after migrations through 043. The patch tool does not run SQL. Migration 044 prints its persistent activation cutoff. Do not rerun all earlier migrations.
5. Confirm the deployed backend account can render the Phase 3 PDF and access the existing logo, and that existing system SMTP/destination configuration is valid.
6. Deploy updated server and client builds; restart all deployed backend processes. Report sending is enabled by default when the existing email system is enabled and migration configuration is enabled.
7. Verify the new preference, status panel, one new post-cutoff Meeting, actual per-recipient inbox/PDF, and outbox evidence. No such live send is performed by the patch or the development smoke tests.

Commands from the project root:

```powershell
pnpm --dir server build
pnpm --dir client build
pnpm --dir server run email:report-smoke
pnpm --dir server exec vitest run tests/unit/meeting-report-email.test.ts tests/unit/meeting-report-email.adapters.test.ts tests/unit/email-worker.meeting-reports.test.ts tests/unit/meeting-report-schedule.test.ts tests/unit/meeting-report-schedule.repository.test.ts tests/unit/meeting-report-schedule.http.test.ts tests/unit/meeting-report.test.ts tests/unit/meeting-report.http.test.ts
pnpm --dir client exec vitest run src/features/meetings/reports/meeting-report-status.presentation.test.ts src/features/meetings/reports/MeetingReportStatusPanel.test.tsx
pnpm --dir server run pdf:smoke --render
```

`email:report-smoke` uses deterministic fictional data and mocked processor dependencies. It does not connect to SQL Server, SMTP, Portal, or Chromium. The adapter tests use mocked SQL/Nodemailer and check query contracts, not SQL execution. The PDF smoke uses the installed browser; browser overrides for that standalone script must be set in the shell as described in the manual-PDF documentation.

`server/database/setup/verify_meeting_report_email.sql` is an optional read-only diagnostic for configuration, preference counts and report outbox states. It does not queue mail, change settings or expose recipient addresses. Set its optional Meeting ID for a focused check.

## Acceptance checks before production sign-off

- Missing preference defaults ON for old/new users; explicit OFF survives settings saves and migration rerun. Master switch OFF and invalid destination result in SKIPPED, not a send.
- Organizer appears only once even when attending. Absent/not-marked attendees and non-attending Organizer receive mail when otherwise eligible. Unrelated Coordinators do not receive automatic mail simply because they can view a Meeting.
- A pre-activation ended Meeting is excluded. A post-activation Meeting is eligible at approved end + 30 minutes, not before. A worker restart retains the cutoff and catches missed post-cutoff work.
- Repeated scans/multiple workers do not create duplicate rows. A slow render keeps its lease. Lease loss prevents new SMTP submission by the old claim.
- Proposed reschedule does not alter due time; approved unsent reschedule reuses/defer-updates the same key. Cancellation, membership removal, revoked access and preference changes during render prevent delivery.
- Real PDF attached, Arabic/English correct, blank sections allowed, all Meeting tasks included. Restricted related content is absent. Summary and PDF totals match.
- SMTP/render failure is recorded/retried; eventual terminal failure is visible. Too-large PDF does not result in a report-less success email. Other Meeting/action/task emails still work.
- SENT is shown only from valid SMTP-acceptance evidence. Partial/skipped recipients never become “sent to everyone.” UI does not reveal private addresses or skip reasons.
- All Series occurrences are independent; manual export is always governed by normal Meeting access, regardless of automation flags/preferences.

## Validation performed for this delivery

- 52 deterministic policy/processor/lease/report-metadata checks passed using the new shipped standalone Node smoke test with mocked dependencies.
- 15 additional local adapter/worker assertions passed against transpiled implementation modules using mocked SQL/Nodemailer/worker services. These validate real method wiring and query contracts, not database or SMTP execution; this harness is not the Vitest runner.
- Strict TypeScript semantic checking of the standalone core (including pure policy, processor, lease, report builder/template and smoke dependencies) passed with locally available TypeScript 5.8.3 and Node types.
- All new/modified TypeScript/TSX files passed syntax parsing; final file counts are in the patch README.
- Real local Chromium rendered fictional automatically attributed English and Arabic PDFs, four pages each. All rendered page images were inspected; no obvious clipping/broken layout was seen. This checks the real report template/renderer, not real SMTP delivery.
- Local PDF rendering used the available Playwright 1.57 beta driver and `/usr/bin/chromium` with a test-only isolated-root sandbox override. Production code retains its sandbox defaults; the project's pinned Playwright 1.62.1/Windows combination was not available here.
- A full server compiler run was attempted but could not complete because the sandbox does not contain the project's installed runtime/development dependencies. No dependency installation or lockfile upgrade was performed.

Not completed here: full backend/frontend builds under the pinned dependencies, the actual Vitest runner, React interaction tests, migration/live SQL execution, SMTP/inbox delivery, production Portal/access flows, actual logo binary, Windows fonts/browser and PM2 deployment. No production data was read/changed and no real email was queued or sent. The ZIP/manifest and complete-file delta are checked separately when packaged.

## Rollback and retained data

Pause automatic reports and stop updated workers before rolling source back through the backup made by the patch tool. Do not leave old workers consuming new report jobs: they do not implement this template/nullable unresolved destination. Retain migration 044's preference/config/outbox data and stable dedupe evidence; do not drop the config table or delete recipient intents as a casual rollback. Rebuild/deploy the restored source and resume ordinary email only after verifying that report jobs cannot be claimed by the older worker. A complete database rollback needs a separate reviewed plan because reports may already have been accepted by SMTP.
