USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. Validate prerequisites
       ============================================================ */
    IF OBJECT_ID(N'dbo.TM_meeting_attendees', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_activity', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR OBJECT_ID(N'dbo.users', N'U') IS NULL
    BEGIN
        THROW 54301,
              'Required TaskHub Meeting tables are missing. Apply the earlier Meeting migrations before migration 043.',
              1;
    END;

    /* ============================================================
       2. Add attendance status
       ============================================================ */
    IF COL_LENGTH(
        N'dbo.TM_meeting_attendees',
        N'attendance_status'
    ) IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_attendees
                ADD attendance_status VARCHAR(20) NOT NULL
                    CONSTRAINT DF_TM_meeting_attendees_attendance_status
                    DEFAULT (''NOT_MARKED'') WITH VALUES;
        ';
    END;

    /* ============================================================
       3. Add attendance audit columns
       ============================================================ */
    IF COL_LENGTH(
        N'dbo.TM_meeting_attendees',
        N'attendance_marked_by_user_id'
    ) IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_attendees
                ADD attendance_marked_by_user_id INT NULL;
        ';
    END;

    IF COL_LENGTH(
        N'dbo.TM_meeting_attendees',
        N'attendance_marked_at_utc'
    ) IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_attendees
                ADD attendance_marked_at_utc DATETIME2(3) NULL;
        ';
    END;

    /* ============================================================
       4. Enforce valid attendance statuses
       ============================================================ */
    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_attendees')
          AND name = N'CK_TM_meeting_attendees_attendance_status'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_attendees
                DROP CONSTRAINT CK_TM_meeting_attendees_attendance_status;
        ';
    END;

    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_attendees WITH CHECK
            ADD CONSTRAINT CK_TM_meeting_attendees_attendance_status
            CHECK (
                attendance_status IN (
                    ''NOT_MARKED'',
                    ''ATTENDED'',
                    ''ABSENT''
                )
            );
    ';

    /* ============================================================
       5. Enforce audit metadata consistency
       ============================================================ */
    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_attendees')
          AND name = N'CK_TM_meeting_attendees_attendance_audit'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_attendees
                DROP CONSTRAINT CK_TM_meeting_attendees_attendance_audit;
        ';
    END;

    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_attendees WITH CHECK
            ADD CONSTRAINT CK_TM_meeting_attendees_attendance_audit
            CHECK (
                (
                    attendance_marked_by_user_id IS NULL
                    AND attendance_marked_at_utc IS NULL
                )
                OR
                (
                    attendance_marked_by_user_id IS NOT NULL
                    AND attendance_marked_at_utc IS NOT NULL
                )
            );
    ';

    /* ============================================================
       6. Attendance actor foreign key
       ============================================================ */
    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_attendees')
          AND name = N'FK_TM_meeting_attendees_attendance_marked_by'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_attendees WITH CHECK
                ADD CONSTRAINT FK_TM_meeting_attendees_attendance_marked_by
                    FOREIGN KEY (attendance_marked_by_user_id)
                    REFERENCES dbo.TM_user_access (portal_user_id);
        ';
    END;

    /* ============================================================
       7. Enable and validate attendance constraints
       ============================================================ */
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_attendees WITH CHECK
            CHECK CONSTRAINT CK_TM_meeting_attendees_attendance_status;

        ALTER TABLE dbo.TM_meeting_attendees WITH CHECK
            CHECK CONSTRAINT CK_TM_meeting_attendees_attendance_audit;

        ALTER TABLE dbo.TM_meeting_attendees WITH CHECK
            CHECK CONSTRAINT FK_TM_meeting_attendees_attendance_marked_by;
    ';

    COMMIT TRANSACTION;

    PRINT 'Meeting attendance migration 043 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;
GO