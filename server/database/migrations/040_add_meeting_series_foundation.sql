USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_meetings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_rooms', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_revisions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_agenda_items', N'U') IS NULL
    BEGIN
        THROW 54001,
              'Meeting Series prerequisites are missing. Apply TaskHub migrations through 039 first.',
              1;
    END;

    IF OBJECT_ID(N'dbo.TM_meeting_series', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meeting_series_members', N'U') IS NOT NULL
    BEGIN
        THROW 54002,
              'Meeting Series foundation already exists. Migration was not applied.',
              1;
    END;

    CREATE TABLE dbo.TM_meeting_series (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        created_by_user_id INT NOT NULL,
        creation_request_id UNIQUEIDENTIFIER NOT NULL,
        request_fingerprint CHAR(64) NOT NULL,
        creation_mode VARCHAR(20) NOT NULL,
        recurrence_definition_json NVARCHAR(MAX) NOT NULL,
        defaults_json NVARCHAR(MAX) NOT NULL,
        time_zone VARCHAR(64) NOT NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_series_created_at_utc DEFAULT (SYSUTCDATETIME()),
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_series PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_meeting_series_created_by
            FOREIGN KEY (created_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT UQ_TM_meeting_series_creator_request
            UNIQUE (created_by_user_id, creation_request_id),
        CONSTRAINT CK_TM_meeting_series_creation_mode
            CHECK (creation_mode IN ('PATTERN', 'CUSTOM')),
        CONSTRAINT CK_TM_meeting_series_recurrence_json
            CHECK (ISJSON(recurrence_definition_json) = 1),
        CONSTRAINT CK_TM_meeting_series_defaults_json
            CHECK (ISJSON(defaults_json) = 1),
        CONSTRAINT CK_TM_meeting_series_time_zone
            CHECK (time_zone = 'Asia/Riyadh'),
        CONSTRAINT CK_TM_meeting_series_fingerprint
            CHECK (LEN(request_fingerprint) = 64)
    );

    CREATE INDEX IX_TM_meeting_series_creator_created
        ON dbo.TM_meeting_series (created_by_user_id, created_at_utc DESC, id DESC)
        INCLUDE (creation_mode, creation_request_id, time_zone);

    CREATE TABLE dbo.TM_meeting_series_members (
        series_id BIGINT NOT NULL,
        meeting_id BIGINT NOT NULL,
        sequence_number INT NOT NULL,
        occurrence_key NVARCHAR(120) NOT NULL,
        source_type VARCHAR(20) NOT NULL,
        original_start_at_utc DATETIME2(3) NULL,
        original_end_at_utc DATETIME2(3) NULL,
        initial_start_at_utc DATETIME2(3) NOT NULL,
        initial_end_at_utc DATETIME2(3) NOT NULL,
        initial_room_id BIGINT NOT NULL,
        customization_json NVARCHAR(MAX) NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_series_members_created_at_utc DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_TM_meeting_series_members
            PRIMARY KEY CLUSTERED (series_id, meeting_id),
        CONSTRAINT FK_TM_meeting_series_members_series
            FOREIGN KEY (series_id)
            REFERENCES dbo.TM_meeting_series (id),
        CONSTRAINT FK_TM_meeting_series_members_meeting
            FOREIGN KEY (meeting_id)
            REFERENCES dbo.TM_meetings (id),
        CONSTRAINT FK_TM_meeting_series_members_room
            FOREIGN KEY (initial_room_id)
            REFERENCES dbo.TM_meeting_rooms (id),
        CONSTRAINT UQ_TM_meeting_series_members_series_sequence
            UNIQUE (series_id, sequence_number),
        CONSTRAINT UQ_TM_meeting_series_members_series_occurrence
            UNIQUE (series_id, occurrence_key),
        CONSTRAINT UQ_TM_meeting_series_members_meeting
            UNIQUE (meeting_id),
        CONSTRAINT CK_TM_meeting_series_members_sequence
            CHECK (sequence_number > 0),
        CONSTRAINT CK_TM_meeting_series_members_source
            CHECK (source_type IN ('PATTERN', 'CUSTOM', 'ADDED')),
        CONSTRAINT CK_TM_meeting_series_members_original_window
            CHECK (
                (original_start_at_utc IS NULL AND original_end_at_utc IS NULL)
                OR
                (original_start_at_utc IS NOT NULL
                 AND original_end_at_utc IS NOT NULL
                 AND original_end_at_utc > original_start_at_utc)
            ),
        CONSTRAINT CK_TM_meeting_series_members_initial_window
            CHECK (initial_end_at_utc > initial_start_at_utc),
        CONSTRAINT CK_TM_meeting_series_members_customization_json
            CHECK (customization_json IS NULL OR ISJSON(customization_json) = 1)
    );

    COMMIT TRANSACTION;
    PRINT 'Meeting Series foundation migration 040 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
