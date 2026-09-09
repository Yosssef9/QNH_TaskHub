USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. Validate the legacy access foundation and clean cutover
       ============================================================ */
    IF OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
        THROW 53401, 'TM_user_access must exist before applying migration 034.', 1;

    IF COL_LENGTH(N'dbo.TM_user_access', N'procurement_enabled') IS NULL
        THROW 53402, 'TM_user_access.procurement_enabled is required for the one-time permission migration.', 1;

    IF OBJECT_ID(N'dbo.TM_access_permissions', N'U') IS NOT NULL
        THROW 53403, 'TM_access_permissions already exists. Migration 034 was not applied.', 1;

    /* ============================================================
       2. Create the single feature/delegation permission source
       ============================================================ */
    CREATE TABLE dbo.TM_access_permissions (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        grantee_user_id INT NOT NULL,
        module_code VARCHAR(40) NOT NULL,
        entity_code VARCHAR(40) NOT NULL,
        permission_code VARCHAR(40) NOT NULL,
        resource_owner_user_id INT NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_access_permissions_is_active DEFAULT (1),
        granted_by_user_id INT NULL,
        granted_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_access_permissions_granted_at_utc DEFAULT (SYSUTCDATETIME()),
        revoked_by_user_id INT NULL,
        revoked_at_utc DATETIME2(3) NULL,
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_access_permissions PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_access_permissions_grantee
            FOREIGN KEY (grantee_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_access_permissions_resource_owner
            FOREIGN KEY (resource_owner_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_access_permissions_granted_by
            FOREIGN KEY (granted_by_user_id) REFERENCES dbo.users (USER_ID),
        CONSTRAINT FK_TM_access_permissions_revoked_by
            FOREIGN KEY (revoked_by_user_id) REFERENCES dbo.users (USER_ID),
        CONSTRAINT CK_TM_access_permissions_supported_module
            CHECK (module_code = 'PROCUREMENT'),
        CONSTRAINT CK_TM_access_permissions_supported_entity
            CHECK (entity_code IN ('CONTRACTS', 'ITEMS', 'SUPPLIERS', 'PRICE_QUOTES')),
        CONSTRAINT CK_TM_access_permissions_shape
            CHECK (
                (
                    permission_code = 'ACCESS'
                    AND resource_owner_user_id IS NULL
                )
                OR
                (
                    entity_code = 'CONTRACTS'
                    AND permission_code IN ('VIEW', 'MANAGE_ATTACHMENTS')
                    AND resource_owner_user_id IS NOT NULL
                    AND resource_owner_user_id <> grantee_user_id
                )
            ),
        CONSTRAINT CK_TM_access_permissions_lifecycle
            CHECK (
                (is_active = 1 AND revoked_by_user_id IS NULL AND revoked_at_utc IS NULL)
                OR
                (is_active = 0 AND revoked_by_user_id IS NOT NULL AND revoked_at_utc IS NOT NULL)
            )
    );

    CREATE UNIQUE INDEX UX_TM_access_permissions_feature
        ON dbo.TM_access_permissions (
            grantee_user_id,
            module_code,
            entity_code,
            permission_code
        )
        WHERE resource_owner_user_id IS NULL;

    CREATE UNIQUE INDEX UX_TM_access_permissions_owner_scope
        ON dbo.TM_access_permissions (
            grantee_user_id,
            module_code,
            entity_code,
            permission_code,
            resource_owner_user_id
        )
        WHERE resource_owner_user_id IS NOT NULL;

    CREATE INDEX IX_TM_access_permissions_active_lookup
        ON dbo.TM_access_permissions (
            grantee_user_id,
            module_code,
            entity_code,
            permission_code,
            is_active
        )
        INCLUDE (resource_owner_user_id);

    CREATE INDEX IX_TM_access_permissions_owner_lookup
        ON dbo.TM_access_permissions (
            resource_owner_user_id,
            module_code,
            entity_code,
            permission_code,
            is_active
        )
        INCLUDE (grantee_user_id);

    /* ============================================================
       3. Preserve every legacy Procurement-enabled user

       The old module flag granted all four Procurement destinations,
       so migration 034 converts it to four ACCESS rows.
       ============================================================ */
    DECLARE @legacy_procurement_users BIGINT;
    SELECT @legacy_procurement_users = COUNT_BIG(1)
    FROM dbo.TM_user_access
    WHERE procurement_enabled = 1;

    INSERT INTO dbo.TM_access_permissions (
        grantee_user_id,
        module_code,
        entity_code,
        permission_code,
        resource_owner_user_id,
        is_active,
        granted_by_user_id,
        granted_at_utc
    )
    SELECT
        access.portal_user_id,
        'PROCUREMENT',
        entities.entity_code,
        'ACCESS',
        NULL,
        1,
        access.granted_by_user_id,
        access.granted_at_utc
    FROM dbo.TM_user_access AS access
    CROSS JOIN (
        VALUES
            ('CONTRACTS'),
            ('ITEMS'),
            ('SUPPLIERS'),
            ('PRICE_QUOTES')
    ) AS entities(entity_code)
    WHERE access.procurement_enabled = 1;

    DECLARE @seeded_procurement_permissions BIGINT;
    SELECT @seeded_procurement_permissions = COUNT_BIG(1)
    FROM dbo.TM_access_permissions
    WHERE module_code = 'PROCUREMENT'
      AND permission_code = 'ACCESS'
      AND resource_owner_user_id IS NULL
      AND is_active = 1;

    IF @seeded_procurement_permissions <> (@legacy_procurement_users * 4)
        THROW 53404, 'Procurement permission seeding did not preserve the expected legacy access rows.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.TM_user_access AS legacy
        WHERE legacy.procurement_enabled = 1
          AND EXISTS (
              SELECT entity_code
              FROM (VALUES ('CONTRACTS'), ('ITEMS'), ('SUPPLIERS'), ('PRICE_QUOTES')) AS expected(entity_code)
              EXCEPT
              SELECT permission.entity_code
              FROM dbo.TM_access_permissions AS permission
              WHERE permission.grantee_user_id = legacy.portal_user_id
                AND permission.module_code = 'PROCUREMENT'
                AND permission.permission_code = 'ACCESS'
                AND permission.resource_owner_user_id IS NULL
                AND permission.is_active = 1
          )
    )
        THROW 53405, 'At least one legacy Procurement user is missing a migrated submodule permission.', 1;

    /* ============================================================
       4. Allow delegated users to be the real Contract action actor
       ============================================================ */
    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_contract_activity')
          AND name = N'CK_TM_contract_activity_private_actor'
    )
        ALTER TABLE dbo.TM_contract_activity
            DROP CONSTRAINT CK_TM_contract_activity_private_actor;

    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_contract_attachments')
          AND name = N'CK_TM_contract_attachments_private_uploader'
    )
        ALTER TABLE dbo.TM_contract_attachments
            DROP CONSTRAINT CK_TM_contract_attachments_private_uploader;

    /* ============================================================
       5. Remove defaults attached to obsolete legacy columns
       ============================================================ */
    DECLARE @drop_defaults NVARCHAR(MAX) = N'';

    SELECT @drop_defaults = @drop_defaults +
        N'ALTER TABLE dbo.TM_user_access DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';' + CHAR(13)
    FROM sys.default_constraints AS dc
    INNER JOIN sys.columns AS column_info
        ON column_info.object_id = dc.parent_object_id
       AND column_info.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.TM_user_access')
      AND column_info.name IN (N'procurement_enabled', N'contracts_enabled');

    IF LEN(@drop_defaults) > 0
        EXEC sys.sp_executesql @drop_defaults;

    /* Unexpected non-default dependencies should stop the transaction
       rather than silently removing application-owned indexes/constraints. */
    IF EXISTS (
        SELECT 1
        FROM sys.index_columns AS ic
        INNER JOIN sys.columns AS column_info
            ON column_info.object_id = ic.object_id
           AND column_info.column_id = ic.column_id
        INNER JOIN sys.indexes AS index_info
            ON index_info.object_id = ic.object_id
           AND index_info.index_id = ic.index_id
        WHERE ic.object_id = OBJECT_ID(N'dbo.TM_user_access')
          AND column_info.name IN (N'procurement_enabled', N'contracts_enabled')
          AND index_info.is_hypothetical = 0
    )
        THROW 53406, 'An index still depends on procurement_enabled/contracts_enabled. Review it before applying migration 034.', 1;

    /* ============================================================
       6. Clean cutover: remove both legacy permission columns
       ============================================================ */
    ALTER TABLE dbo.TM_user_access DROP COLUMN procurement_enabled;

    IF COL_LENGTH(N'dbo.TM_user_access', N'contracts_enabled') IS NOT NULL
        ALTER TABLE dbo.TM_user_access DROP COLUMN contracts_enabled;

    IF COL_LENGTH(N'dbo.TM_user_access', N'procurement_enabled') IS NOT NULL
       OR COL_LENGTH(N'dbo.TM_user_access', N'contracts_enabled') IS NOT NULL
        THROW 53407, 'Legacy Procurement/Contracts permission columns were not fully removed.', 1;

    COMMIT TRANSACTION;
    PRINT 'TaskHub access-permission and Contract delegation migration 034 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
