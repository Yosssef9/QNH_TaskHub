SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @InitialAdminUserCode NVARCHAR(10) = N'2410';
DECLARE @InitialAdminUserId INT;
DECLARE @MatchingPortalUsers INT;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.users', N'U') IS NULL
        THROW 50201, 'Required Portal table dbo.users does not exist.', 1;

    IF OBJECT_ID(N'dbo.TM_roles', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_settings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_lists', N'U') IS NULL
        THROW 50202, 'TaskHub schema does not exist. Apply migrations 001 and 002 first.', 1;

    SELECT
        @MatchingPortalUsers = COUNT(*),
        @InitialAdminUserId = MAX(USER_ID)
    FROM dbo.users WITH (UPDLOCK, HOLDLOCK)
    WHERE USER_CODE = @InitialAdminUserCode;

    IF @MatchingPortalUsers = 0
        THROW 50203, 'Portal user code 2410 does not exist.', 1;

    IF @MatchingPortalUsers > 1
        THROW 50206, 'Portal user code 2410 is not unique.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.users
        WHERE USER_ID = @InitialAdminUserId
          AND IS_ACTIVE = 1
    )
        THROW 50204, 'Portal user code 2410 is inactive.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.TM_roles
        WHERE role_code = 'ADMIN'
          AND is_active = 1
    )
        THROW 50205, 'The active ADMIN role is missing. Apply seed 002 first.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.TM_user_access
        WHERE portal_user_id = @InitialAdminUserId
    )
    BEGIN
        UPDATE dbo.TM_user_access
        SET
            role_code = 'ADMIN',
            is_active = 1,
            deactivated_by_user_id = NULL,
            deactivated_at_utc = NULL,
            updated_at_utc = SYSUTCDATETIME()
        WHERE portal_user_id = @InitialAdminUserId;
    END
    ELSE
    BEGIN
        INSERT INTO dbo.TM_user_access (
            portal_user_id,
            role_code,
            is_active,
            granted_by_user_id
        )
        VALUES (
            @InitialAdminUserId,
            'ADMIN',
            1,
            @InitialAdminUserId
        );
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.TM_user_settings
        WHERE portal_user_id = @InitialAdminUserId
    )
    BEGIN
        INSERT INTO dbo.TM_user_settings (portal_user_id)
        VALUES (@InitialAdminUserId);
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.TM_lists
        WHERE owner_user_id = @InitialAdminUserId
          AND is_default = 1
    )
    BEGIN
        INSERT INTO dbo.TM_lists (
            owner_user_id,
            name,
            icon_key,
            color,
            is_default,
            display_order
        )
        VALUES (
            @InitialAdminUserId,
            N'My Tasks',
            'list-todo',
            '#2563EB',
            1,
            0
        );
    END;

    COMMIT TRANSACTION;

    SELECT
        u.USER_ID AS portal_user_id,
        u.USER_CODE AS user_code,
        u.USER_NAME AS user_name,
        a.role_code,
        a.is_active
    FROM dbo.users AS u
    INNER JOIN dbo.TM_user_access AS a
        ON a.portal_user_id = u.USER_ID
    WHERE u.USER_ID = @InitialAdminUserId;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
