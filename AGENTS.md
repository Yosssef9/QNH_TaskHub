# AGENTS.md — QNH TaskHub

> Persistent project context for Codex. Project context last aligned: 2026-09-01.

## 1. Mission

**QNH TaskHub** is an Arabic-first productivity application for QNH Portal users.

The core product lets each user organize private personal work in a permanent **My Tasks** list, create additional private lists, create independently configured KPIs with their own KPI tasks, and use an optional private **Contracts** domain. The approved **Meetings** module is the deliberate shared-domain exception: it introduces controlled Organizer/Coordinator/attendee relationships without changing the private ownership semantics of Tasks, Lists, KPIs, Work Cycles, or Contracts. Do not infer unrelated collaboration requirements from the Meetings exception or superseded planning material.

Detailed product behavior is maintained in [`docs/product-requirements.md`](docs/product-requirements.md).

## 2. Codex working rules

- Read this file and the relevant project documentation before making changes.
- Inspect existing code before inventing patterns.
- Obtain the user's explicit approval before modifying code, documentation, dependencies, or database artifacts. Read-only inspection is allowed when needed to answer a request.
- Never execute database scripts or change a database without separate explicit approval.
- Make the smallest coherent change that satisfies the approved request.
- Do not add future features merely because the schema or architecture could support them.
- Do not silently change ownership, privacy, KPI calculation, workflow, or authentication rules.
- If ambiguity affects security, data ownership, calculations, or schema, surface it rather than guessing.
- Reuse existing helpers and components; avoid duplicate implementations and unrelated refactors.
- Keep TypeScript strict and do not use `any` as a shortcut.
- Add or update tests when business, calculation, or authorization behavior changes.
- Run relevant lint, typecheck, tests, and build checks before finishing implementation work.
- Report what changed, what was validated, and any unresolved assumptions.

## 3. Product invariants

- Every user's lists, tasks, subtasks, attachments, KPIs, measurements, Contracts, Contract Suppliers, Contract settings, and Contract history are private to that user.
- An `ADMIN` does not automatically gain access to another user's private work.
- The only application role codes are `USER` and `ADMIN`; Contracts access is a separate optional module flag, not a new role or granular permission system.
- Every user has one permanent default **My Tasks** list and may create additional personal lists with a name, icon, and color.
- A normal task belongs to exactly one normal list.
- KPI work is separate from normal lists. A KPI is a reusable private template; a KPI task belongs to exactly one KPI instance inside exactly one private Work Cycle and does not appear in My Tasks or a custom list.
- Moving a task between a normal list and a KPI is outside the current scope.
- Normal-list tasks and KPI tasks should reuse shared implementation where practical without weakening their domain separation.
- A KPI uses one controlled calculation method. Do not add a user-authored formula language in the MVP.
- KPI task progress and KPI performance are separate concepts.

## 4. Authentication and access

TaskHub must reuse existing **QNH Portal JWT authentication**.

Do not implement:

- A separate TaskHub login or password
- Password storage or reset flows
- Separate token issuance

Expected flow:

1. The frontend obtains and forwards the Portal token.
2. The backend validates `Authorization: Bearer <portal-token>` using the established QNH Portal contract.
3. The Portal token's `USER_CODE` identifies the Portal user.
4. The backend resolves the authoritative Portal `USER_ID` and active TaskHub access server-side.
5. TaskHub role and ownership checks determine authorization.

Important invariants:

- Portal authentication proves identity; active TaskHub access determines whether the user may enter the application.
- Never trust client-supplied user IDs, roles, ownership, or Portal administration claims.
- Do not automatically map a Portal administrator flag to TaskHub `ADMIN`.
- Store the authoritative numeric Portal `USER_ID` as the internal owner reference. Do not copy Portal passwords or password hashes.

## 5. Roles and privacy

Stable MVP role codes:

- `USER` — manages only their own private work and preferences.
- `ADMIN` — manages TaskHub access, application administration, and the Saudi holiday calendar.

Role codes are technical identifiers. Display labels may be localized and must not drive authorization logic.

All private-resource queries and mutations must enforce `owner_user_id = authenticated Portal USER_ID` on the backend. This applies to direct detail endpoints, lists, search, counts, KPI results, attachments, and future exports. Frontend guards are UX only.


## 6. Contracts domain

Contracts are an optional, first-class private domain that is independent from Tasks, Lists, KPIs, Work Cycles, and Calendar items.

