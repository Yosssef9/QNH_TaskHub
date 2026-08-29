USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. Verify required Work Cycle schema
       ============================================================ */

    IF OBJECT_ID(N'dbo.TM_work_cycles', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_settings', N'U') IS NULL
    BEGIN
        THROW 50701,
              'Work Cycle migrations must be applied first.',
              1;
    END;


    /* ============================================================
       2. Prevent migration from being applied twice
       ============================================================ */

    IF COL_LENGTH(
        N'dbo.TM_user_settings',
        N'current_work_cycle_id'
    ) IS NOT NULL
    BEGIN
        THROW 50702,
              'Current Work Cycle preference already exists. Migration was not applied.',
              1;
    END;


    /* ============================================================
       3. Add Current Work Cycle preference
       ============================================================ */

    ALTER TABLE dbo.TM_user_settings
        ADD current_work_cycle_id BIGINT NULL;


    /* ============================================================
       IMPORTANT

       SQL Server compiles the outer batch before ALTER TABLE above
       executes.

       Therefore every statement below that references the newly
       created current_work_cycle_id column must be compiled only
       AFTER the ALTER TABLE has executed.

       sp_executesql gives those statements a new compilation scope.
       ============================================================ */


    /* ============================================================
       4. Add ownership-safe foreign key

       Ensures:
       User A can only select User A's Work Cycle.
       ============================================================ */

    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_user_settings
            ADD CONSTRAINT FK_TM_user_settings_current_work_cycle_owner
            FOREIGN KEY (
                current_work_cycle_id,
                portal_user_id
            )
            REFERENCES dbo.TM_work_cycles (
                id,
                owner_user_id
            );
    ';


    /* ============================================================
       5. Add lookup index
       ============================================================ */

    EXEC sys.sp_executesql N'
        CREATE INDEX IX_TM_user_settings_current_work_cycle
            ON dbo.TM_user_settings (
                current_work_cycle_id,
                portal_user_id
            )
            WHERE current_work_cycle_id IS NOT NULL;
    ';


    /* ============================================================
       6. Existing-user backfill

       If an existing user has exactly ONE open Work Cycle,
       automatically make it the Current Work Cycle.

       0 open cycles:
           leave NULL

       1 open cycle:
           automatically Current

       2+ open cycles:
           leave NULL so the user chooses explicitly
       ============================================================ */

    EXEC sys.sp_executesql N'
        ;WITH open_cycles AS (
            SELECT
                owner_user_id,
                COUNT_BIG(*) AS open_count,
                MIN(id) AS only_cycle_id
            FROM dbo.TM_work_cycles
            WHERE closed_at_utc IS NULL
              AND archived_at_utc IS NULL
            GROUP BY owner_user_id
        )
        UPDATE settings
        SET
            current_work_cycle_id = open_cycles.only_cycle_id,
            updated_at_utc = SYSUTCDATETIME()
        FROM dbo.TM_user_settings AS settings
        INNER JOIN open_cycles
            ON open_cycles.owner_user_id = settings.portal_user_id
        WHERE open_cycles.open_count = 1
          AND settings.current_work_cycle_id IS NULL;
    ';


    /* ============================================================
       7. Commit migration
       ============================================================ */

    COMMIT TRANSACTION;

END TRY
BEGIN CATCH

    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;

END CATCH;
GO