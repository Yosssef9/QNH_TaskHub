-- Task Proxy: one accountable assignee, one active proxy per main task/subtask.
-- Run manually AFTER 067 in a backed-up QNHDB. No existing rows are altered.
SET XACT_ABORT ON;
BEGIN TRAN;
IF OBJECT_ID(N'dbo.TM_task_proxies', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TM_task_proxies (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TM_task_proxies PRIMARY KEY,
    task_id BIGINT NOT NULL CONSTRAINT FK_TM_task_proxies_task REFERENCES dbo.TM_tasks(id),
    subtask_id BIGINT NULL CONSTRAINT FK_TM_task_proxies_subtask REFERENCES dbo.TM_subtasks(id),
    owner_user_id INT NOT NULL,
    principal_user_id INT NOT NULL CONSTRAINT FK_TM_task_proxies_principal REFERENCES dbo.users(USER_ID),
    proxy_user_id INT NOT NULL CONSTRAINT FK_TM_task_proxies_proxy REFERENCES dbo.users(USER_ID),
    appointed_by_user_id INT NOT NULL CONSTRAINT FK_TM_task_proxies_appointed REFERENCES dbo.users(USER_ID),
    appointed_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_TM_task_proxies_appointed DEFAULT SYSUTCDATETIME(),
    revoked_at_utc DATETIME2(3) NULL,
    revoked_by_user_id INT NULL,
    CONSTRAINT CK_TM_task_proxies_distinct CHECK (principal_user_id <> proxy_user_id AND proxy_user_id <> owner_user_id)
  );
  CREATE UNIQUE INDEX UX_TM_task_proxies_main ON dbo.TM_task_proxies(task_id)
    WHERE subtask_id IS NULL AND revoked_at_utc IS NULL;
  CREATE UNIQUE INDEX UX_TM_task_proxies_child ON dbo.TM_task_proxies(subtask_id)
    WHERE subtask_id IS NOT NULL AND revoked_at_utc IS NULL;
  CREATE INDEX IX_TM_task_proxies_proxy ON dbo.TM_task_proxies(proxy_user_id, task_id, subtask_id)
    INCLUDE (principal_user_id, revoked_at_utc);
END;
COMMIT;
GO
