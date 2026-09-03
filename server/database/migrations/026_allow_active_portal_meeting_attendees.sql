USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- 1. Validate dependencies
    ------------------------------------------------------------
    IF OBJECT_ID(N'dbo.users', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_attendees', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_template_attendees', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_agenda_items', N'U') IS NULL
    BEGIN
        THROW 52601,
            'Meeting participant schema prerequisites are missing. Apply migrations through 025 first.',
            1;
    END;

    ------------------------------------------------------------
    -- 2. Validate existing references before changing FKs
    --
    -- Existing rows should already resolve because the old FKs
    -- referenced TM_user_access, whose identities originate from
    -- dbo.users. These checks make any unexpected data problem
    -- explicit before constraints are replaced.
    ------------------------------------------------------------
    IF EXISTS (
        SELECT 1
        FROM dbo.TM_meeting_attendees AS attendee
        LEFT JOIN dbo.users AS portal
            ON portal.USER_ID = attendee.attendee_user_id
        WHERE portal.USER_ID IS NULL
    )
    BEGIN
        THROW 52602,
            'TM_meeting_attendees contains attendee_user_id values that do not exist in dbo.users.',
            1;
    END;

    IF EXISTS (
        SELECT 1
        FROM dbo.TM_meeting_template_attendees AS attendee
        LEFT JOIN dbo.users AS portal
            ON portal.USER_ID = attendee.attendee_user_id
        WHERE portal.USER_ID IS NULL
    )
    BEGIN
        THROW 52603,
            'TM_meeting_template_attendees contains attendee_user_id values that do not exist in dbo.users.',
            1;
    END;

    IF EXISTS (
        SELECT 1
        FROM dbo.TM_meeting_agenda_items AS agenda
        LEFT JOIN dbo.users AS portal
            ON portal.USER_ID = agenda.presenter_user_id
        WHERE agenda.presenter_user_id IS NOT NULL
          AND portal.USER_ID IS NULL
    )
    BEGIN
        THROW 52604,
            'TM_meeting_agenda_items contains presenter_user_id values that do not exist in dbo.users.',
            1;
    END;

    ------------------------------------------------------------
    -- 3. Meeting attendee identity
    --
    -- attendee_user_id is a Portal identity, not a TaskHub-access
    -- grant. added_by_user_id remains tied to TM_user_access because
    -- the actor performing the mutation must be authenticated in
    -- TaskHub.
    ------------------------------------------------------------
    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_attendees')
          AND name = N'FK_TM_meeting_attendees_user'
    )
    BEGIN
        ALTER TABLE dbo.TM_meeting_attendees
            DROP CONSTRAINT FK_TM_meeting_attendees_user;
    END;

    ALTER TABLE dbo.TM_meeting_attendees
        WITH CHECK
        ADD CONSTRAINT FK_TM_meeting_attendees_user
            FOREIGN KEY (attendee_user_id)
            REFERENCES dbo.users (USER_ID);

    ALTER TABLE dbo.TM_meeting_attendees
        CHECK CONSTRAINT FK_TM_meeting_attendees_user;

    ------------------------------------------------------------
    -- 4. Meeting Template attendee identity
    ------------------------------------------------------------
    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_template_attendees')
          AND name = N'FK_TM_meeting_template_attendees_user'
    )
    BEGIN
        ALTER TABLE dbo.TM_meeting_template_attendees
            DROP CONSTRAINT FK_TM_meeting_template_attendees_user;
    END;

    ALTER TABLE dbo.TM_meeting_template_attendees
        WITH CHECK
        ADD CONSTRAINT FK_TM_meeting_template_attendees_user
            FOREIGN KEY (attendee_user_id)
            REFERENCES dbo.users (USER_ID);

    ALTER TABLE dbo.TM_meeting_template_attendees
        CHECK CONSTRAINT FK_TM_meeting_template_attendees_user;

    ------------------------------------------------------------
    -- 5. Agenda presenter identity
    --
    -- A presenter may be the Organizer or a selected attendee.
    -- Since selected attendees may now be active Portal users without
    -- TaskHub access, presenter_user_id must reference dbo.users too.
    -- created_by_user_id remains a TaskHub-authenticated actor.
    ------------------------------------------------------------
    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_agenda_items')
          AND name = N'FK_TM_meeting_agenda_items_presenter'
    )
    BEGIN
        ALTER TABLE dbo.TM_meeting_agenda_items
            DROP CONSTRAINT FK_TM_meeting_agenda_items_presenter;
    END;

    ALTER TABLE dbo.TM_meeting_agenda_items
        WITH CHECK
        ADD CONSTRAINT FK_TM_meeting_agenda_items_presenter
            FOREIGN KEY (presenter_user_id)
            REFERENCES dbo.users (USER_ID);

    ALTER TABLE dbo.TM_meeting_agenda_items
        CHECK CONSTRAINT FK_TM_meeting_agenda_items_presenter;

    COMMIT TRANSACTION;

    PRINT 'Meeting attendees now support active Portal users independently of TaskHub access.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
