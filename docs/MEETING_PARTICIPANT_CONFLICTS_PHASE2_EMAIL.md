# Meeting Participant Schedule Conflicts — Phase 2 Email Warnings

## Scope

Phase 2 extends the Phase 1 participant schedule-conflict engine into Meeting email delivery. It does not change Meeting scheduling rules: a participant conflict is advisory only and never blocks creation, approval, rescheduling, or Series creation.

The warning is recipient-specific and privacy-safe. It tells the recipient that another approved scheduled Meeting overlaps the Meeting in the email and shows only the overlapping time window(s). It never exposes the other Meeting's title, Organizer, room, description, agenda, attendees, or other private content.

## Emails covered

- `MEETING_INVITED`: an attendee receives a warning when another approved scheduled Meeting overlaps the invitation.
- `MEETING_RESCHEDULED`: an attendee receives a warning when the newly approved schedule overlaps another Meeting. An Organizer who is not actually attending the Meeting does not receive an attendee-conflict warning.
- `MEETING_SERIES_SCHEDULED`: each occurrence in the recipient's grouped Series email is marked independently when it conflicts. Only occurrences the recipient actually attends are evaluated; a non-attending Series Organizer is not treated as a participant merely because they created the Series.

Cancellation, rejection, Action Item, reminder, and post-Meeting report emails are unchanged.

## Source of truth

Conflict calculation reuses the same scheduling data and overlap semantics as Phase 1:

- only `SCHEDULED` Meetings;
- only the current approved revision;
- strict overlap: `existing.start < target.end` and `existing.end > target.start`;
- back-to-back Meetings are not conflicts;
- the Meeting represented by the email is excluded from its own conflict check;
- pending requests, pending reschedules, rejected Meetings and cancelled Meetings do not create participant conflicts.

For grouped Series email, the backend performs a bounded batched conflict lookup for all attended occurrences instead of issuing one database query per occurrence. Up to three conflicting time windows are included per occurrence while the total conflict count is retained.

## Send-time correctness

Queued operational email payloads are not trusted as a permanent conflict snapshot. Immediately before transport delivery, TaskHub:

1. revalidates the recipient's current email delivery settings and current Meeting/Series eligibility;
2. rebuilds the Meeting or Series payload from current approved schedule data;
3. recalculates the recipient's participant conflicts;
4. renders the email from that refreshed payload.

This means a Meeting created, cancelled, or rescheduled after the email was queued can change the warning before the message is actually sent. Existing queued Meeting invitation/reschedule/Series emails also gain this behavior after deployment because the send-time rebuild uses their existing Meeting/Series identifiers.

## Email presentation

Conflict warnings use an amber informational panel in both HTML and plain-text email. The panel includes:

- `Schedule conflict` / `تعارض في الموعد`;
- a short explanation that another scheduled Meeting overlaps;
- up to three overlapping date/time windows per affected Meeting occurrence;
- a note that the warning is informational only and does not cancel or change the Meeting.

Grouped Series emails additionally mark affected occurrence rows with a warning indicator and include a conflict summary below the Series schedule.

## Database / deployment

No SQL migration is required. No new email preference is introduced. Existing preferences for Meeting invitation, Meeting reschedule and Meeting Series emails continue to control delivery.

Deploy the updated server and restart the TaskHub backend/email worker through the normal production process. The Phase 1 participant-conflict patch must already be present because Phase 2 reuses its scheduling conflict engine.

## Acceptance checks

1. Schedule a Meeting for an attendee who is already attending another approved Meeting during the same time. The attendee's invitation email contains an amber conflict warning and the overlapping time only.
2. Schedule for an attendee with no overlap. No conflict warning appears.
3. Use back-to-back times. No warning appears.
4. Queue an invitation while a conflict exists, cancel/move the other Meeting before the worker sends, then deliver the email. The final email does not show the stale conflict.
5. Queue an invitation without a conflict, create another overlapping Meeting before delivery, then deliver. The final email shows the new conflict.
6. Reschedule a Meeting into a participant's busy time. The participant's reschedule email warns them. A non-attending Organizer does not receive a participant-conflict warning.
7. Create a Series where only some occurrences conflict. The grouped recipient email marks only those occurrences.
8. Verify Arabic and English HTML/plain-text output. No conflicting Meeting title, room, Organizer, or other private content is exposed.