- A user sees the Contracts navigation and APIs only when their existing TaskHub access has `contracts_enabled = 1`. Disabling the module removes access but preserves all Contract data.
- `ADMIN` never implies access to another user's Contracts. All Contract and Supplier queries remain backend owner-scoped.
- The Phase 1A navigation is an expandable **Contracts** section with **My Contracts** and **Suppliers**.
- Suppliers are private first-class entities. Supplier Name is required; CR/tax/contact/address/notes are optional. Archived Suppliers remain visible on existing Contracts but cannot be newly assigned.
- Contract Number is optional text; Contract Title and Start Date are required. End Date may be omitted for open-ended Contracts, but automatic renewal requires an End Date, Renewal Term, and Notice Period.
- Automatic Renewal is a yes/no contractual attribute. TaskHub must not automatically mutate End Date or decide that a legal renewal occurred.
- Notice Deadline is derived from End Date minus Notice Period. Duration, Days Remaining, and date-tracking state (`UPCOMING`, `ACTIVE`, `EXPIRING_SOON`, `EXPIRED`) are also derived, not editable status fields.
- `expiring_soon_days` is a private per-user Contract setting (default 90) and affects derived tracking only. Phase 1C adds independent reminder lead days for End Date and automatic-renewal Notice Deadline events plus optional email copies.
- Contract value distinguishes `FIXED` from `VARIABLE`. Payment Frequency and Payment Timing are separate; `IN_ADVANCE` means payment in advance, not a frequency.
- Contract edits use explicit Save, a review/confirmation diff, optimistic `ROWVERSION` concurrency, and one immutable audit event in the same SQL transaction. Archived Contracts are read-only until restored.
- Phase 1B adds private Contract Files: PDF/JPG/JPEG/PNG only, up to 10 active files per Contract and 10 MB per file, protected server-managed storage, owner-authorized preview/download/remove, file-count hints in My Contracts, a Files tab in Contract Details, and immutable `ATTACHMENT_ADDED` / `ATTACHMENT_REMOVED` history events. Archived Contracts remain read-only for file mutations.
- Phase 1C adds owner-scoped Contract expiration and automatic-renewal Notice Deadline reminders. Reminder generation is date-based and deduplicated; if the configured lead date has passed but the actual End Date/Notice Deadline is still future, TaskHub creates the reminder on the next scan. In-app reminders remain independent from email. Optional Contract email copies reuse the existing TaskHub outbox/worker, active verified destination, bilingual templates, send-time revalidation, and cancellation rules. Contract reminder settings are personal and Contract access must still be enabled.

## 7. Meetings domain

Meetings is TaskHub's first intentionally shared multi-user domain.

- Keep application roles `USER` and `ADMIN`.
- Store Meeting capabilities separately as combinable `MEETING_ORGANIZE` and `MEETING_COORDINATE` grants.
- A Coordinator has effective Organizer capability even when the explicit Organizer grant is off.
- `ADMIN` manages Meeting permission assignment and Meeting Room setup but does not automatically receive unrelated Meeting business content.
- Meeting authorization is relationship-aware and must not be implemented by weakening existing `owner_user_id` rules.
- Meeting Rooms are deactivated rather than physically deleted and use `ROWVERSION` for stale-edit protection.
- Phase 1 establishes Meetings, scheduling revisions, attendees, rooms, permissions, and immutable activity. Phase 2 adds the authoritative room scheduling engine: active-room checks, capacity enforcement, current-reservation overlap checks, per-room transaction application locks, advisory availability, and atomic pending-revision activation. Pending revisions still do not reserve rooms.
- Reuse TaskHub's existing modular-monolith, auth/access, validation, SQL Server, localization, and shared UI patterns.

## 8. Normal lists and tasks

- **My Tasks** is the permanent default list, not an aggregate view of KPI work.
- Users may create, rename, order, recolor, and choose icons for custom lists.
- A custom list is a private personal container.
- A normal task is created directly inside My Tasks or one custom list.
- Normal tasks have no KPI target, KPI score, or KPI measurement fields.
- Do not introduce multi-user collaboration or organizational hierarchy features unless later requested.

Task workflow statuses:

- `TODO`
- `IN_PROGRESS`
- `DONE`
- `CANCELLED`

Task priorities:

- `LOW`
- `MEDIUM`
- `HIGH`

`OVERDUE` is calculated when an unfinished, non-cancelled task has passed its due date; it is not stored as a workflow status.

## 9. KPIs

A KPI is a reusable private template. Operational KPI tasks and results belong to one KPI instance inside one Work Cycle.

