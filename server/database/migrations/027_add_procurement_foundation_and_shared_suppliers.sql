SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
        THROW 52701, 'Required TaskHub access table dbo.TM_user_access does not exist.', 1;

    IF OBJECT_ID(N'dbo.TM_contracts', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_contract_suppliers', N'U') IS NULL
        THROW 52702, 'Required Contracts tables do not exist.', 1;

    IF OBJECT_ID(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'U') IS NULL
        THROW 52703, 'Shared Supplier table [QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT] must exist before this migration is applied.', 1;

    IF COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'SUPPLIER_ID') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'SUPPLIER_CODE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'MANUAL_FILE_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'SUPPLIER_NAME') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'SUPPLIER_NAME_S') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'TAX_REGISTRATION_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'COUNTRY_NAME') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'CITY_NAME') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'CURRENCY') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'CONTACT_JOB_TEL') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'EXTENSION_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'MOBILE_NO') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'HOME_PHONE') IS NULL
       OR COL_LENGTH(N'QNHDB.dbo.TM_APS_SUPPLIERS_IMPORT', N'EMAIL') IS NULL
        THROW 52704, '[QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT] is missing one or more required Supplier columns for Procurement Phase 1.', 1;

    IF EXISTS (
        SELECT 1
        FROM [QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT]
        GROUP BY SUPPLIER_ID
        HAVING COUNT_BIG(1) > 1
    )
        THROW 52705, '[QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT] contains duplicate SUPPLIER_ID values. Fix the source table before applying this migration.', 1;

    /* -----------------------------------------------------------------
       Procurement module access
       ----------------------------------------------------------------- */
    IF COL_LENGTH(N'dbo.TM_user_access', N'procurement_enabled') IS NULL
    BEGIN
        ALTER TABLE dbo.TM_user_access
            ADD procurement_enabled BIT NOT NULL
                CONSTRAINT DF_TM_user_access_procurement_enabled DEFAULT (0);
    END;

    IF COL_LENGTH(N'dbo.TM_user_access', N'contracts_enabled') IS NOT NULL
    BEGIN
        /*
           procurement_enabled may have been added immediately above. SQL Server
           compiles ordinary statements in this outer batch before the ALTER TABLE
           has taken effect, so referencing the newly added column directly here can
           raise Msg 207. Compile the backfill only after the ALTER has executed.
        */
        EXEC sys.sp_executesql N'
            UPDATE dbo.TM_user_access
            SET procurement_enabled = contracts_enabled
            WHERE procurement_enabled <> contracts_enabled;
        ';
    END;

    /* -----------------------------------------------------------------
       Shared Procurement activity log
       ----------------------------------------------------------------- */
    IF OBJECT_ID(N'dbo.TM_procurement_activity', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.TM_procurement_activity (
            id BIGINT IDENTITY(1, 1) NOT NULL,
            entity_type VARCHAR(30) NOT NULL,
            entity_key NVARCHAR(120) NOT NULL,
            owner_user_id INT NULL,
            action_type VARCHAR(30) NOT NULL,
            actor_user_id INT NOT NULL,
            before_values NVARCHAR(MAX) NULL,
            after_values NVARCHAR(MAX) NULL,
            created_at_utc DATETIME2(3) NOT NULL
                CONSTRAINT DF_TM_procurement_activity_created_at_utc DEFAULT (SYSUTCDATETIME()),

            CONSTRAINT PK_TM_procurement_activity PRIMARY KEY CLUSTERED (id),
            CONSTRAINT FK_TM_procurement_activity_actor
                FOREIGN KEY (actor_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
            CONSTRAINT FK_TM_procurement_activity_owner
                FOREIGN KEY (owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
            CONSTRAINT CK_TM_procurement_activity_entity_type
                CHECK (entity_type IN ('SUPPLIER', 'ITEM', 'PRICE_QUOTE')),
            CONSTRAINT CK_TM_procurement_activity_action_type
                CHECK (action_type IN ('CREATED', 'UPDATED', 'DEACTIVATED', 'REACTIVATED')),
            CONSTRAINT CK_TM_procurement_activity_before_json
                CHECK (before_values IS NULL OR ISJSON(before_values) = 1),
            CONSTRAINT CK_TM_procurement_activity_after_json
                CHECK (after_values IS NULL OR ISJSON(after_values) = 1)
        );

        CREATE INDEX IX_TM_procurement_activity_entity_created
            ON dbo.TM_procurement_activity (entity_type, entity_key, created_at_utc DESC, id DESC)
            INCLUDE (owner_user_id, action_type, actor_user_id);

        CREATE INDEX IX_TM_procurement_activity_actor_created
            ON dbo.TM_procurement_activity (actor_user_id, created_at_utc DESC, id DESC)
            INCLUDE (entity_type, entity_key, action_type);
    END;

    /* -----------------------------------------------------------------
       Convert Contract Supplier references from the former private
       TM_contract_suppliers identity to the shared [QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT]
       SUPPLIER_ID.

       Existing legacy Supplier rows are deliberately retained in
       TM_contract_suppliers so legacy-only fields are not destroyed.
       ----------------------------------------------------------------- */
    CREATE TABLE #SupplierMap (
        legacy_supplier_id BIGINT NOT NULL PRIMARY KEY,
        shared_supplier_id BIGINT NOT NULL
    );

    /* Exact, unambiguous existing shared-name match. */
    INSERT INTO #SupplierMap (legacy_supplier_id, shared_supplier_id)
    SELECT
        legacy.id,
        MIN(CONVERT(BIGINT, shared.SUPPLIER_ID))
    FROM dbo.TM_contract_suppliers AS legacy
    INNER JOIN [QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT] AS shared
        ON LTRIM(RTRIM(CONVERT(NVARCHAR(250), shared.SUPPLIER_NAME))) = LTRIM(RTRIM(legacy.name))
    GROUP BY legacy.id
    HAVING COUNT_BIG(1) = 1;

    /*
       Any private legacy Supplier without one unambiguous shared match is
       copied into the shared master as a clearly manual Supplier. Negative
       SUPPLIER_ID values form the reserved TaskHub namespace and cannot
       collide with normal positive Oracle/CarWare IDs.
    */
    DECLARE @CurrentMinimumManualSupplierId BIGINT =
        COALESCE((
            SELECT MIN(CONVERT(BIGINT, SUPPLIER_ID))
            FROM [QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT]
            WHERE CONVERT(BIGINT, SUPPLIER_ID) < 0
        ), 0);

    CREATE TABLE #ManualSupplierMap (
        legacy_supplier_id BIGINT NOT NULL PRIMARY KEY,
        shared_supplier_id BIGINT NOT NULL,
        supplier_code NVARCHAR(80) NOT NULL
    );

    INSERT INTO #ManualSupplierMap (legacy_supplier_id, shared_supplier_id, supplier_code)
    SELECT
        legacy.id,
        @CurrentMinimumManualSupplierId - ROW_NUMBER() OVER (ORDER BY legacy.id),
        N'USR-SUP-' + RIGHT(
            N'000000' + CONVERT(NVARCHAR(30), ABS(@CurrentMinimumManualSupplierId - ROW_NUMBER() OVER (ORDER BY legacy.id))),
            6
        )
    FROM dbo.TM_contract_suppliers AS legacy
    WHERE NOT EXISTS (
        SELECT 1
        FROM #SupplierMap AS mapped
        WHERE mapped.legacy_supplier_id = legacy.id
    );

    IF EXISTS (SELECT 1 FROM #ManualSupplierMap)
    BEGIN
        INSERT INTO [QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT] (
            SUPPLIER_ID,
            SUPPLIER_CODE,
            MANUAL_FILE_NO,
            SUPPLIER_NAME,
            SUPPLIER_NAME_S,
            TAX_REGISTRATION_NO,
            COUNTRY_NAME,
            CITY_NAME,
            CURRENCY,
            CONTACT_JOB_TEL,
            EXTENSION_NO,
            MOBILE_NO,
            HOME_PHONE,
            EMAIL
        )
        SELECT
            manual.shared_supplier_id,
            manual.supplier_code,
            NULL,
            legacy.name,
            legacy.name,
            legacy.tax_number,
            NULL,
            NULL,
            NULL,
            legacy.primary_contact_phone,
            NULL,
            legacy.primary_contact_phone,
            NULL,
            legacy.primary_contact_email
        FROM #ManualSupplierMap AS manual
        INNER JOIN dbo.TM_contract_suppliers AS legacy
            ON legacy.id = manual.legacy_supplier_id;

        INSERT INTO #SupplierMap (legacy_supplier_id, shared_supplier_id)
        SELECT legacy_supplier_id, shared_supplier_id
        FROM #ManualSupplierMap;
    END;

    IF EXISTS (
        SELECT 1
        FROM dbo.TM_contracts AS contract
        WHERE NOT EXISTS (
            SELECT 1
            FROM #SupplierMap AS mapped
            WHERE mapped.legacy_supplier_id = contract.supplier_id
        )
    )
        THROW 52706, 'One or more existing Contracts could not be mapped to a shared Supplier.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_contracts')
          AND name = N'FK_TM_contracts_supplier_owner'
    )
    BEGIN
        ALTER TABLE dbo.TM_contracts
            DROP CONSTRAINT FK_TM_contracts_supplier_owner;
    END;

    UPDATE contract
    SET supplier_id = mapped.shared_supplier_id
    FROM dbo.TM_contracts AS contract
    INNER JOIN #SupplierMap AS mapped
        ON mapped.legacy_supplier_id = contract.supplier_id;

    IF EXISTS (
        SELECT 1
        FROM dbo.TM_contracts AS contract
        LEFT JOIN [QNHDB].[dbo].[TM_APS_SUPPLIERS_IMPORT] AS supplier
            ON CONVERT(BIGINT, supplier.SUPPLIER_ID) = contract.supplier_id
        WHERE supplier.SUPPLIER_ID IS NULL
    )
        THROW 52707, 'Shared Supplier migration validation failed for one or more Contracts.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
