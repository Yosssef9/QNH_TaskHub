SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. Verify migration 005
       ============================================================ */

    IF OBJECT_ID(N'dbo.TM_kpi_instances', N'U') IS NULL
        THROW 50601, 'Migration 005 must be applied first.', 1;


    /* ============================================================
       2. Verify legacy KPI tasks were successfully backfilled
       ============================================================ */

    IF EXISTS (
        SELECT 1
        FROM dbo.TM_tasks
        WHERE kpi_id IS NOT NULL
          AND kpi_instance_id IS NULL
    )
        THROW 50602,
              'Some KPI tasks were not backfilled to KPI instances.',
              1;


    /* ============================================================
       3. Verify legacy KPI results were successfully backfilled
       ============================================================ */

    IF EXISTS (
        SELECT 1
        FROM dbo.TM_kpi_period_results
        WHERE kpi_instance_id IS NULL
    )
        THROW 50603,
              'Some KPI results were not backfilled to KPI instances.',
              1;


    /* ============================================================
       4. Remove indexes that still depend on legacy kpi_id
       ============================================================ */

    DROP INDEX IX_TM_tasks_kpi_status_due_date
        ON dbo.TM_tasks;

    DROP INDEX IX_TM_tasks_owner_due_date
        ON dbo.TM_tasks;

    /*
        Important:
        This index includes TM_kpi_period_results.kpi_id,
        therefore it MUST be removed before kpi_id can be dropped.
    */
    DROP INDEX IX_TM_kpi_period_results_owner_period
        ON dbo.TM_kpi_period_results;


    /* ============================================================
       5. Remove TM_tasks constraints that reference kpi_id
       ============================================================ */

    ALTER TABLE dbo.TM_tasks
        DROP CONSTRAINT CK_TM_tasks_exactly_one_container;

    ALTER TABLE dbo.TM_tasks
        DROP CONSTRAINT CK_TM_tasks_reference_date;

    /*
        DO NOT drop CK_TM_tasks_reference_requires_due_date.

        It contains:
            reference_date IS NULL OR due_date IS NOT NULL

        and does not depend on kpi_id.
    */

    ALTER TABLE dbo.TM_tasks
        DROP CONSTRAINT FK_TM_tasks_kpi_owner;


    /* ============================================================
       6. Remove TM_kpi_period_results objects depending on kpi_id
       ============================================================ */

    ALTER TABLE dbo.TM_kpi_period_results
        DROP CONSTRAINT UQ_TM_kpi_period_results_period;

    ALTER TABLE dbo.TM_kpi_period_results
        DROP CONSTRAINT FK_TM_kpi_period_results_kpi_owner;


    /* ============================================================
       7. Remove obsolete direct KPI ownership columns
       ============================================================ */

    ALTER TABLE dbo.TM_tasks
        DROP COLUMN kpi_id;

    ALTER TABLE dbo.TM_kpi_period_results
        DROP COLUMN kpi_id;


    /* ============================================================
       8. KPI results must now always belong to a KPI instance
       ============================================================ */

    ALTER TABLE dbo.TM_kpi_period_results
        ALTER COLUMN kpi_instance_id BIGINT NOT NULL;


    /* ============================================================
       9. Recreate TM_tasks ownership constraint
       
       Normal task:
           list_id IS NOT NULL
           kpi_instance_id IS NULL

       KPI task:
           list_id IS NULL
           kpi_instance_id IS NOT NULL
       ============================================================ */

    ALTER TABLE dbo.TM_tasks
        ADD CONSTRAINT CK_TM_tasks_exactly_one_container
        CHECK (
            (list_id IS NOT NULL AND kpi_instance_id IS NULL)
            OR
            (list_id IS NULL AND kpi_instance_id IS NOT NULL)
        );


    /* ============================================================
       10. Reference dates may exist only on KPI-instance tasks
       ============================================================ */

    ALTER TABLE dbo.TM_tasks
        ADD CONSTRAINT CK_TM_tasks_reference_date
        CHECK (
            reference_date IS NULL
            OR kpi_instance_id IS NOT NULL
        );


    /* ============================================================
       11. KPI result uniqueness is now instance-scoped
       ============================================================ */

    ALTER TABLE dbo.TM_kpi_period_results
        ADD CONSTRAINT UQ_TM_kpi_period_results_period
        UNIQUE (
            kpi_instance_id,
            period_start,
            period_end
        );


    /* ============================================================
       12. Recreate KPI task index using kpi_instance_id
       ============================================================ */

    CREATE INDEX IX_TM_tasks_kpi_instance_status_due_date
        ON dbo.TM_tasks (
            owner_user_id,
            kpi_instance_id,
            status,
            due_date,
            id
        )
        INCLUDE (
            title,
            priority,
            reference_date,
            completed_at_utc
        )
        WHERE
            kpi_instance_id IS NOT NULL
            AND deleted_at_utc IS NULL;


    /* ============================================================
       13. Recreate task due-date index using kpi_instance_id
       ============================================================ */

    CREATE INDEX IX_TM_tasks_owner_due_date
        ON dbo.TM_tasks (
            owner_user_id,
            due_date,
            status
        )
        INCLUDE (
            list_id,
            kpi_instance_id,
            title,
            priority
        )
        WHERE
            deleted_at_utc IS NULL
            AND due_date IS NOT NULL;


    /* ============================================================
       14. Recreate KPI result period index using kpi_instance_id
       ============================================================ */

    CREATE INDEX IX_TM_kpi_period_results_owner_period
        ON dbo.TM_kpi_period_results (
            owner_user_id,
            period_start DESC,
            period_end DESC
        )
        INCLUDE (
            kpi_instance_id,
            actual_value,
            target_value_snapshot,
            result_status,
            is_finalized
        );


    /* ============================================================
       15. Commit migration
       ============================================================ */

    COMMIT TRANSACTION;

END TRY
BEGIN CATCH

    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;

END CATCH;