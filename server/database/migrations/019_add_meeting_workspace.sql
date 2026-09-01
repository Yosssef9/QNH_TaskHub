USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_meetings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_rooms', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_attendees', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_activity', N'U') IS NULL
    BEGIN
        THROW 51901,
              'Meetings foundation migration 018 is required before Phase 4 workspace features can be added.',
              1;
    END;

    IF OBJECT_ID(N'dbo.TM_meeting_templates', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meeting_template_attendees', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meeting_attachments', N'U') IS NOT NULL
    BEGIN
        THROW 51902,
              'Meetings Phase 4 workspace schema already exists. Migration was not applied.',
              1;
    END;

    /* ============================================================
       1. Private personal Meeting Templates
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_templates (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        owner_user_id INT NOT NULL,
        name NVARCHAR(150) NOT NULL,
        title NVARCHAR(250) NOT NULL,
        description NVARCHAR(MAX) NULL,
        duration_minutes INT NOT NULL,
        default_room_id BIGINT NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_meeting_templates_is_active DEFAULT (1),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_templates_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_templates PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_meeting_templates_id_owner UNIQUE (id, owner_user_id),
        CONSTRAINT FK_TM_meeting_templates_owner
            FOREIGN KEY (owner_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_meeting_templates_default_room
            FOREIGN KEY (default_room_id)
            REFERENCES dbo.TM_meeting_rooms (id),
        CONSTRAINT CK_TM_meeting_templates_name
            CHECK (LEN(LTRIM(RTRIM(name))) > 0),
        CONSTRAINT CK_TM_meeting_templates_title
            CHECK (LEN(LTRIM(RTRIM(title))) > 0),
        CONSTRAINT CK_TM_meeting_templates_duration
            CHECK (duration_minutes BETWEEN 1 AND 1440)
    );

    CREATE UNIQUE INDEX UX_TM_meeting_templates_owner_active_name
        ON dbo.TM_meeting_templates (owner_user_id, name)
        WHERE is_active = 1;

    CREATE INDEX IX_TM_meeting_templates_owner_active_updated
        ON dbo.TM_meeting_templates (owner_user_id, is_active, updated_at_utc DESC, id DESC)
        INCLUDE (name, title, duration_minutes, default_room_id);

    CREATE TABLE dbo.TM_meeting_template_attendees (
        template_id BIGINT NOT NULL,
        owner_user_id INT NOT NULL,
        attendee_user_id INT NOT NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_template_attendees_created_at_utc DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_TM_meeting_template_attendees
            PRIMARY KEY CLUSTERED (template_id, attendee_user_id),
        CONSTRAINT FK_TM_meeting_template_attendees_template_owner
            FOREIGN KEY (template_id, owner_user_id)
            REFERENCES dbo.TM_meeting_templates (id, owner_user_id),
        CONSTRAINT FK_TM_meeting_template_attendees_user
            FOREIGN KEY (attendee_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id)
    );

    CREATE INDEX IX_TM_meeting_template_attendees_user
        ON dbo.TM_meeting_template_attendees (attendee_user_id, template_id);

    /* ============================================================
       2. Protected Meeting attachments
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_attachments (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_TM_meeting_attachments_id DEFAULT (NEWSEQUENTIALID()),
        meeting_id BIGINT NOT NULL,
        original_file_name NVARCHAR(260) NOT NULL,
        storage_key VARCHAR(500) NOT NULL,
        mime_type VARCHAR(255) NOT NULL,
        file_extension VARCHAR(20) NOT NULL,
        size_bytes BIGINT NOT NULL,
        uploaded_by_user_id INT NOT NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_meeting_attachments_is_active DEFAULT (1),
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_attachments_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_attachments PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_meeting_attachments_storage_key UNIQUE (storage_key),
        CONSTRAINT FK_TM_meeting_attachments_meeting
            FOREIGN KEY (meeting_id)
            REFERENCES dbo.TM_meetings (id),
        CONSTRAINT FK_TM_meeting_attachments_uploader
            FOREIGN KEY (uploaded_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_meeting_attachments_name
            CHECK (LEN(LTRIM(RTRIM(original_file_name))) > 0),
        CONSTRAINT CK_TM_meeting_attachments_storage_key
            CHECK (LEN(LTRIM(RTRIM(storage_key))) > 0),
        CONSTRAINT CK_TM_meeting_attachments_mime_type
            CHECK (LEN(LTRIM(RTRIM(mime_type))) > 0),
        CONSTRAINT CK_TM_meeting_attachments_extension
            CHECK (file_extension IN (
                '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt',
                '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
            )),
        CONSTRAINT CK_TM_meeting_attachments_size
            CHECK (size_bytes > 0 AND size_bytes <= 10485760)
    );

    CREATE INDEX IX_TM_meeting_attachments_meeting_active_created
        ON dbo.TM_meeting_attachments (meeting_id, is_active, created_at_utc DESC, id)
        INCLUDE (original_file_name, mime_type, file_extension, size_bytes, uploaded_by_user_id);

    COMMIT TRANSACTION;

    PRINT 'Meetings Phase 4 workspace migration completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
