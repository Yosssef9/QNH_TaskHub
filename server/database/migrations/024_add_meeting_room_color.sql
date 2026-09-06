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
    -- 2. Add color_key if it does not exist
    --
    -- Dynamic SQL is intentional because later statements in
    -- this same batch must not be compiled against a column
    -- that may not exist yet.
    ------------------------------------------------------------
    IF COL_LENGTH(N'dbo.TM_meeting_rooms', N'color_key') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.TM_meeting_rooms
                ADD color_key VARCHAR(20) NULL;
        ';
    END;


    ------------------------------------------------------------
    -- 3. Drop existing color constraint
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
    -- 4. Reassign ALL existing rooms using FINAL palette
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
    -- 5. Validate that no NULL values remain
    ------------------------------------------------------------
    DECLARE @NullColorCount BIGINT;

    EXEC sys.sp_executesql
        N'
            SELECT @CountOutput = COUNT_BIG(*)
            FROM dbo.TM_meeting_rooms
            WHERE color_key IS NULL;
        ',
        N'@CountOutput BIGINT OUTPUT',
        @CountOutput = @NullColorCount OUTPUT;

    IF @NullColorCount > 0
    BEGIN
        THROW 52402,
            'One or more Meeting Rooms still have a NULL color_key.',
            1;
    END;


    ------------------------------------------------------------
    -- 6. Make color mandatory
    ------------------------------------------------------------
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_rooms
            ALTER COLUMN color_key VARCHAR(20) NOT NULL;
    ';


    ------------------------------------------------------------
    -- 7. Add FINAL palette constraint
    --
    -- MUST also be dynamic SQL. A static CHECK(color_key...)
    -- in this batch causes SQL Server compile-time error 207
    -- when color_key did not exist before the migration.
    ------------------------------------------------------------
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_meeting_rooms
            WITH CHECK
            ADD CONSTRAINT CK_TM_meeting_rooms_color_key
            CHECK
            (
                color_key IN
                (
                    ''BLUE'',
                    ''PURPLE'',
                    ''GREEN'',
                    ''ORANGE'',
                    ''RED'',
                    ''GOLD'',
                    ''SLATE'',
                    ''PINK''
                )
            );
    ';


    ------------------------------------------------------------
    -- 8. Explicitly enable and validate constraint
    ------------------------------------------------------------
    ALTER TABLE dbo.TM_meeting_rooms
        CHECK CONSTRAINT CK_TM_meeting_rooms_color_key;


    ------------------------------------------------------------
    -- 9. Commit
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
-- This is now a NEW batch, so SQL Server sees color_key
-- after the successful migration above.
------------------------------------------------------------
IF COL_LENGTH(N'dbo.TM_meeting_rooms', N'color_key') IS NOT NULL
BEGIN
    EXEC sys.sp_executesql N'
        SELECT
            id,
            code,
            name_ar,
            name_en,
            color_key
        FROM dbo.TM_meeting_rooms
        ORDER BY id;
    ';
END
ELSE
BEGIN
    PRINT 'Verification skipped: color_key does not exist because the migration did not complete.';
END;
GO 