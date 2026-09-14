USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_access_permissions', N'U') IS NULL
        THROW 53901, 'TM_access_permissions must exist before applying migration 039.', 1;

    /*
      KPI + Work Cycles intentionally share one feature permission:
        module_code     = KPI_MANAGEMENT
        entity_code     = KPI_WORK_CYCLES
        permission_code = ACCESS
        resource owner  = NULL

      No users are backfilled. The approved behavior is opt-in access;
      Tasks and basic Meetings remain available through their existing rules.
    */

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_access_permissions')
          AND name = N'CK_TM_access_permissions_shape'
    )
        ALTER TABLE dbo.TM_access_permissions DROP CONSTRAINT CK_TM_access_permissions_shape;

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_access_permissions')
          AND name = N'CK_TM_access_permissions_supported_entity'
    )
        ALTER TABLE dbo.TM_access_permissions DROP CONSTRAINT CK_TM_access_permissions_supported_entity;

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_access_permissions')
          AND name = N'CK_TM_access_permissions_supported_module'
    )
        ALTER TABLE dbo.TM_access_permissions DROP CONSTRAINT CK_TM_access_permissions_supported_module;

    ALTER TABLE dbo.TM_access_permissions WITH CHECK
        ADD CONSTRAINT CK_TM_access_permissions_supported_module
        CHECK (module_code IN ('PROCUREMENT', 'KPI_MANAGEMENT'));

    ALTER TABLE dbo.TM_access_permissions WITH CHECK
        ADD CONSTRAINT CK_TM_access_permissions_supported_entity
        CHECK (
            (module_code = 'PROCUREMENT' AND entity_code IN ('CONTRACTS', 'ITEMS', 'SUPPLIERS', 'PRICE_QUOTES'))
            OR
            (module_code = 'KPI_MANAGEMENT' AND entity_code = 'KPI_WORK_CYCLES')
        );

    ALTER TABLE dbo.TM_access_permissions WITH CHECK
        ADD CONSTRAINT CK_TM_access_permissions_shape
        CHECK (
            (
                module_code = 'PROCUREMENT'
                AND (
                    (permission_code = 'ACCESS' AND resource_owner_user_id IS NULL)
                    OR
                    (
                        entity_code = 'CONTRACTS'
                        AND permission_code IN ('VIEW', 'MANAGE_ATTACHMENTS')
                        AND resource_owner_user_id IS NOT NULL
                        AND resource_owner_user_id <> grantee_user_id
                    )
                )
            )
            OR
            (
                module_code = 'KPI_MANAGEMENT'
                AND entity_code = 'KPI_WORK_CYCLES'
                AND permission_code = 'ACCESS'
                AND resource_owner_user_id IS NULL
            )
        );

    ALTER TABLE dbo.TM_access_permissions CHECK CONSTRAINT CK_TM_access_permissions_supported_module;
    ALTER TABLE dbo.TM_access_permissions CHECK CONSTRAINT CK_TM_access_permissions_supported_entity;
    ALTER TABLE dbo.TM_access_permissions CHECK CONSTRAINT CK_TM_access_permissions_shape;

    COMMIT TRANSACTION;
    PRINT 'TaskHub KPI + Work Cycles access permission migration 039 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