Each user creates and owns reusable KPI templates. A Work Cycle is a private concrete occurrence that selects templates into snapshot KPI instances; operational tasks, subtasks, measurements, and results belong to those instances. The same template may be reused by unlimited Work Cycles but only once within one Cycle. Supported MVP calculation methods:

- `ON_TIME_RATE`
- `TASK_COMPLETION_RATE`
- `SUBTASK_COMPLETION_RATE`
- `SUBTASK_ON_TIME_RATE`
- `MANUAL_RATIO`
- `MANUAL_NUMBER`

Supported reporting periods:

- `MONTHLY` — default
- `QUARTERLY`
- `YEARLY`

Each KPI may have an optional target and a direction of `HIGHER_IS_BETTER` or `LOWER_IS_BETTER` where applicable.

Core calculations:

- On-time rate = eligible tasks completed by their calculated deadline / eligible tasks × 100.
- Task completion rate = completed eligible tasks / non-cancelled eligible tasks × 100.
- Subtask completion rate = completed eligible subtasks / eligible subtasks × 100.
- Subtask on-time rate = eligible subtasks completed by their due date / eligible subtasks × 100.
- Manual ratio = user-entered achieved value / user-entered total value × 100.
- Manual number = a user-entered period value evaluated against its target and direction.
- For higher-is-better percentage KPIs, target achievement = actual / target × 100.
- For lower-is-better KPIs, target achievement may use target / actual × 100 only when mathematically meaningful. A zero target or actual must use an explicit met/not-met result rather than inventing a percentage.

Cancelled work is excluded from completion denominators. Future work whose deadline has not arrived is not counted as a failure in on-time calculations.

The KPI setup UI must show a localized plain-language calculation preview and a numeric example before saving.

Template changes affect future instances only and must never silently rewrite existing instance snapshots. Work Cycles may be open, closed, or archived. Closed Cycles are read-only across tasks, subtasks, attachments, and measurements; owners may explicitly reopen them.

## 10. Business days and time

- QNH operates in `Asia/Riyadh`.
- Saudi business days are Sunday through Thursday.
- Friday and Saturday are weekends.
- Administrator-managed official holidays are excluded from business-day calculations.
- On-time KPIs may calculate a deadline a configured number of business days `BEFORE` or `AFTER` a task's reference date.
- Centralize date parsing, formatting, deadline, and overdue behavior and test boundary cases.

## 11. Attachments

- Tasks and subtasks may have attachments.
- Store attachment metadata in SQL Server and file contents in protected server-managed storage.
- Never expose physical storage paths or make private files publicly addressable.
- Authorize every upload, download, and deletion using the authenticated owner.
- Generate storage names server-side and validate file size and type.
- Allow at most 10 attachments per task or subtask and at most 10 MB per file.
- Allow PDF, Office documents, common image formats, and plain-text files. Reject executables, scripts, and unsafe content; enforce the canonical allowlist in backend configuration.

## 12. In-app notifications

- In-app notifications are private and owner-scoped like the work they reference.
- Notification generation must not trust client-supplied ownership or entity IDs.
- Initial triggers cover overdue/due-soon tasks, current Work Cycle end dates, below-target KPI results, and missing manual measurements near period end.
- Use persistent deduplication keys so periodic polling cannot create duplicate copies of the same event.
- The notification bell uses periodic TanStack Query refresh; do not add WebSockets unless a later collaboration requirement justifies them.
- Email delivery is a separate later phase.

## 13. Activity and deletion

- Keep a lightweight task activity history for creation, status, date, completion, reopen, cancellation, deletion, and restoration events.
- Use soft deletion for tasks, subtasks, and attachments.
- Use archiving for custom lists and KPIs.
- The permanent My Tasks list cannot be archived or deleted.
- Finalized KPI periods preserve their calculated result and target snapshot.

## 14. UI and UX

