# Meeting Participant Schedule Conflicts — Phase 1

## Scope

Phase 1 adds advisory participant schedule-conflict detection to TaskHub Meeting scheduling. It does not change the existing hard room-availability, room-capacity, approval, permission, or lifecycle rules.

A participant conflict is a scheduling note only. A user may remain selected and a Meeting or Meeting Series may still be requested/scheduled when one or more participants have conflicts.

Email conflict warnings are intentionally deferred to Phase 2.

## Conflict rule

A selected participant is considered conflicted when the participant is an attendee of another Meeting that:

- is currently `SCHEDULED`;
- uses its current approved revision;
- overlaps the candidate Meeting using `existing.start < candidate.end AND existing.end > candidate.start`.

Adjacent Meetings where one ends exactly when the next starts are not conflicts. Pending requests, pending reschedule proposals, rejected Meetings and cancelled Meetings are not conflicts. Reschedule checks exclude the Meeting currently being edited.

The attendee table remains the participation source of truth. An Organizer is included only when that Organizer is actually attending.

## Privacy

The participant-availability API does not return the conflicting Meeting title, room, Organizer, Meeting ID or other Meeting content. It returns the selected participant identity already relevant to the scheduling UI, a conflict count, and up to three overlapping time windows per conflicted participant.

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
- A compact warning panel lists conflicted participants and overlap times. Failure to perform the advisory check is also shown, but does not disable scheduling.
- Organizer reschedule and Coordinator scheduling/rescheduling use the same participant-conflict engine and exclude the current Meeting.
- Meeting Series preview computes participant conflicts for each occurrence. Conflict metadata is separate from blocking validation, so `canCreate` is unchanged by participant conflicts.
- Series list/calendar/bulk scheduling surfaces conflict warnings, and the per-occurrence editor recalculates conflicts live when its date, time, Organizer attendance, or attendee list changes.

## Database and deployment

No migration is required. The query uses the existing Meeting/approved-revision/attendee schema and the existing attendee-user index from the Meeting foundation migration.

Deploy both backend and frontend changes. Phase 2 will reuse this conflict engine for recipient-specific invitation/reschedule/Series email warnings and will re-evaluate conflicts at email send time.
