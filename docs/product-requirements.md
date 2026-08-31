# QNH TaskHub — Current Product Requirements

> Status: planning baseline. Last aligned: 2026-08-25.

## Product summary

QNH TaskHub is an Arabic-first private productivity application authenticated through QNH Portal. Each user manages normal to-do lists and a separate set of personal KPIs. Users cannot see or manage one another's work.

This private personal-productivity model is the only active product direction. Superseded planning material must not be used to introduce multi-user or organizational workflows.

The product should feel simple enough to use without documentation. The Arabic dashboard image supplied during planning is a style reference only.

## Users, authentication, and administration

- Authentication uses the existing QNH Portal JWT.
- The token's `USER_CODE` is resolved server-side to the authoritative Portal `USER_ID`.
- TaskHub stores no Portal password or password hash.
- A user requires active TaskHub access.
- TaskHub roles are `USER` and `ADMIN`.
- Administrators manage application access and the official-holiday calendar.
- Administrators do not automatically see users' private lists, tasks, attachments, KPIs, or results.

## Normal task lists

- Every user has one permanent default list named **My Tasks**.
- My Tasks is a real default list, not an aggregate of KPI work.
- Users can add custom private lists with a name, icon, color, and display order.
- A normal task belongs to exactly one normal list.
- Normal lists and their tasks contain no KPI scoring or target fields.
- Normal tasks cannot be moved into a KPI in the current scope.

## KPIs

- KPIs are private, user-created reusable templates held in the KPI Library.
A KPI is a reusable private template. Operational KPI tasks and results belong to one KPI instance inside one Work Cycle.

- KPI work is displayed separately from normal lists.
- Users create private Work Cycles and select existing KPI templates into each Cycle.
- Selecting a template creates a KPI instance with a configuration snapshot. The same template may be reused across unlimited Cycles but only once in one Cycle.
- A KPI task belongs directly to exactly one KPI instance and to no normal list. Tasks, subtasks, measurements, and results never mix between instances.
- KPI tasks cannot be moved into a normal list in the current scope.
- KPI tasks reuse appropriate task, subtask, priority, date, status, and attachment behavior.

### KPI basics

Each KPI can define:

- Name and optional description
- Icon and color
- Calculation method
- Reporting frequency: monthly, quarterly, or yearly
- Optional target
- Higher-is-better or lower-is-better direction where applicable
- Active/inactive state

The setup experience shows a localized sentence explaining the selected formula and a small numeric example before save.

### KPI task availability and global KPI Tasks workspace

Task support is determined by the calculation method and is not an optional per-KPI setting:

- `ON_TIME_RATE` uses KPI tasks. The KPI chooses one deadline source: either a required user-entered task due date, or an automatically calculated deadline from a required reference date. Automatically calculated deadlines are stored as task deadline snapshots.
- `TASK_COMPLETION_RATE` uses KPI tasks. The due date is optional and user-entered.
- `SUBTASK_COMPLETION_RATE` uses KPI tasks and subtasks. The parent-task due date and subtask due dates are optional.
- `SUBTASK_ON_TIME_RATE` uses KPI tasks and subtasks. Every scored subtask requires a user-entered due date; the parent-task due date remains optional.
- `MANUAL_RATIO` may use supporting KPI tasks for organization, but those tasks do not affect the result. The user enters the period achieved and total values directly.
- `MANUAL_NUMBER` may use supporting KPI tasks for organization, but those tasks do not affect the result. The user enters the period value directly.

The **KPI Tasks** workspace aggregates tasks from all of the current user's Work Cycles while keeping them separate from normal lists. It reuses the normal task search, status, priority, due-date, sorting, pagination, details, status actions, subtasks, and attachments, and adds cascading Work Cycle and KPI-template filters.

When a user creates a task from the global KPI Tasks workspace, no context is preselected. The user selects an open Work Cycle and then one KPI instance inside it. The form applies the instance snapshot's date policy. A task's instance association is fixed after creation; editing cannot move it to another instance or normal list.

### Work Cycles and KPI instances

