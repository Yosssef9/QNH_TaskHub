USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       Pre-checks
       ============================================================ */
    IF OBJECT_ID(N'dbo.TM_meeting_user_permissions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_revisions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_templates', N'U') IS NULL
    BEGIN
        THROW 54501,
              'Meeting foundation/workspace migrations are required before Zoom Meeting support can be added.',
              1;
    END;


    /* ============================================================
       1. Split Organizer permission into Room and Zoom capabilities

       OLD:
         MEETING_ORGANIZE

       NEW:
         MEETING_ORGANIZE_ROOM
         MEETING_ORGANIZE_ZOOM
         MEETING_COORDINATE

       Existing MEETING_ORGANIZE users become ROOM organizers only.
       Zoom permission is NOT granted automatically.
       ============================================================ */

    IF EXISTS
    (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_user_permissions')
          AND name = N'CK_TM_meeting_permissions_code'
    )
    BEGIN
        ALTER TABLE dbo.TM_meeting_user_permissions
            DROP CONSTRAINT CK_TM_meeting_permissions_code;
    END;


    INSERT INTO dbo.TM_meeting_user_permissions
    (
        portal_user_id,
        permission_code,
        is_active,
        granted_by_user_id,
        granted_at_utc,
        revoked_by_user_id,
        revoked_at_utc
    )
    SELECT
        legacy.portal_user_id,
        'MEETING_ORGANIZE_ROOM',
        legacy.is_active,
        legacy.granted_by_user_id,
        legacy.granted_at_utc,
        legacy.revoked_by_user_id,
        legacy.revoked_at_utc
    FROM dbo.TM_meeting_user_permissions AS legacy
    WHERE legacy.permission_code = 'MEETING_ORGANIZE'
      AND NOT EXISTS
      (
          SELECT 1
          FROM dbo.TM_meeting_user_permissions AS currentPermission
          WHERE currentPermission.portal_user_id = legacy.portal_user_id
            AND currentPermission.permission_code = 'MEETING_ORGANIZE_ROOM'
      );


    DELETE FROM dbo.TM_meeting_user_permissions
    WHERE permission_code = 'MEETING_ORGANIZE';


    ALTER TABLE dbo.TM_meeting_user_permissions
        ADD CONSTRAINT CK_TM_meeting_permissions_code
        CHECK
        (
            permission_code IN
            (
                'MEETING_ORGANIZE_ROOM',
                'MEETING_ORGANIZE_ZOOM',
                'MEETING_COORDINATE'
            )
        );


    /* ============================================================
       2. Meeting Revisions
          ROOM = physical Meeting Room
          ZOOM = online Zoom Meeting

       IMPORTANT:
       Dynamic SQL is intentionally used after ADD COLUMN because
       SQL Server compiles the outer batch before the new columns
       physically exist.
       ============================================================ */

    IF COL_LENGTH(N'dbo.TM_meeting_revisions', N'meeting_mode') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_revisions
            ADD meeting_mode VARCHAR(10) NULL;
        ';
    END;


    /* Existing Meetings are physical ROOM Meetings */
    EXEC sys.sp_executesql N'
        UPDATE dbo.TM_meeting_revisions
        SET meeting_mode = ''ROOM''
        WHERE meeting_mode IS NULL;
    ';


    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_revisions
        ALTER COLUMN meeting_mode VARCHAR(10) NOT NULL;
    ';


    /* Add default only if this column does not already have one */
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.default_constraints AS dc
        INNER JOIN sys.columns AS c
            ON c.object_id = dc.parent_object_id
           AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.TM_meeting_revisions')
          AND c.name = N'meeting_mode'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_revisions
            ADD CONSTRAINT DF_TM_meeting_revisions_meeting_mode
                DEFAULT (''ROOM'') FOR meeting_mode;
        ';
    END;


    IF COL_LENGTH(N'dbo.TM_meeting_revisions', N'online_join_url') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_revisions
            ADD online_join_url NVARCHAR(2048) NULL;
        ';
    END;


    /*
       Physical room is optional now because ZOOM Meetings do not
       reserve a room.
    */
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_revisions
        ALTER COLUMN room_id BIGINT NULL;
    ';


    /* Remove old/new copy if migration is being rerun */
    IF EXISTS
    (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_revisions')
          AND name = N'CK_TM_meeting_revisions_location'
    )
    BEGIN
        ALTER TABLE dbo.TM_meeting_revisions
            DROP CONSTRAINT CK_TM_meeting_revisions_location;
    END;


    IF EXISTS
    (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_revisions')
          AND name = N'CK_TM_meeting_revisions_mode'
    )
    BEGIN
        ALTER TABLE dbo.TM_meeting_revisions
            DROP CONSTRAINT CK_TM_meeting_revisions_mode;
    END;


    /*
       Valid location states:

       ROOM:
         room_id required
         online_join_url must be NULL

       ZOOM:
         room_id must be NULL
         online_join_url required
    */
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_revisions
        WITH CHECK
        ADD CONSTRAINT CK_TM_meeting_revisions_location
        CHECK
        (
            (
                meeting_mode = ''ROOM''
                AND room_id IS NOT NULL
                AND online_join_url IS NULL
            )
            OR
            (
                meeting_mode = ''ZOOM''
                AND room_id IS NULL
                AND online_join_url IS NOT NULL
                AND LEN(LTRIM(RTRIM(online_join_url))) > 0
            )
        );

        ALTER TABLE dbo.TM_meeting_revisions
        CHECK CONSTRAINT CK_TM_meeting_revisions_location;
    ';


    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_revisions
        WITH CHECK
        ADD CONSTRAINT CK_TM_meeting_revisions_mode
        CHECK
        (
            meeting_mode IN (''ROOM'', ''ZOOM'')
        );

        ALTER TABLE dbo.TM_meeting_revisions
        CHECK CONSTRAINT CK_TM_meeting_revisions_mode;
    ';


    /* ============================================================
       3. Meeting Templates

       Templates remember whether they are ROOM or ZOOM templates.

       Zoom URL is deliberately NOT stored in templates.
       The Organizer must enter a current Zoom URL when creating
       the actual Meeting.
       ============================================================ */

    IF COL_LENGTH(N'dbo.TM_meeting_templates', N'meeting_mode') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_templates
            ADD meeting_mode VARCHAR(10) NULL;
        ';
    END;


    /* Existing Templates remain physical ROOM Templates */
    EXEC sys.sp_executesql N'
        UPDATE dbo.TM_meeting_templates
        SET meeting_mode = ''ROOM''
        WHERE meeting_mode IS NULL;
    ';


    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_templates
        ALTER COLUMN meeting_mode VARCHAR(10) NOT NULL;
    ';


    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.default_constraints AS dc
        INNER JOIN sys.columns AS c
            ON c.object_id = dc.parent_object_id
           AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.TM_meeting_templates')
          AND c.name = N'meeting_mode'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_templates
            ADD CONSTRAINT DF_TM_meeting_templates_meeting_mode
                DEFAULT (''ROOM'') FOR meeting_mode;
        ';
    END;


    IF EXISTS
    (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_templates')
          AND name = N'CK_TM_meeting_templates_mode'
    )
    BEGIN
        ALTER TABLE dbo.TM_meeting_templates
            DROP CONSTRAINT CK_TM_meeting_templates_mode;
    END;


    /*
       ROOM template:
         default_room_id may be NULL or populated.

       ZOOM template:
         default_room_id must always be NULL.

       Zoom credentials are never stored by a Template.
    */
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_templates
        WITH CHECK
        ADD CONSTRAINT CK_TM_meeting_templates_mode
        CHECK
        (
            meeting_mode IN (''ROOM'', ''ZOOM'')
            AND
            (
                meeting_mode = ''ROOM''
                OR default_room_id IS NULL
            )
        );

        ALTER TABLE dbo.TM_meeting_templates
        CHECK CONSTRAINT CK_TM_meeting_templates_mode;
    ';


    /* ============================================================
       4. Meeting Series Members

       Keep the initial location snapshot used when the Series
       generated the Meeting.

       Existing rows are ROOM.
       Zoom occurrences have:
         initial_room_id = NULL
         initial_online_join_url = required
       ============================================================ */

    IF OBJECT_ID(N'dbo.TM_meeting_series_members', N'U') IS NOT NULL
    BEGIN

        IF COL_LENGTH(
            N'dbo.TM_meeting_series_members',
            N'initial_meeting_mode'
        ) IS NULL
        BEGIN
            EXEC sys.sp_executesql N'
                ALTER TABLE dbo.TM_meeting_series_members
                ADD initial_meeting_mode VARCHAR(10) NULL;
            ';
        END;


        EXEC sys.sp_executesql N'
            UPDATE dbo.TM_meeting_series_members
            SET initial_meeting_mode = ''ROOM''
            WHERE initial_meeting_mode IS NULL;
        ';


        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_series_members
            ALTER COLUMN initial_meeting_mode VARCHAR(10) NOT NULL;
        ';


        IF NOT EXISTS
        (
            SELECT 1
            FROM sys.default_constraints AS dc
            INNER JOIN sys.columns AS c
                ON c.object_id = dc.parent_object_id
               AND c.column_id = dc.parent_column_id
            WHERE dc.parent_object_id =
                      OBJECT_ID(N'dbo.TM_meeting_series_members')
              AND c.name = N'initial_meeting_mode'
        )
        BEGIN
            EXEC sys.sp_executesql N'
                ALTER TABLE dbo.TM_meeting_series_members
                ADD CONSTRAINT DF_TM_meeting_series_members_initial_meeting_mode
                    DEFAULT (''ROOM'') FOR initial_meeting_mode;
            ';
        END;


        IF COL_LENGTH(
            N'dbo.TM_meeting_series_members',
            N'initial_online_join_url'
        ) IS NULL
        BEGIN
            EXEC sys.sp_executesql N'
                ALTER TABLE dbo.TM_meeting_series_members
                ADD initial_online_join_url NVARCHAR(2048) NULL;
            ';
        END;


        IF COL_LENGTH(
            N'dbo.TM_meeting_series_members',
            N'initial_room_id'
        ) IS NULL
        BEGIN
            THROW 54502,
                  'TM_meeting_series_members.initial_room_id is missing. The Meeting Series migration is incomplete.',
                  1;
        END;


        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_series_members
            ALTER COLUMN initial_room_id BIGINT NULL;
        ';


        IF EXISTS
        (
            SELECT 1
            FROM sys.check_constraints
            WHERE parent_object_id =
                      OBJECT_ID(N'dbo.TM_meeting_series_members')
              AND name =
                      N'CK_TM_meeting_series_members_initial_location'
        )
        BEGIN
            ALTER TABLE dbo.TM_meeting_series_members
                DROP CONSTRAINT
                    CK_TM_meeting_series_members_initial_location;
        END;


        IF EXISTS
        (
            SELECT 1
            FROM sys.check_constraints
            WHERE parent_object_id =
                      OBJECT_ID(N'dbo.TM_meeting_series_members')
              AND name =
                      N'CK_TM_meeting_series_members_initial_mode'
        )
        BEGIN
            ALTER TABLE dbo.TM_meeting_series_members
                DROP CONSTRAINT
                    CK_TM_meeting_series_members_initial_mode;
        END;


        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_series_members
            WITH CHECK
            ADD CONSTRAINT
                CK_TM_meeting_series_members_initial_location
            CHECK
            (
                (
                    initial_meeting_mode = ''ROOM''
                    AND initial_room_id IS NOT NULL
                    AND initial_online_join_url IS NULL
                )
                OR
                (
                    initial_meeting_mode = ''ZOOM''
                    AND initial_room_id IS NULL
                    AND initial_online_join_url IS NOT NULL
                    AND LEN(
                        LTRIM(RTRIM(initial_online_join_url))
                    ) > 0
                )
            );

            ALTER TABLE dbo.TM_meeting_series_members
            CHECK CONSTRAINT
                CK_TM_meeting_series_members_initial_location;
        ';


        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_series_members
            WITH CHECK
            ADD CONSTRAINT
                CK_TM_meeting_series_members_initial_mode
            CHECK
            (
                initial_meeting_mode IN (''ROOM'', ''ZOOM'')
            );

            ALTER TABLE dbo.TM_meeting_series_members
            CHECK CONSTRAINT
                CK_TM_meeting_series_members_initial_mode;
        ';

    END;


    /* ============================================================
       Complete
       ============================================================ */

    COMMIT TRANSACTION;

    PRINT
        'Zoom Meeting location + split Meeting Organizer permissions migration completed successfully.';

END TRY
BEGIN CATCH

    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;

END CATCH;
GO