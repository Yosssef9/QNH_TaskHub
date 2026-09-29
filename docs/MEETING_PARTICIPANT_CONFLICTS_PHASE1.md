# Meeting Participant Schedule Conflicts — Phase 1

## Scope

Phase 1 adds advisory participant schedule-conflict detection to TaskHub Meeting scheduling. It does not change the existing hard room-availability, room-capacity, approval, permission, or lifecycle rules.

A participant conflict is a scheduling note only. A user may remain selected and a Meeting or Meeting Series may still be requested/scheduled when one or more participants have conflicts.

Email conflict warnings are handled separately by Phase 2. The scheduling UI may show permission-aware Meeting details, while email warnings remain recipient-specific and time-only.

## Conflict rule

A selected participant is considered conflicted when the participant is an attendee of another Meeting that:

- is currently `SCHEDULED`;
- uses its current approved revision;
- overlaps the candidate Meeting using `existing.start < candidate.end AND existing.end > candidate.start`.

Adjacent Meetings where one ends exactly when the next starts are not conflicts. Pending requests, pending reschedule proposals, rejected Meetings and cancelled Meetings are not conflicts. Reschedule checks exclude the Meeting currently being edited.

The attendee table remains the participation source of truth. An Organizer is included only when that Organizer is actually attending.

## Privacy

The participant-availability API always returns the selected participant identity, conflict count, and up to three overlapping time windows. Conflict Meeting metadata is enriched server-side only when the authenticated viewer already has equivalent Meeting visibility:

- `FULL`: the viewer is that Meeting's Organizer or attendee, or is a Meeting Coordinator. The response may include the Meeting title, Organizer, Room/Zoom location metadata, and Meeting ID so the UI can open Meeting Details.
- `PREVIEW`: an unrelated Room Meeting may expose only the same limited schedule preview already available to Room Meeting Organizers. The Meeting ID remains hidden and the UI does not link to Meeting Details.
- hidden: if neither rule applies, the overlap remains a generic `Another Meeting` time window with no title, Organizer, room, Meeting ID, or Zoom link.

Zoom join URLs, descriptions, agenda content, attendees and other protected Meeting content are never added to the participant-conflict payload. Authorization is derived from the authenticated server-side access context rather than client-provided flags.

## API

Authenticated Meeting schedulers may call:

```http
POST /api/meetings/participant-availability
```

Example request:

```json
{
  "startAtUtc": "2026-09-28T07:00:00.000Z",
  "endAtUtc": "2026-09-28T08:00:00.000Z",
  "participantUserIds": [101, 202],
  "excludeMeetingId": 127
}
```

`excludeMeetingId` is optional and is used by rescheduling flows to avoid reporting the Meeting against itself.

## UI behavior

- Create Meeting checks the selected attendees and an attending Organizer whenever a valid date/time is available.
- The participant picker marks selected conflicted users with an amber warning.
- A compact warning panel lists conflicted participants and overlap times. When the current viewer is authorized, it also shows the conflicting Meeting title, Organizer and location; full viewers can open Meeting Details directly. Otherwise it stays generic. Failure to perform the advisory check is also shown, but does not disable scheduling.
- Organizer reschedule and Coordinator scheduling/rescheduling use the same participant-conflict engine and exclude the current Meeting.
- Meeting Series preview computes participant conflicts for each occurrence. Conflict metadata is separate from blocking validation, so `canCreate` is unchanged by participant conflicts.
- Series list/calendar/bulk scheduling surfaces conflict warnings, and the per-occurrence editor recalculates conflicts live when its date, time, Organizer attendance, or attendee list changes.

## Database and deployment

No migration is required. The query uses the existing Meeting/approved-revision/attendee schema and the existing attendee-user index from the Meeting foundation migration.

Deploy both backend and frontend changes. Phase 2 continues to reuse the same conflict engine for recipient-specific invitation/reschedule/Series email warnings and re-evaluates conflicts at email send time without exposing the conflicting Meeting metadata in email.

