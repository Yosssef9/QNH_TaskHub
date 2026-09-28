# Meeting Details — Participants, attendance controls and report row

## Scope

This is a frontend presentation update on top of Meeting Report Phase 5. It does not change the database, backend, email worker, API contracts, attendance permissions, report timing, email recipients, retries, preferences, or PDF contents.

## Participants

`MeetingParticipantsPanel` presents the same Organizer + attendees and the same authoritative attendance records previously displayed by Meeting Details. It does not infer attendance from the Organizer's planned participation flag or add/remove participants.

Only the participant rows scroll. The heading, totals, before-start explanation and bulk attendance buttons remain outside that region. The list has a maximum height of `min(24rem, 50dvh)` with a `vh` fallback, but no fixed or minimum height. A short list uses its content height. On a very short screen, even a few tall rows may legitimately exceed the viewport-based cap.

Rows respond to the card's actual width using a component-scoped CSS container query. At less than 26rem of card content width the attendance control moves below the name/badges; otherwise it sits beside the participant information. Long names wrap rather than forcing horizontal overflow. The list can receive keyboard focus for scrolling, and individual controls keep their usual keyboard navigation.

The parent page still owns the unchanged attendance mutation functions, toasts and existing `canManageAttendance && meetingHasStarted` condition. Pending single/bulk updates disable the same controls as before. Authorized read-only viewers do not receive dropdowns or bulk buttons.

## Attendance indicators

`MeetingAttendanceIndicator` centralizes icon, text and theme-aware color presentation:

- `ATTENDED`: green check-circle.
- `ABSENT`: red X-circle.
- `NOT_MARKED`: neutral question-circle.

The indicator is reused in menu options, the explicitly controlled selected value, and read-only pills. Existing Select primitives retain their focus/typeahead/selection behavior. `SelectContent` already portals to the document body, so adding overflow to the roster does not clip its popup. No global dropdown primitive or stylesheet was changed.

## Report row and dialog

`MeetingReportStatusPanel` now renders a compact row inside the Meeting header, above the tabs. The former standalone card is removed. The one existing Export PDF component is now grouped with View details; there is no duplicate export action in the old header location.

The row shows a short status label, an appropriate server-provided time, and nonzero delivery counts when recorded evidence exists. Partial, failed and review states remain visible without opening the dialog. Icons supplement text; semantic theme colors distinguish scheduled/queued/processing, success, warning, failure and inactive states.

`MeetingReportDeliveryDialog` uses the existing centered modal primitive. It displays the current authorized summary: timing, eligibility/availability, audience, counters, actual send/attempt timestamps, activation/scan/check timestamps and contextual explanations. Zero-value status tiles are omitted rather than presenting eight empty counters. An unqueued report has an explicit message. The dialog is viewport-bounded and scrollable, with a sticky title/footer and a close action; the existing modal primitive supplies focus trapping, Escape and trigger-focus restoration.

Opening the dialog does not start another query, trigger mail or generate a PDF. Both views use the same existing query result and polling cadence. Query errors suppress cached success/timing in both views and provide refresh. Manual Export PDF stays mounted and usable independently of loading, disabled automatic sending, or failed status retrieval.

The pure presentation helpers never use the browser clock to infer sending. `BEFORE_ACTIVATION`, pending/rejected/cancelled/invalid schedules do not promise an active report time. Recorded SENT/PARTIAL uses actual last-send time; enabled RETRYING uses the recorded next attempt; a terminal failure's due time is labelled original. Previously sent records can remain visible while future automatic sending is paused. All counts remain current-roster evidence, not inbox/read confirmation.

## Explicitly excluded

No participant search, sidebar/navigation redesign, extra editing permission, new Send Now action, PDF template change, backend/schema change, duplicate status polling or second export button is part of this update.

## Focused test commands

From the project root:

```powershell
pnpm --dir client exec vitest run src/features/meetings/reports/ src/features/meetings/components/MeetingAttendanceSelect.test.tsx src/features/meetings/components/MeetingParticipantsPanel.test.tsx
pnpm --dir client build
```

The UI tests select jsdom explicitly and import the existing test setup. They cover selected icons and labels, option portalling, disabled controls, read-only users, small/large rosters, unchanged bulk values, non-attending Organizers, report states and counts, dialog open/refresh/Escape/RTL, and PDF export independent of status failure.

## Manual acceptance

1. Open Meetings with 2 and 30+ participants. Verify only the rows scroll after the cap is reached, while the heading/totals/bulk buttons stay visible. Confirm there are no placeholder rows or fixed-height gaps for short lists.
2. At desktop, narrow card, phone and browser-zoom widths, verify long English/Arabic names, badges and dropdowns do not overlap or create horizontal overflow. Open a dropdown on a row near the bottom of the list; its full options must remain usable outside the scrollport.
3. As an Organizer after start, choose each status and verify its saved value, icon and totals after refresh. Test both bulk actions. As a viewer or before start, verify that editing remains unavailable. A non-attending Organizer is still shown as Organizer without invented actual attendance.
4. Verify there is exactly one Export PDF button and a compact report row above every Meeting tab. Compare scheduled, queued, processing, retrying, sent, partial, failed, skipped, disabled, before-activation and unavailable states against the real backend response.
5. Open View details with mouse and keyboard. Verify title/description, focus containment, Close/Escape and return focus to the trigger. At a short viewport, scroll the modal body to the notices and timestamps. Refresh must update the existing query, not send mail.
6. Cause a status-read failure in a test environment. No cached success should remain; Export PDF must remain available. Restore status and refresh.
7. Check Arabic/English, light/dark and 12H/24H preferences. Confirm the unchanged backend PDF/email and attendance permissions still apply.

## Validation limits

This update was checked locally with TypeScript 5.8.3 (syntax/import checks), a Node assertion script for the real pure view/presentation modules and translation keys, and static browser-layout fixtures at four viewport sizes. Those fixtures used the actual new JSX with lightweight UI/hook stubs, local Tailwind 4.1.10 and Chromium, NOT a running React/Radix application.

The full client compiler was attempted but stopped on unavailable installed type packages (`vite/client`, `@testing-library/jest-dom`, `node`). No dependency installation or package upgrades were made. The included Vitest interaction tests, production build, live authenticated app, actual Radix interactions, live attendance persistence and Windows/browser compatibility still need execution in the project's normal environment. No database command or real email send was performed.
