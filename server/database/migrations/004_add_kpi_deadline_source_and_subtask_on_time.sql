SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. Validate required tables
       ============================================================ */

    IF OBJECT_ID(N'dbo.TM_kpis', N'U') IS NULL
        THROW 50401,
            'TaskHub KPI table does not exist. Apply migration 001 first.',
            1;

    IF OBJECT_ID(N'dbo.TM_subtasks', N'U') IS NULL
        THROW 50402,
            'TaskHub subtask table does not exist. Apply migration 001 first.',
            1;


    /* ============================================================
       2. Add deadline_source
       ============================================================ */

    IF COL_LENGTH(N'dbo.TM_kpis', N'deadline_source') IS NULL
    BEGIN
        ALTER TABLE dbo.TM_kpis
        ADD deadline_source VARCHAR(20) NULL;
    END;


    /* ============================================================
       IMPORTANT:
       deadline_source may have been created above in this same
       batch. Statements that reference the new column are executed
       through dynamic SQL so SQL Server compiles them AFTER the
       column exists.
       ============================================================ */


    /* ============================================================
       3. Backfill existing ON_TIME_RATE KPIs

       Before migration 004 every ON_TIME_RATE KPI used the existing
       reference-date / automatically-calculated deadline model.
       ============================================================ */

    EXEC sys.sp_executesql N'
        UPDATE dbo.TM_kpis
        SET deadline_source = ''REFERENCE_DATE''
        WHERE calculation_method = ''ON_TIME_RATE''
          AND deadline_source IS NULL;
    ';


    /* ============================================================
       4. Ensure other KPI methods do not have deadline_source
       ============================================================ */

    EXEC sys.sp_executesql N'
        UPDATE dbo.TM_kpis
        SET deadline_source = NULL
        WHERE calculation_method <> ''ON_TIME_RATE''
          AND deadline_source IS NOT NULL;
    ';


    /* ============================================================
       5. Update calculation-method constraint
       ============================================================ */

    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_kpis')
          AND name = N'CK_TM_kpis_method'
    )
    BEGIN
        ALTER TABLE dbo.TM_kpis
        DROP CONSTRAINT CK_TM_kpis_method;
    END;


    ALTER TABLE dbo.TM_kpis WITH CHECK
    ADD CONSTRAINT CK_TM_kpis_method
    CHECK (
        calculation_method IN (
            'ON_TIME_RATE',
            'TASK_COMPLETION_RATE',
            'SUBTASK_COMPLETION_RATE',
            'SUBTASK_ON_TIME_RATE',
            'MANUAL_RATIO',
            'MANUAL_NUMBER'
        )
    );


    ALTER TABLE dbo.TM_kpis
    CHECK CONSTRAINT CK_TM_kpis_method;


    /* ============================================================
       6. Replace old ON_TIME_RATE configuration constraint

       Old rule:
           Every ON_TIME_RATE requires reference-date configuration.

       New rules:

       ON_TIME_RATE + REFERENCE_DATE
           business_day_offset required
           deadline_direction required
           reference_date_label required

       ON_TIME_RATE + TASK_DUE_DATE
           automatic deadline configuration must be NULL

       Other KPI methods
           deadline_source and automatic deadline config must be NULL
       ============================================================ */

    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_kpis')
          AND name = N'CK_TM_kpis_on_time_configuration'
    )
    BEGIN
        ALTER TABLE dbo.TM_kpis
        DROP CONSTRAINT CK_TM_kpis_on_time_configuration;
    END;


    /*
        Dynamic SQL is required here too because the CHECK constraint
        references deadline_source, which may have been added earlier
        during this migration.
    */

    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.TM_kpis WITH CHECK
        ADD CONSTRAINT CK_TM_kpis_on_time_configuration
        CHECK (
            (
                calculation_method = ''ON_TIME_RATE''
                AND deadline_source = ''REFERENCE_DATE''
                AND business_day_offset IS NOT NULL
                AND business_day_offset >= 0
                AND deadline_direction IN (''BEFORE'', ''AFTER'')
                AND reference_date_label IS NOT NULL
                AND LEN(LTRIM(RTRIM(reference_date_label))) > 0
            )
            OR
            (
                calculation_method = ''ON_TIME_RATE''
                AND deadline_source = ''TASK_DUE_DATE''
                AND business_day_offset IS NULL
                AND deadline_direction IS NULL
                AND reference_date_label IS NULL
            )
            OR
            (
                calculation_method <> ''ON_TIME_RATE''
                AND deadline_source IS NULL
                AND business_day_offset IS NULL
                AND deadline_direction IS NULL
                AND reference_date_label IS NULL
            )
        );
    ';


    ALTER TABLE dbo.TM_kpis
    CHECK CONSTRAINT CK_TM_kpis_on_time_configuration;


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