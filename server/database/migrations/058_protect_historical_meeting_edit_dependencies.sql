USE [QNHDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_meeting_action_items', N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_meeting_decisions', N'U') IS NULL
     OR OBJECT_ID(N'dbo.TM_meeting_attendees', N'U') IS NULL
  BEGIN
    THROW 55801, 'Historical Meeting dependency prerequisites are missing.', 1;
  END;

  -- Deleting Agenda topics must NEVER silently unlink existing Tasks or Decisions.
  -- Existing referenced rows remain unchanged; only the FK deletion policy changes.
  IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_TM_meeting_action_items_agenda'
             AND parent_object_id = OBJECT_ID(N'dbo.TM_meeting_action_items'))
    ALTER TABLE dbo.TM_meeting_action_items DROP CONSTRAINT FK_TM_meeting_action_items_agenda;
  ALTER TABLE dbo.TM_meeting_action_items WITH CHECK
    ADD CONSTRAINT FK_TM_meeting_action_items_agenda FOREIGN KEY (agenda_item_id)
      REFERENCES dbo.TM_meeting_agenda_items (id);

  IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_TM_meeting_decisions_agenda'
             AND parent_object_id = OBJECT_ID(N'dbo.TM_meeting_decisions'))
    ALTER TABLE dbo.TM_meeting_decisions DROP CONSTRAINT FK_TM_meeting_decisions_agenda;
  ALTER TABLE dbo.TM_meeting_decisions WITH CHECK
    ADD CONSTRAINT FK_TM_meeting_decisions_agenda FOREIGN KEY (agenda_item_id)
      REFERENCES dbo.TM_meeting_agenda_items (id);

  COMMIT TRANSACTION;
  PRINT 'Historical Meeting dependency protections (058) applied.';
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
