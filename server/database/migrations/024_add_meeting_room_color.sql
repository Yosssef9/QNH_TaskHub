USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- 1. Validate dependency
    ------------------------------------------------------------
    IF OBJECT_ID(N'dbo.TM_meeting_rooms', N'U') IS NULL
    BEGIN
        THROW 52401,
            'TM_meeting_rooms must exist before applying the Meeting Room color migration.',
            1;
    END;


    ------------------------------------------------------------
    -- 2. Add persisted room color key if it does not exist
    ------------------------------------------------------------
    IF COL_LENGTH(N'dbo.TM_meeting_rooms', N'color_key') IS NULL
    BEGIN
        ALTER TABLE dbo.TM_meeting_rooms
            ADD color_key VARCHAR(20) NULL;
    END;


    ------------------------------------------------------------
    -- 3. DROP THE OLD CHECK CONSTRAINT FIRST
    --
    -- This must happen BEFORE updating old palette values.
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
    -- 4. Reassign ALL existing rooms using the FINAL palette
    --
    -- Development-time cleanup:
    --
    -- Room 1 -> BLUE
    -- Room 2 -> PURPLE
    -- Room 3 -> GREEN
    -- Room 4 -> ORANGE
    -- Room 5 -> RED
    -- Room 6 -> GOLD
    -- Room 7 -> SLATE
    -- Room 8 -> PINK
    --
    -- Then cycle again if more than 8 rooms exist.
    --
    -- We intentionally update ALL rooms instead of carrying
    -- old development color assignments forward.
    ------------------------------------------------------------
    EXEC sys.sp_executesql N'
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
                WHEN 0 THEN ''BLUE''
                WHEN 1 THEN ''PURPLE''
                WHEN 2 THEN ''GREEN''
                WHEN 3 THEN ''ORANGE''
                WHEN 4 THEN ''RED''
                WHEN 5 THEN ''GOLD''
                WHEN 6 THEN ''SLATE''
                WHEN 7 THEN ''PINK''
            END
        FROM dbo.TM_meeting_rooms AS room
        INNER JOIN numbered
            ON numbered.id = room.id;
    ';


    ------------------------------------------------------------
    -- 5. Make persisted color mandatory
    ------------------------------------------------------------
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_rooms
            ALTER COLUMN color_key VARCHAR(20) NOT NULL;
    ';


    ------------------------------------------------------------
    -- 6. Add FINAL palette constraint
    ------------------------------------------------------------
    ALTER TABLE dbo.TM_meeting_rooms
        WITH CHECK
        ADD CONSTRAINT CK_TM_meeting_rooms_color_key
        CHECK
        (
            color_key IN
            (
                'BLUE',
                'PURPLE',
                'GREEN',
                'ORANGE',
                'RED',
                'GOLD',
                'SLATE',
                'PINK'
            )
        );


    ------------------------------------------------------------
    -- 7. Explicitly enable and validate the constraint
    ------------------------------------------------------------
    ALTER TABLE dbo.TM_meeting_rooms
        CHECK CONSTRAINT CK_TM_meeting_rooms_color_key;


    ------------------------------------------------------------
    -- 8. Commit
    ------------------------------------------------------------
    COMMIT TRANSACTION;

    PRINT 'Meeting Room color palette migration completed successfully.';
END TRY
BEGIN CATCH

    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO


------------------------------------------------------------
-- Verification
------------------------------------------------------------
SELECT
    id,
    code,
    name_ar,
    name_en,
    color_key
FROM dbo.TM_meeting_rooms
ORDER BY id;
GO