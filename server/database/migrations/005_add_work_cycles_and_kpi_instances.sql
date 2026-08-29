SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_kpis', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_tasks', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_kpi_period_results', N'U') IS NULL
        THROW 50501, 'TaskHub migrations 001-004 must be applied first.', 1;

    IF OBJECT_ID(N'dbo.TM_work_cycles', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_kpi_instances', N'U') IS NOT NULL
        THROW 50502, 'Work Cycle tables already exist. Migration was not applied.', 1;

    CREATE TABLE dbo.TM_work_cycles (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NOT NULL,
        title NVARCHAR(180) NOT NULL,
        description NVARCHAR(1500) NULL,
        icon_key VARCHAR(50) NOT NULL CONSTRAINT DF_TM_work_cycles_icon DEFAULT ('briefcase'),
        color VARCHAR(7) NOT NULL CONSTRAINT DF_TM_work_cycles_color DEFAULT ('#2563EB'),
        start_date DATE NULL,
        end_date DATE NULL,
        display_order INT NOT NULL CONSTRAINT DF_TM_work_cycles_order DEFAULT (0),
        created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_work_cycles_created DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        closed_at_utc DATETIME2(3) NULL,
        archived_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_work_cycles PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_work_cycles_id_owner UNIQUE (id, owner_user_id),
        CONSTRAINT FK_TM_work_cycles_owner FOREIGN KEY (owner_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_work_cycles_title CHECK (LEN(LTRIM(RTRIM(title))) > 0),
        CONSTRAINT CK_TM_work_cycles_icon CHECK (LEN(LTRIM(RTRIM(icon_key))) > 0),
        CONSTRAINT CK_TM_work_cycles_color CHECK (
            color LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
        ),
        CONSTRAINT CK_TM_work_cycles_dates CHECK (
            start_date IS NULL OR end_date IS NULL OR start_date <= end_date
        ),
        CONSTRAINT CK_TM_work_cycles_order CHECK (display_order >= 0),
        CONSTRAINT CK_TM_work_cycles_archive_state CHECK (
            archived_at_utc IS NULL OR closed_at_utc IS NOT NULL
        )
    );

    CREATE UNIQUE INDEX UX_TM_work_cycles_active_title
        ON dbo.TM_work_cycles (owner_user_id, title)
        WHERE archived_at_utc IS NULL;

    CREATE INDEX IX_TM_work_cycles_owner_order
        ON dbo.TM_work_cycles (owner_user_id, display_order, id)
        INCLUDE (title, icon_key, color, start_date, end_date, closed_at_utc)
        WHERE archived_at_utc IS NULL;

    CREATE TABLE dbo.TM_kpi_instances (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NOT NULL,
        cycle_id BIGINT NOT NULL,
        kpi_id BIGINT NOT NULL,
        name_snapshot NVARCHAR(150) NOT NULL,
        description_snapshot NVARCHAR(1500) NULL,
        icon_key_snapshot VARCHAR(50) NOT NULL,
        color_snapshot VARCHAR(7) NOT NULL,
        calculation_method_snapshot VARCHAR(30) NOT NULL,
        period_type_snapshot VARCHAR(10) NOT NULL,
        measurement_unit_snapshot VARCHAR(10) NOT NULL,
        target_value_snapshot DECIMAL(19, 4) NULL,
        target_direction_snapshot VARCHAR(20) NULL,
        deadline_source_snapshot VARCHAR(20) NULL,
        business_day_offset_snapshot SMALLINT NULL,
        deadline_direction_snapshot VARCHAR(10) NULL,
        reference_date_label_snapshot NVARCHAR(100) NULL,
        numerator_label_snapshot NVARCHAR(100) NULL,
        denominator_label_snapshot NVARCHAR(100) NULL,
        value_label_snapshot NVARCHAR(100) NULL,
        display_order INT NOT NULL CONSTRAINT DF_TM_kpi_instances_order DEFAULT (0),
        created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_kpi_instances_created DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_kpi_instances PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_kpi_instances_id_owner UNIQUE (id, owner_user_id),
        CONSTRAINT UQ_TM_kpi_instances_cycle_template UNIQUE (cycle_id, kpi_id),
        CONSTRAINT FK_TM_kpi_instances_owner FOREIGN KEY (owner_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_kpi_instances_cycle_owner FOREIGN KEY (cycle_id, owner_user_id)
            REFERENCES dbo.TM_work_cycles (id, owner_user_id),
        CONSTRAINT FK_TM_kpi_instances_template_owner FOREIGN KEY (kpi_id, owner_user_id)
            REFERENCES dbo.TM_kpis (id, owner_user_id),
        CONSTRAINT CK_TM_kpi_instances_name CHECK (LEN(LTRIM(RTRIM(name_snapshot))) > 0),
        CONSTRAINT CK_TM_kpi_instances_order CHECK (display_order >= 0)
    );

    CREATE INDEX IX_TM_kpi_instances_cycle_order
        ON dbo.TM_kpi_instances (owner_user_id, cycle_id, display_order, id)
        INCLUDE (kpi_id, name_snapshot, icon_key_snapshot, color_snapshot);

    ALTER TABLE dbo.TM_tasks ADD kpi_instance_id BIGINT NULL;
    ALTER TABLE dbo.TM_kpi_period_results ADD kpi_instance_id BIGINT NULL;

    ALTER TABLE dbo.TM_tasks ADD CONSTRAINT FK_TM_tasks_kpi_instance_owner
        FOREIGN KEY (kpi_instance_id, owner_user_id)
        REFERENCES dbo.TM_kpi_instances (id, owner_user_id);

    ALTER TABLE dbo.TM_kpi_period_results ADD CONSTRAINT FK_TM_kpi_period_results_instance_owner
        FOREIGN KEY (kpi_instance_id, owner_user_id)
        REFERENCES dbo.TM_kpi_instances (id, owner_user_id);

    CREATE TABLE #legacy_cycles (owner_user_id INT NOT NULL PRIMARY KEY, cycle_id BIGINT NOT NULL);

    INSERT dbo.TM_work_cycles (
        owner_user_id, title, description, icon_key, color, display_order
    )
    OUTPUT inserted.owner_user_id, inserted.id INTO #legacy_cycles (owner_user_id, cycle_id)
    SELECT owners.owner_user_id,
           N'أعمال المؤشرات الحالية',
           N'تم إنشاؤها تلقائياً لحفظ أعمال المؤشرات الموجودة قبل إضافة دورات العمل.',
           'briefcase', '#2563EB', 1
    FROM (
        SELECT owner_user_id FROM dbo.TM_tasks WHERE kpi_id IS NOT NULL
        UNION
        SELECT owner_user_id FROM dbo.TM_kpi_period_results
    ) AS owners;

    INSERT dbo.TM_kpi_instances (
        owner_user_id, cycle_id, kpi_id, name_snapshot, description_snapshot,
        icon_key_snapshot, color_snapshot, calculation_method_snapshot,
        period_type_snapshot, measurement_unit_snapshot, target_value_snapshot,
        target_direction_snapshot, deadline_source_snapshot, business_day_offset_snapshot,
        deadline_direction_snapshot, reference_date_label_snapshot, numerator_label_snapshot,
        denominator_label_snapshot, value_label_snapshot, display_order
    )
    SELECT source.owner_user_id, legacy.cycle_id, source.kpi_id,
           kpi.name, kpi.description, kpi.icon_key, kpi.color, kpi.calculation_method,
           kpi.period_type, kpi.measurement_unit, kpi.target_value, kpi.target_direction,
           kpi.deadline_source, kpi.business_day_offset, kpi.deadline_direction,
           kpi.reference_date_label, kpi.numerator_label, kpi.denominator_label,
           kpi.value_label,
           ROW_NUMBER() OVER (PARTITION BY source.owner_user_id ORDER BY kpi.display_order, kpi.id)
    FROM (
        SELECT owner_user_id, kpi_id FROM dbo.TM_tasks WHERE kpi_id IS NOT NULL
        UNION
        SELECT owner_user_id, kpi_id FROM dbo.TM_kpi_period_results
    ) AS source
    INNER JOIN #legacy_cycles AS legacy ON legacy.owner_user_id = source.owner_user_id
    INNER JOIN dbo.TM_kpis AS kpi
        ON kpi.id = source.kpi_id AND kpi.owner_user_id = source.owner_user_id;

    UPDATE task
    SET kpi_instance_id = instance.id
    FROM dbo.TM_tasks AS task
    INNER JOIN dbo.TM_kpi_instances AS instance
        ON instance.owner_user_id = task.owner_user_id AND instance.kpi_id = task.kpi_id
    INNER JOIN #legacy_cycles AS legacy
        ON legacy.owner_user_id = task.owner_user_id AND legacy.cycle_id = instance.cycle_id
    WHERE task.kpi_id IS NOT NULL;

    UPDATE result
    SET kpi_instance_id = instance.id
    FROM dbo.TM_kpi_period_results AS result
    INNER JOIN dbo.TM_kpi_instances AS instance
        ON instance.owner_user_id = result.owner_user_id AND instance.kpi_id = result.kpi_id
    INNER JOIN #legacy_cycles AS legacy
        ON legacy.owner_user_id = result.owner_user_id AND legacy.cycle_id = instance.cycle_id;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
