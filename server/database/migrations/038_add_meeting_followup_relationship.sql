USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. Prerequisites / duplicate protection
       ============================================================ */
    IF OBJECT_ID(N'dbo.TM_meetings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_decisions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_followup_notes', N'U') IS NULL
       OR COL_LENGTH(N'dbo.TM_meetings', N'current_revision_id') IS NULL
    BEGIN
        THROW 53801,
              'TaskHub migrations through Meeting Follow-up Phase 2 migration 037 are required before Phase 3.',
              1;
    END;

    IF COL_LENGTH(N'dbo.TM_meetings', N'follow_up_of_meeting_id') IS NOT NULL
    BEGIN
        THROW 53802,
              'Meeting Follow-up Phase 3 relationship already exists. Migration was not applied.',
              1;
    END;


    /* ============================================================
       2. Add parent Meeting relationship
       ============================================================ */

    ALTER TABLE dbo.TM_meetings
        ADD follow_up_of_meeting_id BIGINT NULL;


    /* ============================================================
       3. Foreign key

       Dynamic SQL is required because the column was created earlier
       in this same SQL Server batch.
       ============================================================ */

    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meetings
            WITH CHECK
            ADD CONSTRAINT FK_TM_meetings_follow_up_of
                FOREIGN KEY (follow_up_of_meeting_id)
                REFERENCES dbo.TM_meetings (id);

        ALTER TABLE dbo.TM_meetings
            CHECK CONSTRAINT FK_TM_meetings_follow_up_of;
    ';


    /* ============================================================
       4. Prevent direct self-reference

       This prevents:
           Meeting A -> Meeting A

       Longer malformed cycles are additionally protected by the
       application traversal logic.
       ============================================================ */

    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meetings
            WITH CHECK
            ADD CONSTRAINT CK_TM_meetings_follow_up_not_self
                CHECK (
                    follow_up_of_meeting_id IS NULL
                    OR follow_up_of_meeting_id <> id
                );

        ALTER TABLE dbo.TM_meetings
            CHECK CONSTRAINT CK_TM_meetings_follow_up_not_self;
    ';


    /* ============================================================
       5. Supporting index
       ============================================================ */

    EXEC sys.sp_executesql N'
        CREATE INDEX IX_TM_meetings_follow_up_of
            ON dbo.TM_meetings (
                follow_up_of_meeting_id,
                id
            )
            WHERE follow_up_of_meeting_id IS NOT NULL;
    ';


    COMMIT TRANSACTION;

    PRINT 'Meeting Follow-up Phase 3 migration 038 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO