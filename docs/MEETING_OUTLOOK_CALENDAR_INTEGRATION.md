
# Meeting Outlook Calendar Integration

## Status

Approved integration, delivered in staged development ZIPs and intended for one final production release.

This document records the agreed architecture so later phases do not weaken TaskHub Meeting workflow rules.

## Source of truth

TaskHub remains the authoritative Meeting system.

Outlook Calendar is a synchronized representation of an approved TaskHub Meeting. Outlook changes never silently bypass TaskHub approval, room, capacity, conflict, revision, audit, cancellation, attendance, Action Item, or report rules.

Phase 1 established the integration foundation and migration 047.

Phase 2 wires the approved TaskHub → Outlook lifecycle:

- approved/direct scheduled Meetings enqueue asynchronous Outlook work;
- approved reschedules update the same mapped Outlook event;
- TaskHub cancellation cancels the mapped Outlook event;
- Room Meetings map the TaskHub room into Outlook location;
- Zoom Meetings remain Zoom and carry the existing external Zoom URL;
- valid-email participants become Outlook attendees while no-email participants remain TaskHub participants and produce a warning count;
- the Organizer's Portal email identifies the Microsoft mailbox;
- lifecycle jobs are retryable, lease-recovered, idempotency-aware, and never run inside the Meeting business transaction;
- Meeting Details exposes Outlook sync status, Open in Outlook, missing-email warnings, and Organizer/Coordinator retry.

The environment kill switch remains disabled by default, so deploying Phase 2 does not call Microsoft Graph until QNH Entra credentials are configured and `OUTLOOK_CALENDAR_SYNC_ENABLED=true`.

## Agreed lifecycle

### Create

1. Organizer creates a TaskHub Meeting request.
2. While `PENDING_APPROVAL`, no Outlook event exists.
3. Coordinator approval commits in TaskHub first.
4. After the TaskHub transaction succeeds, the Outlook worker queues/creates one event in the Organizer's Microsoft 365 calendar.
5. Exchange/Outlook distributes attendee invitations.
6. TaskHub stores the returned Graph event identity/version.

Outlook failure must never roll back the approved TaskHub Meeting.

### Reschedule

An approved TaskHub reschedule updates the same Outlook event. A pending/proposed TaskHub revision never changes Outlook.

### Cancel

TaskHub cancellation remains authoritative and later queues an Outlook cancellation for the same mapped event.

TaskHub invitation/reschedule/cancellation emails remain enabled even when Outlook also sends its calendar mail.

## Organizer, Coordinator and attendees

- The TaskHub Organizer's Microsoft 365 mailbox owns the Outlook event.
- A Coordinator does not become the Outlook organizer and is not automatically an attendee.
- A Coordinator is included only when also selected as a TaskHub Meeting participant.
- The Organizer needs a Microsoft 365 / Exchange Online mailbox that the TaskHub Entra application is authorized to manage.
- Attendees may use any valid SMTP email provider, including Gmail.
- A participant with no email remains a full TaskHub participant but cannot be represented as an Outlook attendee.

Missing-email participants produce `SYNCED_WITH_WARNINGS`, not `OUTLOOK_CHANGED`.

TaskHub shows the participant names. Outlook receives only a neutral count plus a TaskHub link so attendee-visible meeting text does not expose an unnecessary list of omitted names.

## Location mapping

### Room Meeting

The Organizer owns the Outlook event. The TaskHub room name and location text are written into the Outlook event location.

Phase 1 does not require Exchange room-resource mailboxes. If QNH later gives a TaskHub room an Exchange resource mailbox, a future enhancement may map that room as a `resource` attendee while TaskHub remains authoritative for room business rules.

### Zoom Meeting

The Organizer still owns the Outlook event. The event is not converted to Teams. The TaskHub Zoom join URL is written as the external online location/link.

## External Outlook edits

TaskHub does not automatically import an Outlook schedule/location/participant edit.

Later reconciliation compares only TaskHub-controlled fields:

- subject/title;
- approved start and end;
- TaskHub room/location;
- attendee membership;
- Zoom URL;
- TaskHub-managed description/link section.

Outlook-generated attendee response changes, reminders, response timestamps and other provider metadata do not count as drift.

Real drift becomes `OUTLOOK_CHANGED` and exposes:

- View differences;
- Restore Outlook from TaskHub.

A later approved TaskHub change always wins and may restore the Outlook event automatically.

Manual Outlook deletion becomes `OUTLOOK_DELETED` with a later Recreate in Outlook action.

