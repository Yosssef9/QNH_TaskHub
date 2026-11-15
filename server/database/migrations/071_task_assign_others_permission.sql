USE [QNHDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_access_permissions', N'U') IS NULL
    THROW 57101, 'Migration 034/039 must be applied before migration 071.', 1;
  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.TM_access_permissions')
      AND name = N'CK_TM_access_permissions_supported_module' AND definition LIKE '%TASK_MANAGEMENT%')
    THROW 57102, 'Migration 071 has already been applied.', 1;

  ALTER TABLE dbo.TM_access_permissions DROP CONSTRAINT CK_TM_access_permissions_shape;
  ALTER TABLE dbo.TM_access_permissions DROP CONSTRAINT CK_TM_access_permissions_supported_entity;
  ALTER TABLE dbo.TM_access_permissions DROP CONSTRAINT CK_TM_access_permissions_supported_module;

  ALTER TABLE dbo.TM_access_permissions WITH CHECK ADD CONSTRAINT CK_TM_access_permissions_supported_module
    CHECK (module_code IN ('PROCUREMENT', 'KPI_MANAGEMENT', 'TASK_MANAGEMENT'));
  ALTER TABLE dbo.TM_access_permissions WITH CHECK ADD CONSTRAINT CK_TM_access_permissions_supported_entity
    CHECK ((module_code = 'PROCUREMENT' AND entity_code IN ('CONTRACTS', 'ITEMS', 'SUPPLIERS', 'PRICE_QUOTES'))
        OR (module_code = 'KPI_MANAGEMENT' AND entity_code = 'KPI_WORK_CYCLES')
        OR (module_code = 'TASK_MANAGEMENT' AND entity_code = 'TASK_ASSIGNMENTS'));
  ALTER TABLE dbo.TM_access_permissions WITH CHECK ADD CONSTRAINT CK_TM_access_permissions_shape
    CHECK ((module_code = 'PROCUREMENT' AND ((permission_code = 'ACCESS' AND resource_owner_user_id IS NULL)
           OR (entity_code = 'CONTRACTS' AND permission_code IN ('VIEW','MANAGE_ATTACHMENTS')
               AND resource_owner_user_id IS NOT NULL AND resource_owner_user_id <> grantee_user_id)))
        OR (module_code = 'KPI_MANAGEMENT' AND entity_code = 'KPI_WORK_CYCLES'
            AND permission_code = 'ACCESS' AND resource_owner_user_id IS NULL)
        OR (module_code = 'TASK_MANAGEMENT' AND entity_code = 'TASK_ASSIGNMENTS'
            AND permission_code = 'TASK_ASSIGN_OTHERS' AND resource_owner_user_id IS NULL));
  ALTER TABLE dbo.TM_access_permissions CHECK CONSTRAINT CK_TM_access_permissions_supported_module;
  ALTER TABLE dbo.TM_access_permissions CHECK CONSTRAINT CK_TM_access_permissions_supported_entity;
  ALTER TABLE dbo.TM_access_permissions CHECK CONSTRAINT CK_TM_access_permissions_shape;
  -- Intentionally do not grant existing regular users. ADMIN role is authorized via the API.
  COMMIT TRANSACTION;
  PRINT 'Migration 071 complete. TASK_ASSIGN_OTHERS defaults to denied for regular users.';
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
