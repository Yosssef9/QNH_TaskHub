USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_meeting_series', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_series_members', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_attachments', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_notifications', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_email_preferences', N'U') IS NULL
    BEGIN
        THROW 54101,
              'Meeting Series migration 040 plus Meeting workspace/notification migrations must be applied first.',
              1;
    END;


    /*==============================================================
      1. Shared protected Meeting attachment binaries
    ==============================================================*/

    IF EXISTS (
        SELECT 1
        FROM sys.key_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_attachments')
          AND name = N'UQ_TM_meeting_attachments_storage_key'
    )
    BEGIN
        ALTER TABLE dbo.TM_meeting_attachments
            DROP CONSTRAINT UQ_TM_meeting_attachments_storage_key;
    END;


    IF COL_LENGTH(
        N'dbo.TM_meeting_attachments',
        N'series_attachment_request_id'
    ) IS NULL
    BEGIN
        ALTER TABLE dbo.TM_meeting_attachments
            ADD series_attachment_request_id UNIQUEIDENTIFIER NULL;
    END;


    IF COL_LENGTH(
        N'dbo.TM_meeting_attachments',
        N'series_attachment_scope'
    ) IS NULL
    BEGIN
        ALTER TABLE dbo.TM_meeting_attachments
            ADD series_attachment_scope VARCHAR(20) NULL;
    END;


    IF COL_LENGTH(
        N'dbo.TM_meeting_attachments',
        N'series_occurrence_key'
    ) IS NULL
    BEGIN
        ALTER TABLE dbo.TM_meeting_attachments
            ADD series_occurrence_key NVARCHAR(120) NULL;
    END;


    /*
        IMPORTANT:

        SQL Server compiles the whole batch before executing the
        ALTER TABLE statements above.

        Therefore statements referencing newly-added columns must
        use dynamic SQL.
    */


    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id =
              OBJECT_ID(N'dbo.TM_meeting_attachments')
          AND name =
              N'CK_TM_meeting_attachments_series_scope'
    )
    BEGIN
        ALTER TABLE dbo.TM_meeting_attachments
            DROP CONSTRAINT
                CK_TM_meeting_attachments_series_scope;
    END;


    EXEC sys.sp_executesql N'

        ALTER TABLE dbo.TM_meeting_attachments
        WITH CHECK
        ADD CONSTRAINT
            CK_TM_meeting_attachments_series_scope

        CHECK (

            (
                series_attachment_request_id IS NULL
                AND series_attachment_scope IS NULL
                AND series_occurrence_key IS NULL
            )

            OR

            (
                series_attachment_request_id IS NOT NULL

                AND
                (
                    (
                        series_attachment_scope = ''COMMON''
                        AND series_occurrence_key IS NULL
                    )

                    OR

                    (
                        series_attachment_scope = ''OCCURRENCE''
                        AND series_occurrence_key IS NOT NULL
                    )
                )
            )
        );


        ALTER TABLE dbo.TM_meeting_attachments
            CHECK CONSTRAINT
                CK_TM_meeting_attachments_series_scope;

    ';


    /*==============================================================
      Index for shared physical storage
    ==============================================================*/

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id =
              OBJECT_ID(N'dbo.TM_meeting_attachments')
          AND name =
              N'IX_TM_meeting_attachments_storage_active'
    )
    BEGIN

        EXEC sys.sp_executesql N'

            CREATE INDEX
                IX_TM_meeting_attachments_storage_active

            ON dbo.TM_meeting_attachments (
                storage_key,
                is_active
            )

            INCLUDE (
                id,
                meeting_id,
                series_attachment_request_id,
                series_attachment_scope,
                series_occurrence_key
            );

        ';

    END;


    /*==============================================================
      Prevent duplicate attachment request for the same Meeting
    ==============================================================*/

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id =
              OBJECT_ID(N'dbo.TM_meeting_attachments')
          AND name =
              N'UX_TM_meeting_attachments_meeting_series_request'
    )
    BEGIN

        EXEC sys.sp_executesql N'

            CREATE UNIQUE INDEX
                UX_TM_meeting_attachments_meeting_series_request

            ON dbo.TM_meeting_attachments (
                meeting_id,
                series_attachment_request_id
            )

            WHERE series_attachment_request_id IS NOT NULL;

        ';

    END;



    /*==============================================================
      2. Series-aware notifications
    ==============================================================*/

    IF COL_LENGTH(
        N'dbo.TM_notifications',
        N'meeting_series_id'
    ) IS NULL
    BEGIN

        ALTER TABLE dbo.TM_notifications
            ADD meeting_series_id BIGINT NULL;

    END;


    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id =
              OBJECT_ID(N'dbo.TM_notifications')
          AND name =
              N'FK_TM_notifications_meeting_series'
    )
    BEGIN

        EXEC sys.sp_executesql N'

            ALTER TABLE dbo.TM_notifications
            WITH CHECK
            ADD CONSTRAINT
                FK_TM_notifications_meeting_series

            FOREIGN KEY (
                meeting_series_id
            )

            REFERENCES dbo.TM_meeting_series (
                id
            );


            ALTER TABLE dbo.TM_notifications
                CHECK CONSTRAINT
                    FK_TM_notifications_meeting_series;

        ';

    END;



    /*==============================================================
      3. Notification types
    ==============================================================*/

    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id =
              OBJECT_ID(N'dbo.TM_notifications')
          AND name =
              N'CK_TM_notifications_type'
    )
    BEGIN

        ALTER TABLE dbo.TM_notifications
            DROP CONSTRAINT
                CK_TM_notifications_type;

    END;


    ALTER TABLE dbo.TM_notifications
        ADD CONSTRAINT CK_TM_notifications_type

        CHECK (

            notification_type IN (

                'TASK_OVERDUE',

                'TASK_DUE_TODAY',

                'HIGH_PRIORITY_TASK_DUE_TOMORROW',

                'CURRENT_CYCLE_ENDING_SOON',

                'CURRENT_CYCLE_PAST_END',

                'KPI_BELOW_TARGET',

                'KPI_MEASUREMENT_DUE',

                'CONTRACT_EXPIRATION_REMINDER',

                'CONTRACT_NOTICE_DEADLINE_REMINDER',

                'MEETING_REQUEST_SUBMITTED',

                'MEETING_REQUEST_UPDATED',

                'MEETING_APPROVED',

                'MEETING_REJECTED',

                'MEETING_INVITED',

                'MEETING_RESCHEDULED',

                'MEETING_RESCHEDULE_REQUEST_CANCELLED',

                'MEETING_CANCELLED',

                'MEETING_START_REMINDER',

                'MEETING_ACTION_ITEM_ASSIGNED',

                'MEETING_ACTION_ITEM_COMPLETED',

                'MEETING_SERIES_SCHEDULED'

            )

        );



    /*==============================================================
      4. Email preference event
    ==============================================================*/

    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id =
              OBJECT_ID(N'dbo.TM_email_preferences')
          AND name =
              N'CK_TM_email_preferences_event'
    )
    BEGIN

        ALTER TABLE dbo.TM_email_preferences
            DROP CONSTRAINT
                CK_TM_email_preferences_event;

    END;


    /*
        Contract reminders and Meeting start reminders use their
        existing dedicated settings and are intentionally not
        included here.
    */

    ALTER TABLE dbo.TM_email_preferences
        ADD CONSTRAINT CK_TM_email_preferences_event

        CHECK (

            event_type IN (

                'TASK_OVERDUE',

                'TASK_DUE_TODAY',

                'HIGH_PRIORITY_TASK_DUE_TOMORROW',

                'CURRENT_CYCLE_ENDING_SOON',

                'CURRENT_CYCLE_PAST_END',

                'KPI_BELOW_TARGET',

                'KPI_MEASUREMENT_DUE',

                'MEETING_REQUEST_SUBMITTED',

                'MEETING_REQUEST_UPDATED',

                'MEETING_APPROVED',

                'MEETING_REJECTED',

                'MEETING_INVITED',

                'MEETING_RESCHEDULED',

                'MEETING_RESCHEDULE_REQUEST_CANCELLED',

                'MEETING_CANCELLED',

                'MEETING_SERIES_SCHEDULED'

            )

        );



    /*==============================================================
      Create default email preference for existing active users
    ==============================================================*/

    INSERT dbo.TM_email_preferences (
        owner_user_id,
        event_type,
        is_enabled
    )

    SELECT
        access.portal_user_id,
        'MEETING_SERIES_SCHEDULED',
        CAST(1 AS BIT)

    FROM dbo.TM_user_access AS access

    INNER JOIN dbo.users AS portal
        ON portal.USER_ID =
           access.portal_user_id

       AND portal.IS_ACTIVE = 1

    WHERE access.is_active = 1

      AND NOT EXISTS (

          SELECT 1

          FROM dbo.TM_email_preferences AS preference

          WHERE preference.owner_user_id =
                access.portal_user_id

            AND preference.event_type =
                'MEETING_SERIES_SCHEDULED'

      );



    /*==============================================================
      5. Series notification lookup index
    ==============================================================*/

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id =
              OBJECT_ID(N'dbo.TM_notifications')
          AND name =
              N'IX_TM_notifications_owner_series_created'
    )
    BEGIN

        EXEC sys.sp_executesql N'

            CREATE INDEX
                IX_TM_notifications_owner_series_created

            ON dbo.TM_notifications (

                owner_user_id,

                meeting_series_id,

                created_at_utc DESC,

                id DESC

            )

            INCLUDE (

                notification_type,

                dedupe_key,

                read_at_utc,

                email_processed_at_utc

            )

            WHERE meeting_series_id IS NOT NULL;

        ';

    END;



    COMMIT TRANSACTION;


    PRINT
        'Meeting Series Phase 5 attachments/notifications migration 041 completed successfully.';

END TRY

BEGIN CATCH

    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;

END CATCH;

GO