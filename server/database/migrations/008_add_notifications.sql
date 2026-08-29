USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_tasks', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_work_cycles', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_kpi_instances', N'U') IS NULL
       OR COL_LENGTH(N'dbo.TM_user_settings', N'current_work_cycle_id') IS NULL
    BEGIN
        THROW 50801, 'TaskHub migrations 001-007 must be applied first.', 1;
    END;

    IF OBJECT_ID(N'dbo.TM_notifications', N'U') IS NOT NULL
    BEGIN
        THROW 50802, 'Notifications table already exists. Migration was not applied.', 1;
    END;

    CREATE TABLE dbo.TM_notifications (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NOT NULL,
        notification_type VARCHAR(40) NOT NULL,
        dedupe_key VARCHAR(220) NOT NULL,
        subject_title NVARCHAR(250) NOT NULL,
        context_title NVARCHAR(500) NULL,
        task_id BIGINT NULL,
        list_id BIGINT NULL,
        cycle_id BIGINT NULL,
        kpi_instance_id BIGINT NULL,
        event_date DATE NULL,
        actual_value DECIMAL(19, 4) NULL,
        target_value DECIMAL(19, 4) NULL,
        measurement_unit VARCHAR(10) NULL,
        read_at_utc DATETIME2(3) NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_notifications_created_at_utc DEFAULT (SYSUTCDATETIME()),
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_notifications PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_notifications_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT UQ_TM_notifications_owner_dedupe
            UNIQUE (owner_user_id, dedupe_key),
        CONSTRAINT CK_TM_notifications_type CHECK (
            notification_type IN (
                'TASK_OVERDUE',
                'TASK_DUE_TODAY',
                'HIGH_PRIORITY_TASK_DUE_TOMORROW',
                'CURRENT_CYCLE_ENDING_SOON',
                'CURRENT_CYCLE_PAST_END',
                'KPI_BELOW_TARGET',
                'KPI_MEASUREMENT_DUE'
            )
        ),
        CONSTRAINT CK_TM_notifications_subject
            CHECK (LEN(LTRIM(RTRIM(subject_title))) > 0),
        CONSTRAINT CK_TM_notifications_measurement_unit
            CHECK (measurement_unit IS NULL OR measurement_unit IN ('PERCENT', 'NUMBER'))
    );

    CREATE INDEX IX_TM_notifications_owner_unread_created
        ON dbo.TM_notifications (owner_user_id, read_at_utc, created_at_utc DESC, id DESC)
        INCLUDE (
            notification_type,
            subject_title,
            context_title,
            task_id,
            list_id,
            cycle_id,
            kpi_instance_id,
            event_date,
            actual_value,
            target_value,
            measurement_unit
        );

    CREATE INDEX IX_TM_notifications_owner_created
        ON dbo.TM_notifications (owner_user_id, created_at_utc DESC, id DESC)
        INCLUDE (notification_type, subject_title, read_at_utc);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
