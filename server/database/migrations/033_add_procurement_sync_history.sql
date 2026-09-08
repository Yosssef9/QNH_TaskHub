SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_procurement_sync_runs', N'U') IS NOT NULL
        THROW 53301, 'Procurement synchronization history table already exists. Migration 033 was not applied.', 1;

    CREATE TABLE dbo.TM_procurement_sync_runs (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        trigger_type VARCHAR(20) NOT NULL,
        requested_by_user_id INT NULL,
        worker_id NVARCHAR(160) NOT NULL,
        status VARCHAR(20) NOT NULL,
        started_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_procurement_sync_runs_started_at_utc
            DEFAULT (SYSUTCDATETIME()),
        finished_at_utc DATETIME2(3) NULL,
        last_completed_step VARCHAR(20) NULL,
        failed_step VARCHAR(20) NULL,
        duration_ms BIGINT NULL,
        error_code NVARCHAR(100) NULL,
        error_message NVARCHAR(2000) NULL,

        CONSTRAINT PK_TM_procurement_sync_runs
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT CK_TM_procurement_sync_runs_trigger
            CHECK (trigger_type IN ('WORKER', 'MANUAL')),

        CONSTRAINT CK_TM_procurement_sync_runs_status
            CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),

        CONSTRAINT CK_TM_procurement_sync_runs_last_step
            CHECK (
                last_completed_step IS NULL
                OR last_completed_step IN ('SUPPLIERS', 'ITEMS', 'TRANSACTIONS')
            ),

        CONSTRAINT CK_TM_procurement_sync_runs_failed_step
            CHECK (
                failed_step IS NULL
                OR failed_step IN ('SUPPLIERS', 'ITEMS', 'TRANSACTIONS')
            ),

        CONSTRAINT CK_TM_procurement_sync_runs_duration
            CHECK (duration_ms IS NULL OR duration_ms >= 0),

        CONSTRAINT CK_TM_procurement_sync_runs_finish_state
            CHECK (
                (status = 'RUNNING' AND finished_at_utc IS NULL)
                OR
                (status IN ('COMPLETED', 'FAILED') AND finished_at_utc IS NOT NULL)
            ),

        CONSTRAINT CK_TM_procurement_sync_runs_error_state
            CHECK (
                (status = 'FAILED' AND error_code IS NOT NULL)
                OR
                (status <> 'FAILED' AND error_code IS NULL AND error_message IS NULL)
            )
    );

    CREATE INDEX IX_TM_procurement_sync_runs_latest
        ON dbo.TM_procurement_sync_runs (started_at_utc DESC, id DESC)
        INCLUDE (
            trigger_type,
            status,
            finished_at_utc,
            last_completed_step,
            failed_step,
            duration_ms
        );

    CREATE INDEX IX_TM_procurement_sync_runs_successful
        ON dbo.TM_procurement_sync_runs (finished_at_utc DESC, id DESC)
        INCLUDE (duration_ms)
        WHERE status = 'COMPLETED';

    CREATE INDEX IX_TM_procurement_sync_runs_running
        ON dbo.TM_procurement_sync_runs (status, started_at_utc)
        WHERE status = 'RUNNING';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
