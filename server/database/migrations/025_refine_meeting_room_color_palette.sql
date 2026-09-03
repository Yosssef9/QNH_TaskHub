USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- 1. Validate the Meeting Room color foundation
    ------------------------------------------------------------
    IF OBJECT_ID(N'dbo.TM_meeting_rooms', N'U') IS NULL
    BEGIN
        THROW 52501,
            'TM_meeting_rooms must exist before applying migration 025.',
            1;
    END;

    IF COL_LENGTH(N'dbo.TM_meeting_rooms', N'color_key') IS NULL
    BEGIN
        THROW 52502,
            'TM_meeting_rooms.color_key must exist before applying migration 025.',
            1;
    END;


    ------------------------------------------------------------
    -- 2. Remove the previous palette constraint before replacing
    --    development data with the final distinct room palette.
    ------------------------------------------------------------
    IF EXISTS
    (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_rooms')
          AND name = N'CK_TM_meeting_rooms_color_key'
    )
    BEGIN
        ALTER TABLE dbo.TM_meeting_rooms
            DROP CONSTRAINT CK_TM_meeting_rooms_color_key;
    END;


    ------------------------------------------------------------
    -- 3. Reassign ALL existing development rooms deterministically
    --    by room id using the final palette.
    --
    -- This intentionally resets previous room color selections.
    -- The project is still in development and no deprecated color
    -- keys are retained in the active model.
    ------------------------------------------------------------
    ;WITH numbered AS
    (
        SELECT
            id,
            ROW_NUMBER() OVER (ORDER BY id) AS rn
        FROM dbo.TM_meeting_rooms
    )
    UPDATE room
    SET color_key =
        CASE ((numbered.rn - 1) % 8)
            WHEN 0 THEN 'BLUE'
            WHEN 1 THEN 'PURPLE'
            WHEN 2 THEN 'GREEN'
            WHEN 3 THEN 'ORANGE'
            WHEN 4 THEN 'RED'
            WHEN 5 THEN 'GOLD'
            WHEN 6 THEN 'SLATE'
            WHEN 7 THEN 'PINK'
        END
    FROM dbo.TM_meeting_rooms AS room
    INNER JOIN numbered
        ON numbered.id = room.id;


    ------------------------------------------------------------
    -- 4. Enforce the final palette
    ------------------------------------------------------------
    ALTER TABLE dbo.TM_meeting_rooms
        ALTER COLUMN color_key VARCHAR(20) NOT NULL;

    ALTER TABLE dbo.TM_meeting_rooms
        WITH CHECK
        ADD CONSTRAINT CK_TM_meeting_rooms_color_key
        CHECK (color_key IN (
            'BLUE',
            'PURPLE',
            'GREEN',
            'ORANGE',
            'RED',
            'GOLD',
            'SLATE',
            'PINK'
        ));

    ALTER TABLE dbo.TM_meeting_rooms
        CHECK CONSTRAINT CK_TM_meeting_rooms_color_key;


    COMMIT TRANSACTION;

    PRINT 'Meeting Room final palette migration completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