## Sync statuses

The persistent state model is:

- `NOT_SYNCED`
- `SYNCING`
- `IN_SYNC`
- `SYNCED_WITH_WARNINGS`
- `OUTLOOK_CHANGED`
- `OUTLOOK_DELETED`
- `SYNC_FAILED`

## Asynchronous queue and idempotency

Graph I/O must not occur inside a Meeting SQL transaction.

Migration 047 creates a durable job/history table for:

- `CREATE`
- `UPDATE`
- `CANCEL`
- `RESTORE`
- `RECREATE`

Jobs store trusted IDs/revision references rather than full Meeting payloads. The worker will rebuild current authorized Meeting content at processing time.

Each Meeting mapping has a stable `create_transaction_id`. Phase 2 will send it as Microsoft Graph `event.transactionId` for create retries. Microsoft documents `transactionId` as a client identifier that helps avoid redundant event POSTs after uncertain retries.

The mapping also stores the Graph event ID/change key and synchronized/observed projection hashes needed for later drift detection.

## Polling

The approved first reconciliation mechanism is outbound polling.

Polling does not require a public TaskHub endpoint:

```text
Internal TaskHub backend
        -> HTTPS outbound
        -> Microsoft Graph
```

Default planned poll interval is three minutes and is configurable with `OUTLOOK_SYNC_POLL_INTERVAL_MINUTES`.

A webhook/public callback remains a possible later optimization, not a Phase 1 requirement.

## Authentication

TaskHub uses Microsoft Entra app-only/client-credentials authentication.

The Organizer's email identifies the target mailbox; it does not authenticate TaskHub.

Phase 1 supports client-secret token acquisition behind the `MicrosoftGraphTokenProvider` interface. Calendar business code will depend on that interface rather than on client-secret details, allowing a later certificate implementation without rewriting Meeting synchronization.

The integration is disabled by default:

```dotenv
OUTLOOK_CALENDAR_SYNC_ENABLED=false
```

When disabled, Microsoft credentials may remain blank and no Graph calls are made.

When enabled, the current foundation requires:

```dotenv
MS_GRAPH_TENANT_ID=...
MS_GRAPH_CLIENT_ID=...
MS_GRAPH_CLIENT_SECRET=...
```

For production hardening, certificate/federated authentication is preferred over a long-lived shared client secret.

## Environment foundation

```dotenv
OUTLOOK_CALENDAR_SYNC_ENABLED=false
MS_GRAPH_TENANT_ID=
MS_GRAPH_CLIENT_ID=
MS_GRAPH_CLIENT_SECRET=

OUTLOOK_SYNC_WORKER_INTERVAL_MS=30000
OUTLOOK_SYNC_POLL_INTERVAL_MINUTES=3
OUTLOOK_GRAPH_REQUEST_TIMEOUT_MS=30000
OUTLOOK_SYNC_MAX_ATTEMPTS=5
OUTLOOK_SYNC_PROCESSING_TIMEOUT_MINUTES=10
```

Phase 2 wires the worker into `server.ts`. When the flag is false the worker is a no-op and Microsoft credentials may remain blank.

## Database migration

Apply only:

```text
server/database/migrations/047_add_meeting_outlook_sync_foundation.sql
```

after migration 046.

The migration creates:

- `TM_meeting_outlook_sync_config`
- `TM_meeting_outlook_sync`
- `TM_meeting_outlook_sync_jobs`

`activated_at_utc` deliberately starts `NULL`. Phase 2 will atomically establish the activation cutoff on the first enabled worker run, preventing an unexpected historical Meeting synchronization flood.

The optional read-only diagnostic is:

```text
server/database/setup/verify_meeting_outlook_sync.sql
```

## Development ZIP status

### Phase 2 — implemented

- lifecycle enqueue after approved create/reschedule/cancel;
- mailbox targeting through the Organizer's Portal email and Graph calendar operation;
- Room/Zoom payload mapping;
- attendee email projection and missing-email warnings;
- create/update/cancel worker;
- retries/lease recovery;
- UI status and Retry/Open in Outlook.

### Phase 3 — next

- polling/reconciliation;
- `OUTLOOK_CHANGED` differences;
- Restore Outlook from TaskHub;
- `OUTLOOK_DELETED` and Recreate;
- false-drift protection for attendee responses;
- final hardening and acceptance tests.

No Outlook integration should be released to production until all agreed phases are complete and real QNH Microsoft 365 acceptance testing passes.
