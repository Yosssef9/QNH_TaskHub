# QNH TaskHub — Zoom Meeting Support

## Scope

TaskHub Meetings now support two scheduling modes while keeping one shared Meeting workspace and lifecycle model:

- `ROOM` — physical Meeting Room scheduling.
- `ZOOM` — online Zoom scheduling.

The mode belongs to each Meeting revision so a future reschedule can change a Meeting from Room to Zoom or from Zoom to Room without losing schedule history.

## Permissions

Persisted Meeting permissions are:

- `MEETING_ORGANIZE_ROOM`
- `MEETING_ORGANIZE_ZOOM`
- `MEETING_COORDINATE`

Room and Zoom Organizer permissions are independent. A Coordinator has effective Room Organizer capability because coordination owns physical-room scheduling, but Coordinator does **not** imply Zoom Organizer capability. Admins may grant Room Organizer, Zoom Organizer, both, Coordinator, or combinations as required.

Migration 045 converts each legacy `MEETING_ORGANIZE` grant to `MEETING_ORGANIZE_ROOM`, preserving the prior physical Meeting capability without silently granting Zoom scheduling.

## Scheduling rules

### Room Meeting

- physical `room_id` is mandatory;
- Zoom link is absent;
- Organizer creation remains a `PENDING_APPROVAL` request;
- Coordinator approval is required before the physical room is reserved;
- active-room, capacity, room-conflict, and room-lock rules remain authoritative;
- Coordinator may schedule Room Meetings directly under the existing workflow.

### Zoom Meeting

- `online_join_url` is mandatory;
- `room_id` is null;
- URL must be HTTPS and hosted by `zoom.us` or a `*.zoom.us` vanity subdomain;
- a Zoom Organizer schedules the Meeting immediately without Coordinator approval;
- Zoom does not consume a physical room, has no room-capacity rule, and takes no room scheduling lock;
- Coordinator permission alone does not allow creating Zoom Meetings.

## Participant conflicts

Participant conflicts remain advisory for both Meeting types. The existing conflict engine continues to compare attendance across current approved scheduled Meetings, therefore all combinations are covered:

- Room ↔ Room
- Room ↔ Zoom
- Zoom ↔ Room
- Zoom ↔ Zoom

A participant conflict never blocks scheduling. Back-to-back Meetings remain non-conflicting.

## Rescheduling and conversion

The target Meeting type determines the workflow:

- Zoom → Zoom: direct Organizer reschedule.
- Room → Zoom: direct when the Organizer has Zoom Organizer permission; the previous physical room is released when the Zoom revision becomes current.
- Zoom → Room: becomes a Room reschedule request and requires Coordinator approval.
- Room → Room: retains the existing Coordinator-approval workflow.

All normal future-start, stale-row, attendee, and lifecycle protections still apply.

## Meeting workspace

Room and Zoom Meetings share the same Meeting identity and workspace features:

- Participants and attendance
- Agenda
- Attachments
- Notes and Decisions
- Action Items
- Follow-up Meetings
- Related Meetings
- Activity history
- PDF reports
- Automatic report emails
- Calendar and My Meetings views

Authorized Zoom participants and Organizers can open the Zoom join URL. Unrelated schedule previews never expose it.

## Templates

Templates remember the Meeting mode. Zoom Templates intentionally do not persist a reusable Zoom join credential; the Organizer supplies the mandatory join URL when creating the actual Meeting.

## Meeting Series

Meeting Series remains Coordinator-controlled. A Series may contain Room and Zoom occurrences, but any Series containing Zoom occurrences additionally requires Zoom Organizer permission. Physical-room internal conflict checks apply only to Room occurrences sharing the same room. Zoom occurrences may overlap because they do not reserve a shared physical resource. Participant conflicts remain advisory per occurrence.

## Email and notifications

Zoom invitation and approved-reschedule email content identifies the Meeting as Zoom and provides a **Join Zoom Meeting** action for authorized recipients. Existing recipient-specific participant conflict warnings continue to apply. Room Meeting emails retain their physical-room details.

## Reports

PDF and report emails identify Zoom Meetings as online. The report deliberately does not print the credential-bearing Zoom join URL because the post-Meeting report does not require it.

## Database migration

Apply `server/database/migrations/045_add_zoom_meeting_location_and_permissions.sql` before deploying the matching server/client build.

The migration:

1. splits the legacy Organizer permission into Room/Zoom capabilities;
2. adds revision `meeting_mode` and `online_join_url`;
3. makes revision `room_id` conditional;
4. adds Template Meeting mode;
5. extends Meeting Series member snapshots for online Meeting locations;
6. preserves all existing Meetings as `ROOM`.