- User-facing names are **Work Cycles** and **دورات العمل**. KPI definitions are shown as **KPI Library** and **مكتبة المؤشرات**.
- Cycle metadata includes title, optional description, optional start/end dates, icon, color, and display order.
- Creating a Cycle and its initial KPI instances is one database transaction.
- Instance snapshots preserve the KPI name, presentation, formula, period, target, deadline configuration, and manual labels as they existed when selected.
- Template edits affect future instances only. Archived templates cannot be selected for new instances but existing instances continue working.
- An empty instance may be removed. An instance containing tasks or results is preserved.
- Closing a Cycle makes all contained work read-only. Reopening requires an explicit owner action. Archiving hides the Cycle without deleting history.
- The Cycle page combines a compact overview with all KPI tasks in that Cycle. A specific instance page shows its own performance and tasks.
- The sidebar nests an explicit **All KPI Tasks** item and the selected KPI instances beneath each Cycle; only one Cycle expands at a time and the active Cycle expands automatically.
- A user may have many open Work Cycles but at most one **Current Work Cycle**. The current Cycle is explicitly selectable from the Work Cycles page and is persisted per user.
- When exactly one open Work Cycle exists, it becomes Current automatically. Creating another open Cycle does not replace an existing Current selection.
- Closing or archiving the Current Cycle removes that selection; if exactly one other open Cycle remains, it becomes Current automatically. If several remain, the dashboard asks the user to choose.
- The Home dashboard is a Current Work Cycle command center: the Current Cycle is the dominant card and drives its progress counts, attention tasks, and KPI-performance section. Personal My Tasks remain visible as a smaller secondary summary and never mix ownership with KPI work.

### Supported calculation methods

#### On-time completion rate

Measures whether KPI tasks are completed by their configured deadline.

The KPI chooses one deadline source:

- **Task due date**: every KPI task requires a user-entered due date.
- **Reference date**: the user enters a reference date on each KPI task and the system calculates the due date from the configured business-day offset and `BEFORE` / `AFTER` direction. The localized reference-date label is configured on the KPI.

Formula:

`tasks completed on or before deadline / eligible tasks × 100`

Reference-date deadlines use Sunday–Thursday workdays and exclude administrator-managed holidays. Future unfinished deadlines are not failures.

Examples: materials sent five business days before a board meeting, or requests closed by their individually assigned due dates.

#### Task completion rate

Formula:

`completed tasks / non-cancelled eligible tasks × 100`

Example: fulfilled board-member requests divided by all valid requests.

#### Subtask completion rate

Formula:

`completed subtasks / eligible subtasks × 100`

Example: implemented decisions represented as completed subtasks divided by all decisions.

#### Subtask on-time rate

Formula:

`subtasks completed on or before due date / eligible subtasks × 100`

Every subtask for this KPI method requires a due date. Future unfinished subtasks are not failures until their due date arrives. Cancelled parent tasks and deleted subtasks are excluded. Reporting-period membership is based on the subtask due date.

Example: board decisions implemented by their assigned deadline divided by all eligible decisions due in the reporting period.

#### Manual ratio

The user enters an achieved value and total value for each reporting period.

Formula:

`achieved / total × 100`

Example: complete subjects delivered divided by all required subjects.

#### Manual number

The user enters one number for each reporting period and the system evaluates it against an optional higher-is-better or lower-is-better target.

Example: number of decisions that required rewriting, where lower is better.

### Actual result and target achievement

The actual result is the outcome produced by the selected KPI method. Target achievement is a separate comparison.

For a higher-is-better percentage KPI:

`target achievement = actual result / target × 100`

Example: actual 95% and target 90% produces 105.6% target achievement.

The numeric value may exceed 100%, while a visual progress fill may stop at 100%. When division is undefined, especially around zero-valued lower-is-better targets, show met/not met instead of a misleading percentage.


## Contracts

Contracts are an optional private domain. An administrator can enable or disable the Contracts module independently of the existing `USER` / `ADMIN` role. Removing module access preserves the user's Contract data. `ADMIN` does not grant cross-user Contract visibility.

Phase 1A includes:

