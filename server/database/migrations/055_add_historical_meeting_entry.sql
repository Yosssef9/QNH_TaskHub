/* QNH TaskHub historical meeting: permanent communication suppression marker. */
USE [QNHDB];
GO
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_meetings',N'U') IS NULL
    THROW 55501, 'TaskHub meetings foundation is missing.', 1;
  IF COL_LENGTH(N'dbo.TM_meetings',N'is_historical_entry') IS NULL
    ALTER TABLE dbo.TM_meetings
      ADD is_historical_entry BIT NOT NULL
        CONSTRAINT DF_TM_meetings_is_historical_entry DEFAULT (0) WITH VALUES;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
