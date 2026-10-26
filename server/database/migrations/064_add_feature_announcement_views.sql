USE [QNHDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.TM_feature_announcement_views', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TM_feature_announcement_views (
      portal_user_id INT NOT NULL,
      feature_key VARCHAR(80) NOT NULL,
      seen_at_utc DATETIME2(3) NOT NULL
        CONSTRAINT DF_TM_feature_announcement_seen DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_TM_feature_announcement_views
        PRIMARY KEY CLUSTERED (portal_user_id, feature_key),
      CONSTRAINT FK_TM_feature_announcement_portal_user
        FOREIGN KEY (portal_user_id) REFERENCES dbo.users(USER_ID)
    );
  END;

  COMMIT TRANSACTION;
  PRINT 'Feature announcement acknowledgement storage is ready.';
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