- Arabic is the preferred/default language and uses full RTL layout.
- English is supported with LTR layout.
- Support accessible light and dark themes.
- Desktop navigation uses a collapsible sidebar: icons and labels when expanded, icons with tooltips when collapsed.
- Mobile navigation uses a drawer.
- Directional UI icons must follow the active writing direction. In Arabic RTL, previous/back points right and next/forward points left; use shared direction-aware components instead of fixed arrows.
- Portal-based overlays such as toasts, dialogs, popovers, and tooltips must receive the active `dir`; Arabic content is right-aligned and its layout order must be verified in RTL.
- Keep screens simple, readable, responsive, and usable without training.
- Use progressive disclosure in KPI setup so users see only fields relevant to the selected calculation method.
- The supplied Arabic dashboard image is visual inspiration only; do not copy its obsolete modules or workflows.
- Use React Hot Toast for short success/error feedback when notification UI is implemented.
- The approved Task Calendar through Phase 3 is a top-level Month/Agenda view over existing tasks. It preserves the Personal-task/KPI-task domain split, uses due date first then start date as the single display date, provides a policy-aware quick-create through the existing Task Editor, and reuses existing task APIs for all mutations/details. Its Month view is responsive: desktop/tablet show task chips, narrow phones show compact semantic indicators/counts with the selected day's tasks inline below the calendar, while larger screens keep the day drawer. Calendar day/task interactions must remain keyboard and screen-reader usable. Do not create a separate calendar-event source of truth.
- Normal Calendar event reads must be backend owner-scoped and range-bounded; Calendar-wide search remains owner-scoped and bounded by a small result limit. The client never supplies an owner/user ID. Calendar styling must reuse existing TaskHub semantic tokens and RTL/LTR behavior.
- Calendar Month display defaults to showing adjacent-month dates, with an optional per-user preference for current-month-only display. Friday and Saturday use a subtle muted non-working-day treatment but remain fully interactive; do not disable weekend task creation or reuse task warning/error colors for weekend styling.
- Calendar search is separate from normal visible-range event loading: it searches all owner-scoped tasks that have a Calendar date, respects Personal/KPI scope plus current filters, and may match title, description, List, KPI, or Work Cycle context. Keep it bounded and debounced, and navigate/highlight the existing Calendar/task rather than creating a second details workflow.
- Use Framer Motion as the standard animation layer for component enter/exit, layout, expand/collapse, and other UI transitions. Do not build new animations with handwritten CSS keyframes or Tailwind animation/transition utilities. Keep motion subtle, fast, accessible, and consistent; respect reduced-motion preferences and centralize reusable motion variants.

## 15. Email delivery

Email delivery is implemented in three controlled phases. Phase 1 established transport, outbox, worker, retry/idempotency, and the shared QNH TaskHub email design system. Phase 2 added private per-user destinations, verification, and event preferences. Phase 3 connects operational task, Work Cycle, and KPI events to that delivery system.

Current direction:

- A provider abstraction isolates business code from the delivery mechanism. Phase 1 uses Nodemailer with QNH SMTP configuration; a future Microsoft Graph transport may be added without changing the outbox or template APIs.
- Email is asynchronous through `TM_email_outbox`; normal TaskHub API operations must not wait on provider delivery.
- The modular-monolith worker claims outbox rows safely, retries transient failures with bounded backoff, records final delivery state, and uses stable deduplication keys. Do not introduce Redis or a separate microservice without demonstrated need.
- All system emails use one centrally maintained QNH TaskHub branded shell with the QNH logo, system colors, responsive HTML, Arabic RTL / English LTR behavior, and a plain-text fallback. Event content changes by template; users never author raw email markup.
- The authoritative Portal email is read from the existing `dbo.users` row resolved from the authenticated Portal user; TaskHub does not copy or edit the Portal address.
- A user may store one verified alternate email and may select exactly one active destination: `PORTAL` or `ALTERNATE`. Never use an unverified alternate address for operational email.
- Alternate-email ownership is proven with a short-lived 6-digit code generated using secure randomness. Store only an HMAC-protected representation using `EMAIL_VERIFICATION_SECRET`; never store or log the plaintext code.
- Verification codes expire after 10 minutes, are single-use, have a five-attempt limit, resend cooldown, and per-user hourly send limit. Verification-code delivery bypasses the outbox so the plaintext code is never persisted in outbox payload JSON.
- The email master switch and per-event preferences affect email only; in-app notifications remain independent.
- Operational email supports overdue tasks, tasks due today, high-priority tasks due tomorrow, current-Cycle ending/past-end events, below-target KPI results, and missing manual KPI measurements. Queueing checks the master switch, event preference, active destination, and current event state. The worker checks preferences/destination again immediately before delivery.
- `TASKHUB_PUBLIC_URL` is the canonical base for absolute email links. Secrets and SMTP credentials stay in server environment variables and must never be exposed to the client or logs.
- Email delivery remains disabled by default until migration/configuration is deliberately applied.

Phase 3 is active: operational notifications created after migration 011 are considered for email exactly once. Existing notification history is backfilled as already processed to prevent a historical email burst. Event-specific subjects, preheaders, content, metrics, and deep-link CTAs reuse the shared branded shell. Pending operational outbox rows may be marked `CANCELED` if the user disables email, disables that event, or no longer has a valid destination before delivery.