- expandable Contracts navigation with **My Contracts** and **Suppliers**;
- private owner-scoped Suppliers with required Name and optional commercial registration, tax/VAT, primary contact, address, and notes;
- Supplier list/detail/create/edit/archive/restore plus contextual quick-create from Contract editing;
- private owner-scoped Contracts with optional text Contract Number, required Title/Start Date/Supplier, optional End Date for open-ended agreements, and archive/restore;
- automatic-renewal tracking with required End Date, Renewal Term, and Notice Period when enabled;
- derived Notice Deadline (`End Date - Notice Period`), Duration, Days Remaining, and date-tracking state;
- `FIXED` versus `VARIABLE` Contract value semantics;
- separate payment frequency (`ONE_TIME`, `MONTHLY`, `QUARTERLY`, `SEMI_ANNUAL`, `ANNUAL`) and payment timing (`IN_ADVANCE`, `IN_ARREARS`);
- a per-user Expiring Soon threshold, default 90 days;
- server-side search/filter/sort/pagination;
- explicit edit mode with manual Save, review-confirmation diff, unsaved-change protection, and SQL Server `ROWVERSION` stale-edit protection;
- immutable Contract history for create/update/archive/restore, committed atomically with Contract changes.

Phase 1B adds Contract Files:
- protected owner-scoped PDF/JPG/JPEG/PNG uploads, up to 10 active files per Contract and 10 MB per file;
- server-generated storage keys under protected Contract attachment storage, with extension and file-signature validation;
- Files tab with upload, drag/drop, preview, download, and remove actions;
- optional primary Contract file selection during Contract creation, uploaded only after the Contract record is created;
- compact file-count hints in My Contracts that deep-link to the Contract Files tab;
- immutable `ATTACHMENT_ADDED` and `ATTACHMENT_REMOVED` Contract-history events;
- archived Contracts remain readable/downloadable but cannot add or remove files until restored.

Phase 1C adds Contract reminders:
- two private date-driven events: Contract End Date and automatic-renewal Notice Deadline;
- independent personal lead days (default 30 days before End Date and 14 days before Notice Deadline) plus optional email-copy toggles;
- in-app notifications remain independent from email delivery and deep-link directly to the private Contract;
- if the preferred reminder date already passed but the real End Date/Notice Deadline is still future, create the reminder once on the next synchronization;
- dedupe by Contract plus the actual event date so changing lead days does not create duplicate reminders, while a genuinely changed End Date/Notice Deadline creates a new event cycle;
- archived Contracts and users without active Contracts access do not produce new Contract reminders;
- email copies reuse the existing TaskHub email master switch, active verified destination, branded bilingual templates, outbox/worker, retries, and send-time revalidation; stale queued messages are canceled when the Contract date/state/access or email permission no longer matches;
- Settings uses one sticky Email/Contracts navigation surface; Contract reminder settings live with Contract tracking rather than duplicating them in the generic email event list.

Contracts never create fake Tasks/KPIs and are not included in global search.

## Calendar

- TaskHub includes a top-level **Calendar / التقويم** view for the authenticated user's existing work. The Calendar is a projection of tasks, not a separate event or scheduling domain.
- The Calendar provides **Month** and **Agenda** views with Today/previous/next navigation, Personal vs KPI scope, and the existing status/priority/list/Work Cycle/KPI filters needed to narrow the visible work.
- Calendar search is a dedicated owner-scoped finder across **all dated Calendar tasks**, not only the visible month. It searches task title/description plus the relevant List, KPI, and Work Cycle names, respects the active Personal/KPI scope and filters, waits for at least two characters with a short debounce, and returns a bounded set of upcoming-first then recent-past results. Clicking a result navigates the existing Calendar to that date, temporarily highlights the destination day/task, and opens the existing Task Details workspace; normal Calendar rendering remains range-bounded.
- A task appears once on its due date when one exists; otherwise it appears on its start date. Tasks with neither date do not appear on the Calendar.
- Personal calendar results include only normal-list tasks. KPI calendar results include only KPI-instance tasks. These domains remain separate and all queries are owner-scoped from the authenticated Portal user.
- Calendar task rendering reuses the existing TaskHub status, priority, overdue, light/dark, and RTL/LTR visual system. Clicking a calendar task opens the existing Task Details workspace.
- Clicking a date, or a Month-view `+N more` link, opens a localized day panel using the already-loaded visible-range data. The panel shows that day's tasks and can launch the existing Task Editor without adding a calendar-specific mutation API.
- The Month view is responsive rather than horizontally scrolling on phones: desktop/tablet cells show compact TaskHub task chips, while narrow phone cells collapse task content to semantic status/priority indicators plus a compact `+N` overflow count. On phones the selected day's task list renders inline below the calendar; on larger screens it continues to use the existing drawer treatment.
- Month display defaults to **Include adjacent month dates** so complete week rows remain visible across month boundaries. Users may switch to **Current month only**, where adjacent-month cells preserve weekday alignment but do not show dates or accept date clicks. The choice is stored as a private user preference, and month height uses the natural number of week rows instead of always forcing six.
- Friday and Saturday are visually distinguished with the existing muted TaskHub treatment because they are QNH non-working days. Weekend cells remain fully interactive for normal task viewing and creation; weekend styling never disables a date or overrides task status/priority semantics.
- Calendar interactions remain keyboard- and screen-reader-usable: visible day numbers are explicit focusable controls with localized date/task-count labels, rendered events are interactive/focusable, loading state is announced, and the selected day is exposed without relying on color alone.
- Calendar quick-create preselects the clicked date according to the existing task/KPI date policy: normal tasks and KPI tasks with editable due dates receive the clicked date as the initial due date; KPI tasks whose policy has no due date use it as the initial start date; reference-date KPIs keep their automatic deadline policy and do not receive a forged direct due date.
- Personal quick-create may preselect the active list filter, while KPI quick-create may preselect the active open Work Cycle/KPI filter. The existing editor remains authoritative and users can change permitted context before save.
- Normal Calendar rendering fetches only the visible date range through a dedicated read endpoint; the separate Calendar-wide search endpoint is bounded by its result limit rather than by the visible month. Calendar does not add a separate task CRUD API or calendar-event database table. Existing task creation/update/detail APIs remain authoritative.
- Drag-to-reschedule, recurring events, hourly scheduling, resource calendars, and external calendar synchronization remain outside the approved Calendar scope.

