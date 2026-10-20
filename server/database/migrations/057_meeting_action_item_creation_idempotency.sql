-- One stable client request ID per Meeting Action Item creation.
-- Apply manually after taking a backup; this does not change historical Action Items.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_meeting_action_items', N'U') IS NULL
    THROW 55701, 'Migration 035 is required first.', 1;
  IF COL_LENGTH(N'dbo.TM_meeting_action_items', N'creation_request_id') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.TM_meeting_action_items ADD creation_request_id UNIQUEIDENTIFIER NULL;';
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TM_meeting_action_items')
    AND name=N'UX_TM_meeting_action_items_creation_request')
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_TM_meeting_action_items_creation_request ON dbo.TM_meeting_action_items(meeting_id, creation_request_id) WHERE creation_request_id IS NOT NULL;';
  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
