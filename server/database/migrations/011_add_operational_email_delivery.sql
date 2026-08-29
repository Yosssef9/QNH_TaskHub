USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;


    /* ============================================================
       1. Verify previous email migrations
       ============================================================ */

    IF OBJECT_ID(N'dbo.TM_notifications', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_email_outbox', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_email_preferences', N'U') IS NULL
    BEGIN
        THROW 51101,
              'TaskHub email migrations 008-010 must be applied first.',
              1;
    END;


    /* ============================================================
       2. Prevent migration from being applied twice
       ============================================================ */

    IF COL_LENGTH(
        N'dbo.TM_notifications',
        N'email_processed_at_utc'
    ) IS NOT NULL
    BEGIN
        THROW 51102,
              'Operational email delivery migration already exists. Migration was not applied.',
              1;
    END;


    /* ============================================================
       3. Add email processing marker

       Existing notification rows predate Phase 3 and must not
       suddenly generate historical emails when operational email
       delivery becomes active.
       ============================================================ */

    ALTER TABLE dbo.TM_notifications
        ADD email_processed_at_utc DATETIME2(3) NULL;


    /* ============================================================
       IMPORTANT

       Statements referencing the newly-created column must be
       compiled AFTER ALTER TABLE has executed.

       sp_executesql provides a separate compilation scope.
       ============================================================ */


    /* ============================================================
       4. Mark all existing notifications as already considered

       Only notifications created AFTER this migration will initially
       have email_processed_at_utc = NULL and be eligible for email.
       ============================================================ */

    EXEC sys.sp_executesql N'
        UPDATE dbo.TM_notifications
        SET email_processed_at_utc = SYSUTCDATETIME()
        WHERE email_processed_at_utc IS NULL;
    ';


    /* ============================================================
       5. Pending operational-email lookup index
       ============================================================ */

    EXEC sys.sp_executesql N'
        CREATE INDEX IX_TM_notifications_email_pending
            ON dbo.TM_notifications (id)
            INCLUDE (
                owner_user_id,
                notification_type,
                dedupe_key,
                subject_title,
                context_title,
                task_id,
                list_id,
                cycle_id,
                kpi_instance_id,
                event_date,
                actual_value,
                target_value,
                measurement_unit
            )
            WHERE email_processed_at_utc IS NULL;
    ';


    /* ============================================================
       6. Extend email outbox status

       A queued email can become invalid before delivery when:
       - email notifications are disabled;
       - the event preference is disabled;
       - the destination is removed/invalid;
       - the underlying event is no longer applicable.

       Such messages are preserved as CANCELED instead of SENT.
       ============================================================ */

    ALTER TABLE dbo.TM_email_outbox
        DROP CONSTRAINT CK_TM_email_outbox_status;


    ALTER TABLE dbo.TM_email_outbox
        ADD CONSTRAINT CK_TM_email_outbox_status
        CHECK (
            status IN (
                'PENDING',
                'PROCESSING',
                'SENT',
                'FAILED',
                'CANCELED'
            )
        );


    /* ============================================================
       7. Commit
       ============================================================ */

    COMMIT TRANSACTION;

END TRY
BEGIN CATCH

    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;

END CATCH;
GO