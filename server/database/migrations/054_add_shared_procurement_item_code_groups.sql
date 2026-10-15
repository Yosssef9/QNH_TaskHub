SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Run manually against the TaskHub application database (the same DB as
-- dbo.TM_procurement_saved_views). Do not run against the Oracle source.
BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.TM_procurement_saved_views', N'U') IS NULL
    THROW 52854, 'Apply the TaskHub Procurement Saved Views migration before item code groups.', 1;

  IF OBJECT_ID(N'dbo.TM_procurement_item_code_groups', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.TM_procurement_item_code_groups (
      id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TM_procurement_item_code_groups PRIMARY KEY,
      group_name NVARCHAR(120) NOT NULL,
      code_prefix VARCHAR(20) NOT NULL,
      created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_procurement_item_code_groups_created DEFAULT SYSUTCDATETIME(),
      updated_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_procurement_item_code_groups_updated DEFAULT SYSUTCDATETIME(),
      row_version ROWVERSION NOT NULL,
      CONSTRAINT CK_TM_procurement_item_code_groups_name CHECK (LEN(LTRIM(RTRIM(group_name))) BETWEEN 1 AND 120),
      CONSTRAINT CK_TM_procurement_item_code_groups_prefix CHECK (
        LEN(code_prefix) BETWEEN 2 AND 20
        AND code_prefix NOT LIKE '%[^0-9]%' COLLATE Latin1_General_BIN2
      )
    );
    CREATE UNIQUE INDEX UX_TM_procurement_item_code_groups_name
      ON dbo.TM_procurement_item_code_groups (group_name);
    CREATE UNIQUE INDEX UX_TM_procurement_item_code_groups_prefix
      ON dbo.TM_procurement_item_code_groups (code_prefix);
  END;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
