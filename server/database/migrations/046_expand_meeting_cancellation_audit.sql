USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @lockResult INT;
    EXEC @lockResult = sys.sp_getapplock
        @Resource = N'TaskHub:Migration:046',
        @LockMode = 'Exclusive',
        @LockOwner = 'Transaction',
        @LockTimeout = 10000;

    IF @lockResult < 0
        THROW 54601, 'Could not acquire the Meeting cancellation migration lock.', 1;

    IF OBJECT_ID(N'dbo.TM_meetings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_activity', N'U') IS NULL
       OR COL_LENGTH(N'dbo.TM_meetings', N'cancelled_at_utc') IS NULL
    BEGIN
        THROW 54602,
              'Meeting foundation migrations are required before migration 046.',
              1;
    END;

    /* ============================================================
       1. Persist cancellation reason and actor.

       Dynamic SQL is intentional because SQL Server compiles the
       outer batch before newly-added columns exist.
       ============================================================ */
    IF COL_LENGTH(N'dbo.TM_meetings', N'cancellation_reason') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meetings
                ADD cancellation_reason NVARCHAR(1000) NULL;
        ';
    END;

    IF COL_LENGTH(N'dbo.TM_meetings', N'cancelled_by_user_id') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meetings
                ADD cancelled_by_user_id INT NULL;
        ';
    END;

    /* ============================================================
       2. Backfill historical cancellations.

       Before migration 046 only the Organizer could cancel a Meeting,
       so organizer_user_id is the best available audit actor for
       historical rows. Their old reason was not persisted, therefore
       it receives an explicit legacy marker rather than fabricated
       business text.
       ============================================================ */
    EXEC sys.sp_executesql N'
        UPDATE meetingRow
        SET
            cancellation_reason = COALESCE(
                NULLIF(LTRIM(RTRIM(meetingRow.cancellation_reason)), N''''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(cancelActivity.changes_json, ''$.reason''))), N''''),
                N''Legacy cancellation (reason not recorded).''
            ),
            cancelled_by_user_id = COALESCE(
                meetingRow.cancelled_by_user_id,
                cancelActivity.actor_user_id,
                meetingRow.organizer_user_id
            )
        FROM dbo.TM_meetings AS meetingRow
        OUTER APPLY (
            SELECT TOP (1)
                activity.actor_user_id,
                activity.changes_json
            FROM dbo.TM_meeting_activity AS activity
            WHERE activity.meeting_id = meetingRow.id
              AND activity.activity_type = ''CANCELLED''
            ORDER BY activity.created_at_utc DESC, activity.id DESC
        ) AS cancelActivity
        WHERE meetingRow.status = ''CANCELLED'';

        UPDATE dbo.TM_meetings
        SET
            cancellation_reason = NULL,
            cancelled_by_user_id = NULL
        WHERE status <> ''CANCELLED''
          AND (cancellation_reason IS NOT NULL OR cancelled_by_user_id IS NOT NULL);
    ';

    /* ============================================================
       3. Actor foreign key.
       ============================================================ */
    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meetings')
          AND name = N'FK_TM_meetings_cancelled_by'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meetings WITH CHECK
                ADD CONSTRAINT FK_TM_meetings_cancelled_by
                    FOREIGN KEY (cancelled_by_user_id)
                    REFERENCES dbo.TM_user_access (portal_user_id);

            ALTER TABLE dbo.TM_meetings
                CHECK CONSTRAINT FK_TM_meetings_cancelled_by;
        ';
    END;

    /* ============================================================
       4. Replace the old cancellation-state constraint.

       New CANCELLED Meetings must always have:
       - cancellation timestamp
       - cancelling user
       - non-empty reason

       Non-cancelled Meetings must carry none of those fields.
       ============================================================ */
    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meetings')
          AND name = N'CK_TM_meetings_cancelled_state'
    )
    BEGIN
        ALTER TABLE dbo.TM_meetings
            DROP CONSTRAINT CK_TM_meetings_cancelled_state;
    END;

    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meetings WITH CHECK
            ADD CONSTRAINT CK_TM_meetings_cancelled_state CHECK (
                (
                    status = ''CANCELLED''
                    AND cancelled_at_utc IS NOT NULL
                    AND cancelled_by_user_id IS NOT NULL
                    AND cancellation_reason IS NOT NULL
                    AND LEN(LTRIM(RTRIM(cancellation_reason))) > 0
                )
                OR
                (
                    status <> ''CANCELLED''
                    AND cancelled_at_utc IS NULL
                    AND cancelled_by_user_id IS NULL
                    AND cancellation_reason IS NULL
                )
            );

        ALTER TABLE dbo.TM_meetings
            CHECK CONSTRAINT CK_TM_meetings_cancelled_state;
    ';

    COMMIT TRANSACTION;

    PRINT 'Meeting cancellation audit migration 046 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
