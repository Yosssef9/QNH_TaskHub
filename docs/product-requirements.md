# QNH TaskHub — Current Product Requirements

> Status: planning baseline. Last aligned: 2026-09-03.

## Product summary

QNH TaskHub is an Arabic-first productivity application authenticated through QNH Portal. Normal Tasks, Lists, KPIs, Work Cycles, and Contracts remain private owner-scoped domains. The Meetings module is the deliberate shared-domain exception and uses relationship-aware authorization for Organizers, Coordinators, attendees, room scheduling, and later Meeting Action Items.

The Meetings exception must not weaken the privacy model of existing owner-scoped domains. Superseded planning material must not be used to introduce unrelated multi-user or organizational workflows.

The product should feel simple enough to use without documentation. The Arabic dashboard image supplied during planning is a style reference only.

## Users, authentication, and administration

- Authentication uses the existing QNH Portal JWT.
- The token's `USER_CODE` is resolved server-side to the authoritative Portal `USER_ID`.
- TaskHub stores no Portal password or password hash.
- A user requires active TaskHub access.
- TaskHub roles are `USER` and `ADMIN`.
- Administrators manage application access, the official-holiday calendar, Meeting permissions, and Meeting Room setup.
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


## Meetings

Meetings is TaskHub's intentionally shared multi-user domain. It remains isolated from private normal Tasks/KPIs/Contracts.

Phase 1 foundation:

- the Meetings navigation/workspace is available to every active TaskHub user;
- TaskHub application roles remain `USER` and `ADMIN`;
- Meeting capabilities are separate, combinable permissions:
  - `MEETING_ORGANIZE`;
  - `MEETING_COORDINATE`;