## Tasks and subtasks

Current shared task concepts:

- Required title
- Optional description
- Priority: low, medium, or high
- Status: to do, in progress, done, or cancelled
- Optional dates where the selected KPI method does not require them
- Completion timestamp
- One lightweight level of subtasks: title, completion state, optional due date, and display order
- Attachments on tasks and subtasks

`OVERDUE` is derived rather than stored.

Priority and full workflow status remain on the parent task. Subtasks cannot contain nested subtasks.

## Attachments

- Store metadata in SQL Server.
- Store files in protected server-managed storage.
- Validate type and size and generate opaque storage names.
- Check ownership for upload, download, and deletion.
- Do not expose physical storage paths.
- Allow no more than 10 attachments per task or subtask.
- Limit each file to 10 MB.
- Allow PDF, Office documents, common images, and plain text; reject executables and scripts through a backend-controlled allowlist.

## History, deletion, and finalized results

- Keep lightweight activity history for important task changes.
- Soft-delete tasks, subtasks, and attachments.
- Archive custom lists and KPIs.
- Never archive or delete the permanent My Tasks list.
- Preserve finalized KPI results and target snapshots so later KPI configuration changes do not rewrite history.

## Localization and visual experience

- Arabic is the preferred/default language with RTL layout.
- English uses LTR layout.
- Light and dark modes are supported.
- Desktop sidebar expands to icons plus labels and collapses to icons with tooltips.
- Custom lists, KPI cards, and subtasks are reordered with dedicated drag handles using dnd kit. Reordering is optimistic in the client, persists once on drop, rolls back on persistence failure, remains keyboard accessible, and must not make the permanent My Tasks list draggable.
- The drag-and-drop library owns active drag transforms and drop feedback; Motion must not compete for transform/layout control while an item is actively being dragged.
- Framer Motion is the standard for UI transitions and animations. New component enter/exit, layout, and expand/collapse motion must not be implemented with handwritten CSS keyframes or Tailwind animation/transition utilities. Motion must remain subtle, consistent, and reduced-motion accessible.
- Mobile navigation uses a drawer.
- Interfaces should be calm, readable, responsive, and free of unnecessary visual complexity.
- KPI configuration uses progressive disclosure.
- Temporary success and error messages use React Hot Toast when implemented.

## In-app notifications

TaskHub includes private in-app notifications in the global header. Notifications are owner-scoped and never expose another user's work.

- The notification bell shows the unread count and a compact recent-notifications popover.
- The client refreshes notifications periodically and when the window becomes active; WebSockets are not required for the MVP.
- Initial notification triggers are overdue tasks, tasks due today, high-priority tasks due tomorrow, the current Work Cycle approaching or passing its end date, current-Cycle KPIs below target, and missing manual KPI measurements near the end of the active period.
- Task, Work Cycle, and KPI notifications navigate directly to the related private object.
- Users can mark one notification or all notifications as read.
- A stable per-owner deduplication key prevents repeated copies of the same event.
- Notifications are not created for ordinary actions the user just performed, such as editing or completing their own task. Immediate action feedback continues to use toast messages.

