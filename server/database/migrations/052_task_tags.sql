USE [QNHDB];
GO
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_tasks',N'U') IS NULL OR OBJECT_ID(N'dbo.TM_user_access',N'U') IS NULL
    THROW 55201, 'TaskHub core tables are required before task tags.', 1;
  IF OBJECT_ID(N'dbo.TM_collaboration_assignments',N'U') IS NULL
    THROW 55203, 'TaskHub collaboration migration 050 is required before tags.', 1;
  IF OBJECT_ID(N'dbo.TM_tags',N'U') IS NOT NULL OR OBJECT_ID(N'dbo.TM_task_tags',N'U') IS NOT NULL
    THROW 55202, 'Migration 052 already applied; no changes made.', 1;
  CREATE TABLE dbo.TM_tags (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TM_tags PRIMARY KEY,
    scope VARCHAR(12) NOT NULL,
    owner_user_id INT NULL,
    name NVARCHAR(80) NOT NULL,
    normalized_name AS UPPER(LTRIM(RTRIM(name))) PERSISTED,
    icon_kind VARCHAR(12) NOT NULL,
    icon_key VARCHAR(80) NULL,
    icon_mime VARCHAR(20) NULL,
    icon_data VARBINARY(MAX) NULL,
    color CHAR(7) NOT NULL CONSTRAINT DF_TM_tags_color DEFAULT ('#2563EB'),
    is_active BIT NOT NULL CONSTRAINT DF_TM_tags_active DEFAULT (1),
    created_by_user_id INT NULL,
    created_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_tags_created DEFAULT SYSUTCDATETIME(),
    updated_at_utc DATETIME2(3) NULL,
    CONSTRAINT FK_TM_tags_owner FOREIGN KEY(owner_user_id) REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT FK_TM_tags_creator FOREIGN KEY(created_by_user_id) REFERENCES dbo.TM_user_access(portal_user_id),
    CONSTRAINT CK_TM_tags_scope CHECK ((scope='SYSTEM' AND owner_user_id IS NULL) OR (scope='PERSONAL' AND owner_user_id IS NOT NULL)),
    CONSTRAINT CK_TM_tags_name CHECK (LEN(LTRIM(RTRIM(name))) BETWEEN 1 AND 80),
    CONSTRAINT CK_TM_tags_kind CHECK (icon_kind IN ('SYSTEM','LUCIDE','UPLOAD')),
    CONSTRAINT CK_TM_tags_image CHECK (
      (icon_kind IN ('SYSTEM','LUCIDE') AND icon_key IS NOT NULL AND icon_data IS NULL AND icon_mime IS NULL)
      OR (icon_kind='UPLOAD' AND icon_data IS NOT NULL AND DATALENGTH(icon_data) BETWEEN 1 AND 262144
         AND icon_mime IN ('image/png','image/jpeg','image/webp') AND icon_key IS NULL)),
    CONSTRAINT CK_TM_tags_color CHECK (color LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]')
  );
  CREATE UNIQUE INDEX UX_TM_tags_system_name ON dbo.TM_tags(normalized_name) WHERE scope='SYSTEM';
  CREATE UNIQUE INDEX UX_TM_tags_personal_name ON dbo.TM_tags(owner_user_id,normalized_name) WHERE scope='PERSONAL' AND is_active=1;
  CREATE INDEX IX_TM_tags_owner_active ON dbo.TM_tags(owner_user_id,is_active,id) INCLUDE(name,scope,icon_kind,icon_key,color);
  CREATE TABLE dbo.TM_task_tags (
    task_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    assigned_by_user_id INT NOT NULL,
    assigned_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_task_tags_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TM_task_tags PRIMARY KEY CLUSTERED(task_id,tag_id),
    CONSTRAINT FK_TM_task_tags_task FOREIGN KEY(task_id) REFERENCES dbo.TM_tasks(id),
    CONSTRAINT FK_TM_task_tags_tag FOREIGN KEY(tag_id) REFERENCES dbo.TM_tags(id),
    CONSTRAINT FK_TM_task_tags_actor FOREIGN KEY(assigned_by_user_id) REFERENCES dbo.TM_user_access(portal_user_id)
  );
  CREATE INDEX IX_TM_task_tags_tag_task ON dbo.TM_task_tags(tag_id,task_id);
  INSERT INTO dbo.TM_tags(scope,owner_user_id,name,icon_kind,icon_key,color)
  VALUES ('SYSTEM',NULL,N'QNH','SYSTEM','qnh','#1678B9'),
         ('SYSTEM',NULL,N'QMS','SYSTEM','qms','#4A559E');
  COMMIT TRANSACTION;
  PRINT 'TaskHub migration 052 installed. System tags QNH and QMS seeded.';
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
