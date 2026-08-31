SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
        THROW 51501, 'Required TaskHub access table dbo.TM_user_access does not exist.', 1;

    IF COL_LENGTH(N'dbo.TM_user_access', N'contracts_enabled') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_contract_suppliers', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_contracts', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_contract_user_settings', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_contract_activity', N'U') IS NOT NULL
    BEGIN
        THROW 51502, 'Contracts core schema already exists. Migration was not applied.', 1;
    END;

    ALTER TABLE dbo.TM_user_access
        ADD contracts_enabled BIT NOT NULL
            CONSTRAINT DF_TM_user_access_contracts_enabled DEFAULT (0);

    CREATE TABLE dbo.TM_contract_suppliers (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NOT NULL,
        name NVARCHAR(250) NOT NULL,
        commercial_registration_no NVARCHAR(80) NULL,
        tax_number NVARCHAR(80) NULL,
        primary_contact_name NVARCHAR(200) NULL,
        primary_contact_email NVARCHAR(320) NULL,
        primary_contact_phone NVARCHAR(50) NULL,
        address_text NVARCHAR(1000) NULL,
        notes NVARCHAR(MAX) NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_contract_suppliers_is_active DEFAULT (1),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_contract_suppliers_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_contract_suppliers PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_contract_suppliers_id_owner UNIQUE (id, owner_user_id),
        CONSTRAINT FK_TM_contract_suppliers_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_contract_suppliers_name
            CHECK (LEN(LTRIM(RTRIM(name))) > 0)
    );

    CREATE UNIQUE INDEX UX_TM_contract_suppliers_name_per_owner
        ON dbo.TM_contract_suppliers (owner_user_id, name);

    CREATE INDEX IX_TM_contract_suppliers_owner_active_name
        ON dbo.TM_contract_suppliers (owner_user_id, is_active, name, id)
        INCLUDE (
            commercial_registration_no,
            tax_number,
            primary_contact_name,
            primary_contact_email,
            primary_contact_phone
        );

    CREATE TABLE dbo.TM_contracts (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NOT NULL,
        supplier_id BIGINT NOT NULL,
        contract_number NVARCHAR(120) NULL,
        title NVARCHAR(250) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        is_auto_renewal BIT NOT NULL
            CONSTRAINT DF_TM_contracts_is_auto_renewal DEFAULT (0),
        renewal_term_months INT NULL,
        notice_period_days INT NULL,
        value_type VARCHAR(20) NOT NULL,
        contract_value_sar DECIMAL(19, 2) NULL,
        payment_frequency VARCHAR(20) NULL,
        payment_timing VARCHAR(20) NULL,
        notes NVARCHAR(MAX) NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_contracts_is_active DEFAULT (1),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_contracts_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_contracts PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_contracts_id_owner UNIQUE (id, owner_user_id),
        CONSTRAINT FK_TM_contracts_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_contracts_supplier_owner
            FOREIGN KEY (supplier_id, owner_user_id)
            REFERENCES dbo.TM_contract_suppliers (id, owner_user_id),
        CONSTRAINT CK_TM_contracts_title
            CHECK (LEN(LTRIM(RTRIM(title))) > 0),
        CONSTRAINT CK_TM_contracts_dates
            CHECK (end_date IS NULL OR end_date >= start_date),
        CONSTRAINT CK_TM_contracts_auto_renewal CHECK (
            (
                is_auto_renewal = 0
                AND renewal_term_months IS NULL
                AND notice_period_days IS NULL
            )
            OR
            (
                is_auto_renewal = 1
                AND end_date IS NOT NULL
                AND renewal_term_months IS NOT NULL
                AND renewal_term_months > 0
                AND notice_period_days IS NOT NULL
                AND notice_period_days > 0
            )
        ),
        CONSTRAINT CK_TM_contracts_value_type
            CHECK (value_type IN ('FIXED', 'VARIABLE')),
        CONSTRAINT CK_TM_contracts_value CHECK (
            (value_type = 'FIXED' AND contract_value_sar IS NOT NULL AND contract_value_sar >= 0)
            OR
            (value_type = 'VARIABLE' AND contract_value_sar IS NULL)
        ),
        CONSTRAINT CK_TM_contracts_payment_frequency CHECK (
            payment_frequency IS NULL
            OR payment_frequency IN ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL')
        ),
        CONSTRAINT CK_TM_contracts_payment_timing CHECK (
            payment_timing IS NULL
            OR payment_timing IN ('IN_ADVANCE', 'IN_ARREARS')
        )
    );

    CREATE INDEX IX_TM_contracts_owner_active_end_date
        ON dbo.TM_contracts (owner_user_id, is_active, end_date, id)
        INCLUDE (
            supplier_id,
            title,
            contract_number,
            start_date,
            is_auto_renewal,
            notice_period_days,
            value_type,
            contract_value_sar,
            payment_frequency,
            payment_timing
        );

    CREATE INDEX IX_TM_contracts_owner_supplier
        ON dbo.TM_contracts (owner_user_id, supplier_id, is_active, id)
        INCLUDE (title, contract_number, start_date, end_date, is_auto_renewal);

    CREATE INDEX IX_TM_contracts_owner_auto_renewal_end_date
        ON dbo.TM_contracts (owner_user_id, is_auto_renewal, end_date, is_active, id)
        INCLUDE (title, supplier_id, notice_period_days);

    CREATE TABLE dbo.TM_contract_user_settings (
        owner_user_id INT NOT NULL,
        expiring_soon_days INT NOT NULL
            CONSTRAINT DF_TM_contract_user_settings_expiring_soon_days DEFAULT (90),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_contract_user_settings_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_contract_user_settings PRIMARY KEY CLUSTERED (owner_user_id),
        CONSTRAINT FK_TM_contract_user_settings_owner
            FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_contract_user_settings_expiring_soon_days
            CHECK (expiring_soon_days BETWEEN 1 AND 365)
    );

    CREATE TABLE dbo.TM_contract_activity (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NOT NULL,
        contract_id BIGINT NOT NULL,
        activity_type VARCHAR(30) NOT NULL,
        changes_json NVARCHAR(MAX) NULL,
        actor_user_id INT NOT NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_contract_activity_created_at_utc DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_TM_contract_activity PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_contract_activity_contract_owner
            FOREIGN KEY (contract_id, owner_user_id)
            REFERENCES dbo.TM_contracts (id, owner_user_id),
        CONSTRAINT FK_TM_contract_activity_actor
            FOREIGN KEY (actor_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_contract_activity_private_actor
            CHECK (actor_user_id = owner_user_id),
        CONSTRAINT CK_TM_contract_activity_type
            CHECK (activity_type IN ('CREATED', 'UPDATED', 'ARCHIVED', 'RESTORED')),
        CONSTRAINT CK_TM_contract_activity_json
            CHECK (changes_json IS NULL OR ISJSON(changes_json) = 1)
    );

    CREATE INDEX IX_TM_contract_activity_owner_contract_created
        ON dbo.TM_contract_activity (owner_user_id, contract_id, created_at_utc DESC, id DESC)
        INCLUDE (activity_type, actor_user_id);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
