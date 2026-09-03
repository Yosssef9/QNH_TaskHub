USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TM_meetings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_attendees', N'U') IS NULL
    BEGIN
        THROW 52101,
              'Meetings foundation migration 018 is required before Meeting agenda items can be added.',
              1;
    END;

    IF OBJECT_ID(N'dbo.TM_meeting_agenda_items', N'U') IS NOT NULL
    BEGIN
        THROW 52102,
              'Meeting agenda items schema already exists. Migration was not applied.',
              1;
    END;

    CREATE TABLE dbo.TM_meeting_agenda_items (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        meeting_id BIGINT NOT NULL,
        sort_order INT NOT NULL,
        topic NVARCHAR(500) NOT NULL,
        presenter_user_id INT NULL,
        planned_duration_minutes INT NULL,
        created_by_user_id INT NOT NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_agenda_items_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_agenda_items PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_meeting_agenda_items_meeting_order
            UNIQUE (meeting_id, sort_order),
        CONSTRAINT FK_TM_meeting_agenda_items_meeting
            FOREIGN KEY (meeting_id)
            REFERENCES dbo.TM_meetings (id),
        CONSTRAINT FK_TM_meeting_agenda_items_presenter
            FOREIGN KEY (presenter_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_meeting_agenda_items_created_by
            FOREIGN KEY (created_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_meeting_agenda_items_order
            CHECK (sort_order > 0),
        CONSTRAINT CK_TM_meeting_agenda_items_topic
            CHECK (LEN(LTRIM(RTRIM(topic))) > 0),
        CONSTRAINT CK_TM_meeting_agenda_items_duration
            CHECK (
                planned_duration_minutes IS NULL
                OR planned_duration_minutes BETWEEN 1 AND 1440
            )
    );

    CREATE INDEX IX_TM_meeting_agenda_items_meeting_order
        ON dbo.TM_meeting_agenda_items (meeting_id, sort_order, id)
        INCLUDE (topic, presenter_user_id, planned_duration_minutes);

    CREATE INDEX IX_TM_meeting_agenda_items_presenter
        ON dbo.TM_meeting_agenda_items (presenter_user_id, meeting_id)
        WHERE presenter_user_id IS NOT NULL;

    COMMIT TRANSACTION;

    PRINT 'Meeting agenda items migration completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