## 16. Current technology direction

Frontend:

- React 19, TypeScript, Vite
- React Router and TanStack Query
- React Hook Form and Zod
- Tailwind CSS and shadcn/ui-style primitives
- Lucide icons
- Axios API client

Backend:

- Node.js LTS, Express 5, TypeScript, Zod
- SQL Server through `mssql`
- Portal JWT authentication

Tooling:

- pnpm
- ESLint and Prettier
- Vitest and React Testing Library
- Playwright for a small set of critical E2E flows

Do not introduce PostgreSQL or Prisma while the application targets the existing QNH SQL Server and Portal environment.

## 17. Architecture rules

Build a modular monolith. Do not add microservices, Redis, WebSockets, queues, CQRS, event sourcing, GraphQL, or similar infrastructure without a demonstrated requirement.

Preferred backend flow:

`route -> authentication -> access -> validation -> controller -> service -> policy -> repository`

- Route: endpoint and middleware composition
- Controller: HTTP translation
- Service: use-case and calculation orchestration
- Policy: ownership and resource authorization
- Repository: parameterized SQL Server access
- Mapper: database/API transformation when useful
- Schema: request and query validation

No SQL in controllers or frontend code. Centralize ownership policy and KPI calculation logic rather than duplicating conditions across endpoints.

Use TanStack Query for server state and React state for local UI state. Do not add Redux or Zustand without a concrete need.

## 18. Budget System reuse policy

Reuse or adapt proven infrastructure patterns from QNH Budget System:

- Portal JWT verification and frontend token forwarding
- Authentication separated from application access
- SQL Server pool, repository, and transaction patterns
- Central API responses, errors, validation, and logging
- Generic date, ID, and error utilities
- Frontend authentication guards

Do not carry over Budget workspaces, financial years, category scopes, page locks, notification workers, or business modules. Reuse architecture patterns, not unrelated behavior.

## 19. Security invariants

- Validate the Portal JWT server-side.
- Resolve active TaskHub access and role server-side.
- Enforce private ownership server-side on every resource operation.
- Use parameterized SQL and validated request/query input.
- Prevent unauthorized information leakage through search, counts, KPI summaries, attachment endpoints, and error messages.
- Never log tokens, passwords, secrets, or sensitive attachment contents.
- Keep secrets and storage configuration in environment variables.
- Use opaque generated attachment storage names and safe response headers.

A feature that works in the UI but can be bypassed through the API is incomplete.

## 20. Testing priorities

Prioritize business, calculation, and security tests:

- A user can access only their own lists, tasks, subtasks, attachments, KPIs, and measurements.
- An admin cannot retrieve another user's private work through ordinary resource APIs.
- My Tasks is created once and cannot be deleted.
- A normal task has exactly one list and no KPI.
- A KPI task has exactly one KPI instance and no list; the instance belongs to exactly one Work Cycle and references exactly one KPI template.
- Normal tasks and KPI tasks cannot be moved between those domains in the MVP.
- Overdue calculation is deterministic.
- Saudi weekends and configured holidays are excluded correctly.
- Each KPI calculation method handles empty denominators and period boundaries correctly.
- Cancelled and future work is treated consistently.
- Attachment endpoints enforce ownership.
- Backend rejects forged owner IDs even if frontend controls are bypassed.

## 21. Explicitly outside the current MVP

- Multi-user normal-task assignment, sharing, or collaboration outside the approved Meetings domain
- Organizational hierarchy or shared work containers
- Admin visibility into private user work
- Moving tasks between normal lists and KPIs
- User-authored formulas or workflow engines
- Multiple assignees
- Nested subtasks beyond one level
- General-purpose comments, chat, mentions, reactions, or approvals outside explicitly approved domain workflows
- Recurring tasks until explicitly planned
- Kanban views and calendar functionality beyond the approved Task Calendar Phase 2 unless explicitly requested
- SMS, push, WhatsApp, or Teams notifications
- AI features and advanced report exports

## 22. Decision rule and source of truth

Optimize for:

1. Correct private ownership
2. Correct and explainable KPI calculations
3. Security
4. Simplicity for ordinary users
5. Maintainability and consistency
6. Fast MVP delivery
7. Minimal unnecessary complexity

Use this source order:

1. Explicit current user request
2. Current repository code and actual database schema
3. More-specific nested `AGENTS.md` files
4. Focused project documentation under `docs/`
5. This root `AGENTS.md`
6. General framework conventions

If documentation and implementation conflict on privacy, security, ownership, or KPI behavior, identify the mismatch instead of silently guessing.
