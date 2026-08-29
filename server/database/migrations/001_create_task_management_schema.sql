SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.users', N'U') IS NULL
        THROW 50001, 'Required Portal table dbo.users does not exist.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = N'dbo'
          AND TABLE_NAME = N'users'
          AND COLUMN_NAME = N'USER_ID'
          AND DATA_TYPE = N'int'
    )
        THROW 50002, 'dbo.users.USER_ID must exist and have type INT.', 1;

    IF COL_LENGTH(N'dbo.users', N'USER_CODE') IS NULL
        THROW 50003, 'Required Portal identity column dbo.users.USER_CODE does not exist.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name IN (
              -- Current private TaskHub schema.
              N'TM_roles',
              N'TM_user_access',
              N'TM_user_settings',
              N'TM_lists',
              N'TM_kpis',
              N'TM_tasks',
              N'TM_subtasks',
              N'TM_attachments',
              N'TM_kpi_period_results',
              N'TM_holidays',
              N'TM_task_activity',

              -- Incompatible legacy schema objects. Stop instead of mixing models.
              N'TM_departments',
              N'TM_permissions',
              N'TM_role_permissions',
              N'TM_user_roles',
              N'TM_user_permission_overrides',
              N'TM_task_groups',
              N'TM_task_group_members',
              N'TM_task_comments',
              N'TM_notifications',
              N'TM_audit_logs'
          )
    )
        THROW 50004, 'One or more current or obsolete TaskHub tables already exist. Migration was not applied.', 1;

    CREATE TABLE dbo.TM_roles (
        role_code VARCHAR(20) NOT NULL,
        name_ar NVARCHAR(100) NOT NULL,
        name_en NVARCHAR(100) NOT NULL,
        description_ar NVARCHAR(500) NULL,
        description_en NVARCHAR(500) NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_roles_is_active DEFAULT (1),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_roles_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_roles PRIMARY KEY CLUSTERED (role_code),
        CONSTRAINT CK_TM_roles_code
            CHECK (role_code IN ('USER', 'ADMIN')),
        CONSTRAINT CK_TM_roles_names CHECK (
            LEN(LTRIM(RTRIM(name_ar))) > 0
            AND LEN(LTRIM(RTRIM(name_en))) > 0
        )
    );

    CREATE TABLE dbo.TM_user_access (
        portal_user_id INT NOT NULL,
        role_code VARCHAR(20) NOT NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_user_access_is_active DEFAULT (1),
        granted_by_user_id INT NULL,
        granted_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_user_access_granted_at_utc DEFAULT (SYSUTCDATETIME()),
        deactivated_by_user_id INT NULL,
        deactivated_at_utc DATETIME2(3) NULL,
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_user_access PRIMARY KEY CLUSTERED (portal_user_id),
        CONSTRAINT FK_TM_user_access_portal_user
            FOREIGN KEY (portal_user_id) REFERENCES dbo.users (USER_ID),
        CONSTRAINT FK_TM_user_access_role
            FOREIGN KEY (role_code) REFERENCES dbo.TM_roles (role_code),
        CONSTRAINT FK_TM_user_access_granted_by
            FOREIGN KEY (granted_by_user_id) REFERENCES dbo.users (USER_ID),
        CONSTRAINT FK_TM_user_access_deactivated_by
            FOREIGN KEY (deactivated_by_user_id) REFERENCES dbo.users (USER_ID),
        CONSTRAINT CK_TM_user_access_lifecycle CHECK (
            (
                is_active = 1
                AND deactivated_by_user_id IS NULL
                AND deactivated_at_utc IS NULL
            )
            OR
            (
                is_active = 0
                AND deactivated_at_utc IS NOT NULL
            )
        )
    );

    CREATE INDEX IX_TM_user_access_role_active
        ON dbo.TM_user_access (role_code, is_active)
        INCLUDE (portal_user_id);

    CREATE TABLE dbo.TM_user_settings (
        portal_user_id INT NOT NULL,
        language_code VARCHAR(2) NOT NULL
            CONSTRAINT DF_TM_user_settings_language DEFAULT ('AR'),
        theme VARCHAR(10) NOT NULL
            CONSTRAINT DF_TM_user_settings_theme DEFAULT ('SYSTEM'),
        sidebar_collapsed BIT NOT NULL
            CONSTRAINT DF_TM_user_settings_sidebar DEFAULT (0),
        timezone_name VARCHAR(50) NOT NULL
            CONSTRAINT DF_TM_user_settings_timezone DEFAULT ('Asia/Riyadh'),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_user_settings_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_user_settings PRIMARY KEY CLUSTERED (portal_user_id),
        CONSTRAINT FK_TM_user_settings_access
            FOREIGN KEY (portal_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_user_settings_language
            CHECK (language_code IN ('AR', 'EN')),
        CONSTRAINT CK_TM_user_settings_theme
            CHECK (theme IN ('LIGHT', 'DARK', 'SYSTEM')),
        CONSTRAINT CK_TM_user_settings_timezone
            CHECK (timezone_name = 'Asia/Riyadh')
    );

    CREATE TABLE dbo.TM_lists (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NOT NULL,
        name NVARCHAR(120) NOT NULL,
        icon_key VARCHAR(50) NOT NULL
            CONSTRAINT DF_TM_lists_icon_key DEFAULT ('list-todo'),
        color VARCHAR(7) NOT NULL
            CONSTRAINT DF_TM_lists_color DEFAULT ('#2563EB'),
        is_default BIT NOT NULL
            CONSTRAINT DF_TM_lists_is_default DEFAULT (0),
        display_order INT NOT NULL
            CONSTRAINT DF_TM_lists_display_order DEFAULT (0),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_lists_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        archived_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_lists PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_lists_id_owner UNIQUE (id, owner_user_id),
        CONSTRAINT FK_TM_lists_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_lists_name
            CHECK (LEN(LTRIM(RTRIM(name))) > 0),
        CONSTRAINT CK_TM_lists_icon
            CHECK (LEN(LTRIM(RTRIM(icon_key))) > 0),
        CONSTRAINT CK_TM_lists_color
            CHECK (color LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        CONSTRAINT CK_TM_lists_display_order
            CHECK (display_order >= 0),
        CONSTRAINT CK_TM_lists_default_not_archived
            CHECK (is_default = 0 OR archived_at_utc IS NULL)
    );

    CREATE UNIQUE INDEX UX_TM_lists_one_default_per_owner
        ON dbo.TM_lists (owner_user_id)
        WHERE is_default = 1;

    CREATE UNIQUE INDEX UX_TM_lists_active_name_per_owner
        ON dbo.TM_lists (owner_user_id, name)
        WHERE archived_at_utc IS NULL;

    CREATE INDEX IX_TM_lists_owner_active_order
        ON dbo.TM_lists (owner_user_id, display_order, id)
        INCLUDE (name, icon_key, color, is_default)
        WHERE archived_at_utc IS NULL;

    CREATE TABLE dbo.TM_kpis (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NOT NULL,
        name NVARCHAR(150) NOT NULL,
        description NVARCHAR(1500) NULL,
        icon_key VARCHAR(50) NOT NULL
            CONSTRAINT DF_TM_kpis_icon_key DEFAULT ('gauge'),
        color VARCHAR(7) NOT NULL
            CONSTRAINT DF_TM_kpis_color DEFAULT ('#0F766E'),
        calculation_method VARCHAR(30) NOT NULL,
        period_type VARCHAR(10) NOT NULL
            CONSTRAINT DF_TM_kpis_period_type DEFAULT ('MONTHLY'),
        measurement_unit VARCHAR(10) NOT NULL,
        target_value DECIMAL(19, 4) NULL,
        target_direction VARCHAR(20) NULL,
        business_day_offset SMALLINT NULL,
        deadline_direction VARCHAR(10) NULL,
        reference_date_label NVARCHAR(100) NULL,
        numerator_label NVARCHAR(100) NULL,
        denominator_label NVARCHAR(100) NULL,
        value_label NVARCHAR(100) NULL,
        display_order INT NOT NULL
            CONSTRAINT DF_TM_kpis_display_order DEFAULT (0),
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_kpis_is_active DEFAULT (1),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_kpis_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        archived_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_kpis PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_kpis_id_owner UNIQUE (id, owner_user_id),
        CONSTRAINT FK_TM_kpis_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_kpis_name
            CHECK (LEN(LTRIM(RTRIM(name))) > 0),
        CONSTRAINT CK_TM_kpis_icon
            CHECK (LEN(LTRIM(RTRIM(icon_key))) > 0),
        CONSTRAINT CK_TM_kpis_color
            CHECK (color LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        CONSTRAINT CK_TM_kpis_method CHECK (
            calculation_method IN (
                'ON_TIME_RATE',
                'TASK_COMPLETION_RATE',
                'SUBTASK_COMPLETION_RATE',
                'MANUAL_RATIO',
                'MANUAL_NUMBER'
            )
        ),
        CONSTRAINT CK_TM_kpis_period
            CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'YEARLY')),
        CONSTRAINT CK_TM_kpis_unit
            CHECK (measurement_unit IN ('PERCENT', 'NUMBER')),
        CONSTRAINT CK_TM_kpis_method_unit CHECK (
            (calculation_method = 'MANUAL_NUMBER' AND measurement_unit = 'NUMBER')
            OR
            (calculation_method <> 'MANUAL_NUMBER' AND measurement_unit = 'PERCENT')
        ),
        CONSTRAINT CK_TM_kpis_target CHECK (
            (target_value IS NULL AND target_direction IS NULL)
            OR
            (
                target_value IS NOT NULL
                AND target_value >= 0
                AND target_direction IN ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER')
            )
        ),
        CONSTRAINT CK_TM_kpis_on_time_configuration CHECK (
            (
                calculation_method = 'ON_TIME_RATE'
                AND business_day_offset IS NOT NULL
                AND business_day_offset >= 0
                AND deadline_direction IN ('BEFORE', 'AFTER')
                AND reference_date_label IS NOT NULL
                AND LEN(LTRIM(RTRIM(reference_date_label))) > 0
            )
            OR
            (
                calculation_method <> 'ON_TIME_RATE'
                AND business_day_offset IS NULL
                AND deadline_direction IS NULL
                AND reference_date_label IS NULL
            )
        ),
        CONSTRAINT CK_TM_kpis_manual_labels CHECK (
            (
                calculation_method = 'MANUAL_RATIO'
                AND numerator_label IS NOT NULL
                AND LEN(LTRIM(RTRIM(numerator_label))) > 0
                AND denominator_label IS NOT NULL
                AND LEN(LTRIM(RTRIM(denominator_label))) > 0
                AND value_label IS NULL
            )
            OR
            (
                calculation_method = 'MANUAL_NUMBER'
                AND value_label IS NOT NULL
                AND LEN(LTRIM(RTRIM(value_label))) > 0
                AND numerator_label IS NULL
                AND denominator_label IS NULL
            )
            OR
            (
                calculation_method NOT IN ('MANUAL_RATIO', 'MANUAL_NUMBER')
                AND numerator_label IS NULL
                AND denominator_label IS NULL
                AND value_label IS NULL
            )
        ),
        CONSTRAINT CK_TM_kpis_display_order
            CHECK (display_order >= 0),
        CONSTRAINT CK_TM_kpis_archive_state
            CHECK (archived_at_utc IS NULL OR is_active = 0)
    );

    CREATE UNIQUE INDEX UX_TM_kpis_active_name_per_owner
        ON dbo.TM_kpis (owner_user_id, name)
        WHERE archived_at_utc IS NULL;

    CREATE INDEX IX_TM_kpis_owner_active_order
        ON dbo.TM_kpis (owner_user_id, is_active, display_order, id)
        INCLUDE (name, calculation_method, period_type, target_value, target_direction)
        WHERE archived_at_utc IS NULL;

    CREATE TABLE dbo.TM_tasks (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NOT NULL,
        list_id BIGINT NULL,
        kpi_id BIGINT NULL,
        title NVARCHAR(250) NOT NULL,
        description NVARCHAR(MAX) NULL,
        status VARCHAR(20) NOT NULL
            CONSTRAINT DF_TM_tasks_status DEFAULT ('TODO'),
        priority VARCHAR(10) NOT NULL
            CONSTRAINT DF_TM_tasks_priority DEFAULT ('MEDIUM'),
        start_date DATE NULL,
        due_date DATE NULL,
        reference_date DATE NULL,
        display_order INT NOT NULL
            CONSTRAINT DF_TM_tasks_display_order DEFAULT (0),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_tasks_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        completed_at_utc DATETIME2(3) NULL,
        cancelled_at_utc DATETIME2(3) NULL,
        cancellation_reason NVARCHAR(1000) NULL,
        deleted_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_tasks PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_tasks_id_owner UNIQUE (id, owner_user_id),
        CONSTRAINT FK_TM_tasks_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_tasks_list_owner
            FOREIGN KEY (list_id, owner_user_id)
            REFERENCES dbo.TM_lists (id, owner_user_id),
        CONSTRAINT FK_TM_tasks_kpi_owner
            FOREIGN KEY (kpi_id, owner_user_id)
            REFERENCES dbo.TM_kpis (id, owner_user_id),
        CONSTRAINT CK_TM_tasks_exactly_one_container CHECK (
            (list_id IS NOT NULL AND kpi_id IS NULL)
            OR
            (list_id IS NULL AND kpi_id IS NOT NULL)
        ),
        CONSTRAINT CK_TM_tasks_title
            CHECK (LEN(LTRIM(RTRIM(title))) > 0),
        CONSTRAINT CK_TM_tasks_status
            CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
        CONSTRAINT CK_TM_tasks_priority
            CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
        CONSTRAINT CK_TM_tasks_dates
            CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date),
        CONSTRAINT CK_TM_tasks_kpi_due_date
            CHECK (kpi_id IS NULL OR due_date IS NOT NULL),
        CONSTRAINT CK_TM_tasks_reference_date
            CHECK (reference_date IS NULL OR kpi_id IS NOT NULL),
        CONSTRAINT CK_TM_tasks_display_order
            CHECK (display_order >= 0),
        CONSTRAINT CK_TM_tasks_terminal_metadata CHECK (
            (
                status IN ('TODO', 'IN_PROGRESS')
                AND completed_at_utc IS NULL
                AND cancelled_at_utc IS NULL
                AND cancellation_reason IS NULL
            )
            OR
            (
                status = 'DONE'
                AND completed_at_utc IS NOT NULL
                AND cancelled_at_utc IS NULL
                AND cancellation_reason IS NULL
            )
            OR
            (
                status = 'CANCELLED'
                AND completed_at_utc IS NULL
                AND cancelled_at_utc IS NOT NULL
            )
        )
    );

    CREATE INDEX IX_TM_tasks_list_status_order
        ON dbo.TM_tasks (owner_user_id, list_id, status, display_order, id)
        INCLUDE (title, priority, due_date, completed_at_utc)
        WHERE list_id IS NOT NULL AND deleted_at_utc IS NULL;

    CREATE INDEX IX_TM_tasks_kpi_status_due_date
        ON dbo.TM_tasks (owner_user_id, kpi_id, status, due_date, id)
        INCLUDE (title, priority, reference_date, completed_at_utc)
        WHERE kpi_id IS NOT NULL AND deleted_at_utc IS NULL;

    CREATE INDEX IX_TM_tasks_owner_due_date
        ON dbo.TM_tasks (owner_user_id, due_date, status)
        INCLUDE (list_id, kpi_id, title, priority)
        WHERE deleted_at_utc IS NULL AND due_date IS NOT NULL;

    CREATE TABLE dbo.TM_subtasks (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        task_id BIGINT NOT NULL,
        owner_user_id INT NOT NULL,
        title NVARCHAR(250) NOT NULL,
        is_completed BIT NOT NULL
            CONSTRAINT DF_TM_subtasks_is_completed DEFAULT (0),
        due_date DATE NULL,
        display_order INT NOT NULL
            CONSTRAINT DF_TM_subtasks_display_order DEFAULT (0),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_subtasks_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        completed_at_utc DATETIME2(3) NULL,
        deleted_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_subtasks PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_subtasks_id_owner UNIQUE (id, owner_user_id),
        CONSTRAINT FK_TM_subtasks_task_owner
            FOREIGN KEY (task_id, owner_user_id)
            REFERENCES dbo.TM_tasks (id, owner_user_id),
        CONSTRAINT CK_TM_subtasks_title
            CHECK (LEN(LTRIM(RTRIM(title))) > 0),
        CONSTRAINT CK_TM_subtasks_display_order
            CHECK (display_order >= 0),
        CONSTRAINT CK_TM_subtasks_completion CHECK (
            (is_completed = 0 AND completed_at_utc IS NULL)
            OR
            (is_completed = 1 AND completed_at_utc IS NOT NULL)
        )
    );

    CREATE INDEX IX_TM_subtasks_task_order
        ON dbo.TM_subtasks (owner_user_id, task_id, display_order, id)
        INCLUDE (title, is_completed, due_date)
        WHERE deleted_at_utc IS NULL;

    CREATE TABLE dbo.TM_attachments (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_TM_attachments_id DEFAULT (NEWSEQUENTIALID()),
        owner_user_id INT NOT NULL,
        task_id BIGINT NULL,
        subtask_id BIGINT NULL,
        original_file_name NVARCHAR(260) NOT NULL,
        storage_key VARCHAR(500) NOT NULL,
        mime_type VARCHAR(255) NOT NULL,
        file_extension VARCHAR(20) NOT NULL,
        size_bytes BIGINT NOT NULL,
        uploaded_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_attachments_uploaded_at_utc DEFAULT (SYSUTCDATETIME()),
        deleted_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_attachments PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_attachments_storage_key UNIQUE (storage_key),
        CONSTRAINT FK_TM_attachments_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_attachments_task_owner
            FOREIGN KEY (task_id, owner_user_id)
            REFERENCES dbo.TM_tasks (id, owner_user_id),
        CONSTRAINT FK_TM_attachments_subtask_owner
            FOREIGN KEY (subtask_id, owner_user_id)
            REFERENCES dbo.TM_subtasks (id, owner_user_id),
        CONSTRAINT CK_TM_attachments_exactly_one_parent CHECK (
            (task_id IS NOT NULL AND subtask_id IS NULL)
            OR
            (task_id IS NULL AND subtask_id IS NOT NULL)
        ),
        CONSTRAINT CK_TM_attachments_name
            CHECK (LEN(LTRIM(RTRIM(original_file_name))) > 0),
        CONSTRAINT CK_TM_attachments_storage_key
            CHECK (LEN(LTRIM(RTRIM(storage_key))) > 0),
        CONSTRAINT CK_TM_attachments_mime_type
            CHECK (LEN(LTRIM(RTRIM(mime_type))) > 0),
        CONSTRAINT CK_TM_attachments_extension
            CHECK (LEN(LTRIM(RTRIM(file_extension))) > 0),
        CONSTRAINT CK_TM_attachments_size
            CHECK (size_bytes > 0 AND size_bytes <= 10485760)
    );

    CREATE INDEX IX_TM_attachments_task
        ON dbo.TM_attachments (owner_user_id, task_id, uploaded_at_utc, id)
        INCLUDE (original_file_name, mime_type, size_bytes)
        WHERE task_id IS NOT NULL AND deleted_at_utc IS NULL;

    CREATE INDEX IX_TM_attachments_subtask
        ON dbo.TM_attachments (owner_user_id, subtask_id, uploaded_at_utc, id)
        INCLUDE (original_file_name, mime_type, size_bytes)
        WHERE subtask_id IS NOT NULL AND deleted_at_utc IS NULL;

    CREATE TABLE dbo.TM_kpi_period_results (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        kpi_id BIGINT NOT NULL,
        owner_user_id INT NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        numerator_value DECIMAL(19, 4) NULL,
        denominator_value DECIMAL(19, 4) NULL,
        manual_value DECIMAL(19, 4) NULL,
        actual_value DECIMAL(19, 4) NULL,
        target_value_snapshot DECIMAL(19, 4) NULL,
        target_direction_snapshot VARCHAR(20) NULL,
        result_status VARCHAR(10) NOT NULL
            CONSTRAINT DF_TM_kpi_period_results_status DEFAULT ('NO_DATA'),
        is_finalized BIT NOT NULL
            CONSTRAINT DF_TM_kpi_period_results_finalized DEFAULT (0),
        calculated_at_utc DATETIME2(3) NULL,
        finalized_at_utc DATETIME2(3) NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_kpi_period_results_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_kpi_period_results PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_kpi_period_results_kpi_owner
            FOREIGN KEY (kpi_id, owner_user_id)
            REFERENCES dbo.TM_kpis (id, owner_user_id),
        CONSTRAINT UQ_TM_kpi_period_results_period
            UNIQUE (kpi_id, period_start, period_end),
        CONSTRAINT CK_TM_kpi_period_results_dates
            CHECK (period_start <= period_end),
        CONSTRAINT CK_TM_kpi_period_results_values CHECK (
            (numerator_value IS NULL OR numerator_value >= 0)
            AND (denominator_value IS NULL OR denominator_value > 0)
            AND (manual_value IS NULL OR manual_value >= 0)
            AND (actual_value IS NULL OR actual_value >= 0)
            AND (target_value_snapshot IS NULL OR target_value_snapshot >= 0)
        ),
        CONSTRAINT CK_TM_kpi_period_results_ratio_pair CHECK (
            (numerator_value IS NULL AND denominator_value IS NULL)
            OR
            (numerator_value IS NOT NULL AND denominator_value IS NOT NULL)
        ),
        CONSTRAINT CK_TM_kpi_period_results_target CHECK (
            (target_value_snapshot IS NULL AND target_direction_snapshot IS NULL)
            OR
            (
                target_value_snapshot IS NOT NULL
                AND target_direction_snapshot IN ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER')
            )
        ),
        CONSTRAINT CK_TM_kpi_period_results_status CHECK (
            result_status IN ('MET', 'NOT_MET', 'NO_TARGET', 'NO_DATA')
        ),
        CONSTRAINT CK_TM_kpi_period_results_status_value CHECK (
            (
                result_status = 'NO_DATA'
                AND actual_value IS NULL
            )
            OR
            (
                result_status = 'NO_TARGET'
                AND actual_value IS NOT NULL
                AND target_value_snapshot IS NULL
            )
            OR
            (
                result_status IN ('MET', 'NOT_MET')
                AND actual_value IS NOT NULL
                AND target_value_snapshot IS NOT NULL
            )
        ),
        CONSTRAINT CK_TM_kpi_period_results_finalization CHECK (
            (is_finalized = 0 AND finalized_at_utc IS NULL)
            OR
            (is_finalized = 1 AND finalized_at_utc IS NOT NULL)
        )
    );

    CREATE INDEX IX_TM_kpi_period_results_owner_period
        ON dbo.TM_kpi_period_results (owner_user_id, period_start DESC, period_end DESC)
        INCLUDE (kpi_id, actual_value, target_value_snapshot, result_status, is_finalized);

    CREATE TABLE dbo.TM_holidays (
        id INT IDENTITY(1, 1) NOT NULL,
        holiday_date DATE NOT NULL,
        name_ar NVARCHAR(150) NOT NULL,
        name_en NVARCHAR(150) NOT NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_holidays_is_active DEFAULT (1),
        created_by_user_id INT NOT NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_holidays_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_by_user_id INT NULL,
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_holidays PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_holidays_date UNIQUE (holiday_date),
        CONSTRAINT FK_TM_holidays_created_by
            FOREIGN KEY (created_by_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_holidays_updated_by
            FOREIGN KEY (updated_by_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_holidays_names CHECK (
            LEN(LTRIM(RTRIM(name_ar))) > 0
            AND LEN(LTRIM(RTRIM(name_en))) > 0
        )
    );

    CREATE INDEX IX_TM_holidays_active_date
        ON dbo.TM_holidays (is_active, holiday_date)
        INCLUDE (name_ar, name_en);

    CREATE TABLE dbo.TM_task_activity (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        task_id BIGINT NOT NULL,
        owner_user_id INT NOT NULL,
        actor_user_id INT NOT NULL,
        activity_type VARCHAR(50) NOT NULL,
        event_data_json NVARCHAR(MAX) NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_task_activity_created_at_utc DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_TM_task_activity PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_task_activity_task_owner
            FOREIGN KEY (task_id, owner_user_id)
            REFERENCES dbo.TM_tasks (id, owner_user_id),
        CONSTRAINT FK_TM_task_activity_actor
            FOREIGN KEY (actor_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_task_activity_type
            CHECK (LEN(LTRIM(RTRIM(activity_type))) > 0),
        CONSTRAINT CK_TM_task_activity_private_actor
            CHECK (actor_user_id = owner_user_id),
        CONSTRAINT CK_TM_task_activity_event_data
            CHECK (event_data_json IS NULL OR ISJSON(event_data_json) = 1)
    );

    CREATE INDEX IX_TM_task_activity_task_created
        ON dbo.TM_task_activity (owner_user_id, task_id, created_at_utc, id)
        INCLUDE (activity_type, actor_user_id);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
