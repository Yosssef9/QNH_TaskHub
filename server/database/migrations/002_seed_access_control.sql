SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_roles', N'U') IS NULL
        THROW 50101, 'TaskHub role table does not exist. Apply migration 001 first.', 1;

    DECLARE @roles TABLE (
        role_code VARCHAR(20) NOT NULL PRIMARY KEY,
        name_ar NVARCHAR(100) NOT NULL,
        name_en NVARCHAR(100) NOT NULL,
        description_ar NVARCHAR(500) NULL,
        description_en NVARCHAR(500) NULL
    );

    INSERT INTO @roles (
        role_code,
        name_ar,
        name_en,
        description_ar,
        description_en
    )
    VALUES
        (
            'USER',
            N'مستخدم',
            N'User',
            N'يدير قوائمه ومهامه ومؤشرات أدائه الخاصة فقط.',
            N'Manages only their own private lists, tasks, and KPIs.'
        ),
        (
            'ADMIN',
            N'مسؤول النظام',
            N'System Administrator',
            N'يدير الوصول للنظام وإعداداته والتقويم الرسمي دون الاطلاع التلقائي على أعمال المستخدمين الخاصة.',
            N'Manages TaskHub access, system configuration, and holidays without automatic access to private user work.'
        );

    UPDATE target
    SET
        target.name_ar = source.name_ar,
        target.name_en = source.name_en,
        target.description_ar = source.description_ar,
        target.description_en = source.description_en,
        target.is_active = 1,
        target.updated_at_utc = SYSUTCDATETIME()
    FROM dbo.TM_roles AS target
    INNER JOIN @roles AS source
        ON source.role_code = target.role_code;

    INSERT INTO dbo.TM_roles (
        role_code,
        name_ar,
        name_en,
        description_ar,
        description_en
    )
    SELECT
        source.role_code,
        source.name_ar,
        source.name_en,
        source.description_ar,
        source.description_en
    FROM @roles AS source
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.TM_roles AS target
        WHERE target.role_code = source.role_code
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