## Email delivery

Email delivery is implemented in controlled phases so provider failures never block normal TaskHub work. Phase 1 supplies the delivery foundation, Phase 2 adds private user-controlled destinations and preferences, and Phase 3 connects operational events to preference-aware asynchronous email delivery.

### Phase 1 foundation

- Nodemailer SMTP transport behind a provider abstraction.
- Persistent `TM_email_outbox` with stable deduplication keys, delivery status/history, retry count, lock recovery, and bounded retries.
- A small background worker inside the modular monolith; no Redis, queue service, or separate email microservice.
- One shared QNH TaskHub branded email design system using the QNH logo and system colors.
- Responsive system-controlled Arabic RTL and English LTR HTML with plain-text fallbacks.
- Technical test-email and alternate-email verification-code templates. Verification codes are not allowed to be persisted in plaintext in the outbox.
- Absolute links and logo URLs are generated from server configuration such as `TASKHUB_PUBLIC_URL`.
- Email is disabled by default until the database migration and server SMTP configuration are deliberately applied.

### Phase 2 user email settings

- Each user has an email master switch that controls email delivery only; in-app bell notifications remain independent.
- The default destination is the current email from the authoritative QNH Portal `users` row resolved from the authenticated Portal identity. TaskHub does not copy or own that Portal email.
- A user may keep one additional alternate email. The alternate address must be proven with a secure 6-digit one-time code before it can be selected.
- Verification codes are generated with cryptographically secure randomness, protected with a server-side HMAC secret, expire after 10 minutes, allow at most 5 incorrect attempts, enforce a resend cooldown, and limit verification sends per user.
- Verification-code email is delivered directly through the email transport so the plaintext code is never persisted in `TM_email_outbox`.
- Only one destination is active at a time: `PORTAL` or a verified `ALTERNATE`. Verifying a new alternate address does not normally make it active automatically.
- Verified alternate addresses and pending alternate verifications are unique across TaskHub users to reduce accidental cross-account delivery.
- Users independently choose email delivery for overdue tasks, tasks due today, high-priority tasks due tomorrow, current-Cycle ending/past-end events, below-target KPI results, and missing manual KPI measurements.
- A branded test-email action sends to the currently active address without creating an operational notification.
- Phase 2 does not yet queue operational task, Work Cycle, or KPI emails; those rules are connected in Phase 3.

### Phase 3 operational email events

- Operational task, Work Cycle, and KPI events consult the email master switch, the per-event preference, and the active verified destination before queueing email.
- Supported events are overdue task, task due today, high-priority task due tomorrow, current Work Cycle ending soon, current Work Cycle past its planned end date, KPI below target, and required manual KPI measurement still missing near period end.
- The event is revalidated before queueing so a completed task, changed due date, closed/non-current Cycle, recovered KPI, or newly entered measurement does not create a stale email.
- The email worker resolves the user's latest active destination, language, master switch, and event preference again immediately before SMTP delivery. A no-longer-allowed operational email is preserved in the outbox as `CANCELED`, not falsely marked sent.
- Notification rows created before migration 011 are marked as already email-processed so enabling Phase 3 does not blast users with historical notification email. New notification rows are considered once and use stable owner-scoped outbox deduplication keys.
- Task emails deep-link to the exact task. Work Cycle and KPI emails deep-link to the exact current Cycle/KPI instance.
- Event-specific subjects, preheaders, content, metrics, and CTAs reuse the shared branded QNH TaskHub shell. Cycle emails include progress/task/KPI-health summaries; KPI emails show target/result context; task emails show the relevant due-date context.

User-authored email templates are not planned. Users customize delivery preferences, not template markup.

## Deferred functionality

- Multi-user assignment, sharing, or organizational workflows
- Moving normal tasks into KPIs or KPI tasks into lists
- Arbitrary KPI formula builder
- Advanced collaboration, workflows, and analytics

## Database phase decisions

- The initial schema includes lightweight activity history.
- Email delivery/outbox tables are introduced by migration 009; per-user email destination, preference, and verification state is introduced by migration 010; operational email processing/cancellation state is introduced by migration 011.
- SQL migration scripts must never be executed without separate explicit approval.


