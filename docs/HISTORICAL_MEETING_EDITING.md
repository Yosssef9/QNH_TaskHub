# Historical Meeting Editing and Relationship Protection

## Purpose

The organizer of a retrospectively recorded Meeting can edit its original content without changing its historical classification, recreating it, or losing related work. Existing meetings not flagged `is_historical_entry` do not gain this editing workflow.

## Entry point and UI

The Meeting Details page exposes **Edit Historical Meeting** for the original organizer on a `SCHEDULED` historical Meeting. The same `MeetingEditorDialog` used to create a Meeting opens in edit mode, preloaded with its title, description, dates, room/Zoom link, participants, and persisted Agenda IDs. The editor prevents removing participants and Agenda topics that the dependency preflight identifies as protected. The standalone historical Agenda editor honors the same topic locks. The editor also warns before discarding unsaved changes.

`GET /api/meetings/:meetingId/historical/dependencies` returns protected participants (with dependency reason codes) and Agenda IDs. `PUT /api/meetings/:meetingId/historical` persists the submitted edit. Both are restricted by the backend to the original organizer; UI visibility is not authorization.

## Invariants

- A historical Meeting can never be reclassified as a prospective Meeting. The validated end time must be in the past at **save time**, even if the editor was opened earlier.
- Existing Meeting ID, attachments, decisions, action items, related meetings, and original historical revision records are retained.
- An attendee with task ownership/assignments, Meeting-created work, an Agenda role, decision authorship, uploaded attachments, recorded attendance, or follow-up note authorship cannot be removed through this edit workflow. This includes completed work.
- An Agenda item linked by an Action Item or Decision cannot be deleted. Existing Agenda IDs survive updates and reorderings.
- Edit operations use one SQL transaction. Meeting rowversion and revision rowversion are checked, and the parent Meeting row is locked for writes. Meeting task/decision/attendance/attachment writers serialize on that parent to avoid concurrent relationship creation during a removal check.
- A changed date/time/location creates a new **approved** revision. Existing revisions are not overwritten, and the Meeting remains marked historical. Activity records old/new details, participant additions/removals, and Agenda snapshots.
- Historical edits do **not** trigger normal request/approval/reschedule notifications, participant invitations, or Outlook calendar work.
- **Follow-up tasks are different from Meeting lifecycle events.** Historical classification does not suppress notifications for Meeting Action Item assignment/reassignment/completion, general or collaborative task/subtask assignment, due-date changes, completion/reopening, or the normal task deadline reminders. Task events use the same in-app and preference-aware operational email pipeline, current-assignment validation, and deduplication as tasks from regular Meetings. Meeting invitations, schedule/start reminders, and automatic historical Meeting report emails remain suppressed.
- This change applies to **new task events on both existing and newly created** historical Meetings. Previously suppressed events are not retroactively generated or emailed, to avoid mass notifications about old actions. Recipients must still be eligible under the existing task-access and email preference rules.

## Database migration

Migration `058_protect_historical_meeting_edit_dependencies.sql` changes Agenda Action Item and Decision foreign keys from `ON DELETE SET NULL` to the default `NO ACTION` behavior. It makes silent link loss impossible even if a future code path tries to delete a referenced Agenda topic. It does not delete or backfill any existing Meeting data.

Apply the migration separately and deliberately after checking current database state. **Do not deploy the updated backend without applying migration 058**, because the edited Agenda behavior assumes the new FK protection. The migration has not been executed in this patch delivery.

## Limitations and test priorities

The new editor can add files and preserves existing files, but existing file management continues in the dedicated Meeting Files panel. The edit operation retains existing follow-up relationships; it does not redesign how they are created. Historical Meeting editing does not implement standalone participant/task reassignment; protected participants remain until their dependent work is resolved through the appropriate existing domain workflow.

Verify the historical editor with meetings having completed and collaborative Action Items, absent/attended participants, linked Agenda decisions, deleted/archived rooms, Zoom meetings, and concurrent writes. Verify both Arabic/English modes. The source-level ZIP validation does not replace integration tests against SQL Server or browser end-to-end testing.