- `MEETING_COORDINATE` includes the effective ability to organize Meetings, while the two grants remain independently manageable;
- `ADMIN` manages Meeting permission assignment and Meeting Room master data but does not automatically receive access to unrelated Meeting business content;
- Meeting Rooms are active/inactive resources with bilingual names, location text, capacity, equipment notes, a persisted controlled room color used consistently by Calendar/Room Schedule visuals, and SQL Server `ROWVERSION` stale-edit protection. Administrators may choose from the deliberately distinct `BLUE`, `PURPLE`, `GREEN`, `ORANGE`, `RED`, `GOLD`, `SLATE`, and `PINK` palette; when left automatic, TaskHub assigns the first least-used palette color and persists it so the room identity remains stable;
- the Meetings schema introduces stable Meeting identity, scheduling revisions, attendees, and immutable Meeting activity as the foundation for later workflow phases;
- Phase 2 adds the server-side scheduling engine: Organizer/Coordinator availability checks, active-room validation, participant-capacity enforcement, overlap checks against only the current approved revision of scheduled Meetings, transaction-scoped per-room locking, and atomic activation of a pending revision. Pending requests/revisions do not reserve rooms. Request approval UI, Calendar integration, Meeting notifications, Templates, attachments, and Action Items remain later phases.
- Phase 3 connects the scheduling engine to the core Meeting workflow: Organizers submit `PENDING_APPROVAL` requests, Coordinators share a pending queue, may adjust only room/date/time/scheduling notes before decision, approve/reject with stale-row protection, and may create Meetings directly without self-approval. Attendees are selected from active Portal users (`dbo.users.IS_ACTIVE = 1`) regardless of whether they currently have active TaskHub access; the Organizer is an implicit participant. Selecting a Portal user as an attendee does not grant TaskHub access or Meeting Organizer/Coordinator permissions, and TaskHub-only in-app/email delivery remains subject to the recipient's applicable TaskHub access/settings. The participant picker uses server-side paginated search with progressive loading on scroll, keeps selected attendees visible independently of the currently loaded/search page, and presents large selections through a compact summary plus a dedicated selected-participants management pane. Normal users receive only Meetings they attend, Organizer/attendee relationships receive full Meeting details, and unrelated scheduling occupancy is limited to title + Organizer + room/time for Organizers, while Coordinators receive full Meeting visibility for coordination. Important request, scheduling-change, approval, rejection, and direct-create actions write immutable Meeting activity. Calendar rendering, Meeting notifications/email/reminders, Templates, attachments, rescheduling/cancellation, and Action Items remain later phases.
- Phase 4 adds the Meeting Details workspace and core lifecycle after scheduling. While an initial request remains `PENDING_APPROVAL`, its Organizer may change the requested room/date/time and the Coordinator reviews the latest version. After a Meeting is scheduled, its Organizer may create at most one pending `RESCHEDULE` revision, edit that pending request, or cancel it; the current approved reservation remains active until a Coordinator decision. Coordinators are the final scheduling authority: they may approve as requested, atomically adjust-and-approve the Organizer's proposal, reject it, or directly reschedule any scheduled Meeting regardless of who created it. A direct Coordinator change never requires Organizer re-approval, but it must pass the same active-room/capacity/conflict checks, create a revision, switch the authoritative reservation atomically, and preserve before/requested/final values in immutable Meeting activity. Rejection or Organizer cancellation of a pending reschedule leaves the current approved reservation unchanged. Organizers may cancel pending/scheduled Meetings without deletion, preserving history and releasing any active reservation. Meeting attachments use protected server-managed storage, the existing 10-file/10-MB general allowlist policy, signature/content validation, and relationship authorization; Organizer manages files, scheduled/cancelled attendees may read them, and Coordinator read access covers Meeting details and protected Meeting files across the Meetings domain; file mutation remains Organizer-owned. Personal Meeting Templates are private to each Organizer/Coordinator and may store reusable title, description/purpose, duration, optional default room, and attendees. The Template editor separates Template identity from default Meeting settings, offers common duration presets with a custom 1–1440-minute fallback, uses the shared paginated Meeting participant picker for default attendees, and shows a compact summary before save; Template attachments remain deferred. Structured agenda topics are Meeting-specific in this phase rather than Template content. Calendar integration, Meeting notifications/email/reminders, and Action Items remain later phases.
- Structured Meeting Agenda is stored as ordered Meeting-owned items, separate from the optional Meeting description/purpose. Each item requires a topic and may optionally name a presenter/topic owner and a planned duration. Presenter selection is restricted to the Organizer or selected attendees. Agenda timing is planning guidance only: the UI may compare planned agenda minutes with the Meeting duration and warn when it runs over, but the total never blocks Meeting creation or scheduling. The Meeting Organizer may add, edit, remove, and reorder Agenda topics from Meeting Details while the Meeting is pending or scheduled; attendee access is read-only, and Coordinator/Admin scheduling authority does not grant Agenda-content edit rights for another Organizer's Meeting. Agenda, later Meeting Notes/Decisions, and later Action Items remain distinct concepts.
- Phase 5 integrates scheduled Meetings into the existing Calendar. Calendar sources become composable Personal Tasks, KPI Tasks, and Meetings. Meetings use real `startAtUtc` / `endAtUtc` values and appear as timed events in Week/Day TimeGrid views with 30-minute visual slots; date-only Tasks/KPI Tasks remain in the all-day/date area. Month remains the overview, and clicking a Month date while Meetings are enabled opens that date's Day TimeGrid. A Meeting Room filter narrows scheduling occupancy. Normal users receive only Meetings they attend; Organizer users receive title + Organizer + room/time previews for unrelated scheduled Meetings, while Coordinators receive full Meeting entries and may inspect/open their details. Full Meeting blocks open the existing Meeting Details workspace; Organizer-only preview blocks are not detail links. No new Calendar database table or duplicate Meeting source is introduced.
- Phase 6 connects Meeting lifecycle events to the existing in-app Notification Bell and asynchronous email outbox/worker. Meeting lifecycle email event preferences are personal and default ON, while the separate 15-minute Meeting-start reminder is personal, default ON, and in-app only. Request submission and requested-schedule changes notify the Organizer and active Coordinators; Organizer cancellation of a pending reschedule also notifies that coordination audience. Attendees are not notified about unapproved proposals. Once a Coordinator approves, adjusts-and-approves, or directly reschedules a Meeting, the Organizer and attendees receive the final schedule change through in-app notifications and preference-aware email; rejection notifies the Organizer. Rescheduling/cancellation invalidates stale reminders, and operational email delivery revalidates current Meeting/revision/recipient state and the recipient's current email settings immediately before send. Communication failures do not roll back an already-successful Meeting business transaction. No new queue or worker is introduced.

The detailed Meetings product and security rules are maintained in the dedicated Meetings source-of-truth document used with implementation work.

## Calendar

- TaskHub includes one top-level **Calendar / التقويم** view. It is a shared projection of existing Personal Tasks, KPI Tasks, and scheduled Meetings; it is not a separate event/scheduling source of truth and does not duplicate Meeting or Task records.
- Calendar sources are independently composable: **Personal Tasks**, **KPI Tasks**, and **Meetings**. Month and Agenda views remain available; when Meetings are enabled, **Week** and **Day** TimeGrid views are available. Task status/priority/list/Work Cycle/KPI filters apply only to task sources, while a Meeting Room filter applies to Meetings.
- Calendar task search is a dedicated owner-scoped finder across **all dated Calendar tasks**, not only the visible range. When both Personal and KPI task sources are enabled, the client queries both existing owner-scoped search paths and merges the bounded results. It searches task title/description plus relevant List, KPI, and Work Cycle names, waits for at least two characters with a short debounce, and opens the existing Task Details workspace. Meeting search is not added in Phase 5.
- A task appears once on its due date when one exists; otherwise it appears on its start date. Tasks with neither date do not appear on the Calendar.
- Meetings are timed events using authoritative schedule start/end timestamps. Week/Day use a **30-minute visual grid**; the database does not store 30-minute reservation rows. A Meeting from 08:00–10:00 renders continuously across four half-hour intervals. The initial visible scheduling window is centralized in Calendar code and can be changed later without schema changes.
- Clock presentation is a private per-user preference with explicit **12-hour** and **24-hour** choices. The same persisted preference is editable from Settings and directly from Calendar controls, and applies consistently to Calendar axes/events, Meeting scheduling/workspaces/history, other TaskHub clock timestamps, reminders/notifications that show time, and recipient-specific Meeting lifecycle email. It changes presentation only; authoritative UTC timestamps and scheduling rules never change when the user changes format.
- Date-only Personal/KPI Tasks remain in the all-day/date area in Week/Day views; TaskHub must not fabricate a time of day for them.
- When Meetings are enabled, clicking a Month date opens the Day TimeGrid for that date. When Meetings are disabled, the existing task day-panel behavior remains.
- Personal calendar results include only normal-list tasks. KPI calendar results include only KPI-instance tasks. These domains remain separate and all queries are owner-scoped from the authenticated Portal user.
- Calendar Task/KPI rendering reuses the existing status, priority, overdue, light/dark, and RTL/LTR visual system. Meeting rendering uses the existing Meeting schedule response: `FULL` entries show the Meeting title and open Meeting Details; Coordinators receive `FULL` entries for scheduled Meetings, while Organizer-only unrelated `PREVIEW` entries show only title + Organizer + room/time and are not clickable for details.
- Clicking a date, or a Month-view `+N more` link, opens a localized day panel using the already-loaded visible-range data. The panel shows that day's tasks and can launch the existing Task Editor without adding a calendar-specific mutation API.
- The Month view is responsive rather than horizontally scrolling on phones: desktop/tablet cells show compact TaskHub task chips, while narrow phone cells collapse task content to semantic status/priority indicators plus a compact `+N` overflow count. On phones the selected day's task list renders inline below the calendar; on larger screens it continues to use the existing drawer treatment.
- Month display defaults to **Include adjacent month dates** so complete week rows remain visible across month boundaries. Users may switch to **Current month only**, where adjacent-month cells preserve weekday alignment but do not show dates or accept date clicks. The choice is stored as a private user preference, and month height uses the natural number of week rows instead of always forcing six.
- Friday and Saturday are visually distinguished with the existing muted TaskHub treatment because they are QNH non-working days. Weekend cells remain fully interactive for normal task viewing and creation; weekend styling never disables a date or overrides task status/priority semantics.
- Calendar interactions remain keyboard- and screen-reader-usable: visible day numbers are explicit controls with localized item counts, authorized rendered events are interactive/focusable, loading state is announced, and scheduling state is not conveyed only by color.
- Calendar quick-create keeps the existing task/KPI date policy when exactly one task source is the creation context. When both Personal and KPI task sources are simultaneously enabled, the Calendar does not guess which domain should own a newly created task. Meeting creation remains in the Meetings workflow rather than being invented from a time-grid click in Phase 5.
- Personal quick-create may preselect the active list filter, while KPI quick-create may preselect the active open Work Cycle/KPI filter. The existing editor remains authoritative and users can change permitted context before save.
- Calendar rendering remains visible-range bounded. Personal/KPI tasks continue through the existing Calendar task endpoint(s); scheduled Meetings reuse the existing relationship-aware `/meetings/schedule` endpoint. Calendar adds no separate task CRUD API, Meeting CRUD API, or calendar-event database table. Existing Task and Meeting APIs remain authoritative.
- Drag-to-reschedule remains disabled. Phase 5 adds timed Meeting display only; Meeting scheduling/rescheduling continues through the explicit Meetings workflow. Recurring Meetings, premium resource-column scheduling, and external calendar synchronization remain deferred.

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
- Advanced collaboration, workflows, and analytics outside the explicitly approved Meetings domain

## Database phase decisions

- The initial schema includes lightweight activity history.
- Email delivery/outbox tables are introduced by migration 009; per-user email destination, preference, and verification state is introduced by migration 010; operational email processing/cancellation state is introduced by migration 011.
- SQL migration scripts must never be executed without separate explicit approval.
- Meetings Phase 1 schema is introduced by migration 018; applying it is a separate manual database step.
- Meetings Phase 4 private Templates and protected Meeting-attachment metadata are introduced by migration 019; applying it is a separate manual database step.
- Meetings Phase 6 notification/email/reminder schema is introduced by migration 020; applying it is a separate manual database step.
- Structured Meeting Agenda items are introduced by migration 021; applying it is a separate manual database step. Existing Meetings remain valid with an empty Agenda.
- Expanded Meeting reschedule lifecycle notification/email event types are introduced by migration 022; applying it is a separate manual database step after 021.
