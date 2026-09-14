USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. Prerequisites / duplicate protection
       ============================================================ */
    IF OBJECT_ID(N'dbo.TM_meetings', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_agenda_items', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_meeting_action_items', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
       OR COL_LENGTH(N'dbo.TM_user_settings', N'meeting_schedule_slot_interval') IS NULL
    BEGIN
        THROW 53701,
              'TaskHub migrations through 036 are required before Meeting Follow-up Phase 2.',
              1;
    END;

    IF OBJECT_ID(N'dbo.TM_meeting_decisions', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meeting_followup_notes', N'U') IS NOT NULL
    BEGIN
        THROW 53702,
              'Meeting Follow-up Phase 2 schema already exists. Migration was not applied.',
              1;
    END;

    /* ============================================================
       2. Preserve optional Agenda relationships when a topic is
          intentionally removed.

       Agenda items are now identity-preserving on ordinary edits.
       If an Organizer actually removes a topic, linked Action Items
       remain valid Tasks and simply lose the optional Agenda link.
       ============================================================ */
    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.TM_meeting_action_items')
          AND name = N'FK_TM_meeting_action_items_agenda'
    )
    BEGIN
        THROW 53703,
              'Expected Meeting Action Item Agenda foreign key is missing.',
              1;
    END;

    ALTER TABLE dbo.TM_meeting_action_items
        DROP CONSTRAINT FK_TM_meeting_action_items_agenda;

    ALTER TABLE dbo.TM_meeting_action_items
        WITH CHECK
        ADD CONSTRAINT FK_TM_meeting_action_items_agenda
            FOREIGN KEY (agenda_item_id)
            REFERENCES dbo.TM_meeting_agenda_items (id)
            ON DELETE SET NULL;

    ALTER TABLE dbo.TM_meeting_action_items
        CHECK CONSTRAINT FK_TM_meeting_action_items_agenda;

    /* ============================================================
       3. Decisions

       Decisions are Meeting-owned outcome content, not Tasks.
       Their optional Agenda relationship is descriptive only.
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_decisions (
        id BIGINT IDENTITY(1,1) NOT NULL,
        meeting_id BIGINT NOT NULL,
        agenda_item_id BIGINT NULL,
        decision_text NVARCHAR(MAX) NOT NULL,
        created_by_user_id INT NOT NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_decisions_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_decisions
            PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_meeting_decisions_meeting
            FOREIGN KEY (meeting_id) REFERENCES dbo.TM_meetings (id),
        CONSTRAINT FK_TM_meeting_decisions_agenda
            FOREIGN KEY (agenda_item_id) REFERENCES dbo.TM_meeting_agenda_items (id)
            ON DELETE SET NULL,
        CONSTRAINT FK_TM_meeting_decisions_created_by
            FOREIGN KEY (created_by_user_id) REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_meeting_decisions_text
            CHECK (LEN(LTRIM(RTRIM(decision_text))) > 0)
    );

    CREATE INDEX IX_TM_meeting_decisions_meeting
        ON dbo.TM_meeting_decisions (meeting_id, id DESC)
        INCLUDE (agenda_item_id, created_by_user_id, created_at_utc, updated_at_utc);

    CREATE INDEX IX_TM_meeting_decisions_agenda
        ON dbo.TM_meeting_decisions (agenda_item_id, id DESC)
        INCLUDE (meeting_id)
        WHERE agenda_item_id IS NOT NULL;

    /* ============================================================
       4. One Organizer-controlled notes document per Meeting
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_followup_notes (
        meeting_id BIGINT NOT NULL,
        notes_text NVARCHAR(MAX) NOT NULL,
        updated_by_user_id INT NOT NULL,
        updated_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_followup_notes_updated_at DEFAULT (SYSUTCDATETIME()),
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_followup_notes
            PRIMARY KEY CLUSTERED (meeting_id),
        CONSTRAINT FK_TM_meeting_followup_notes_meeting
            FOREIGN KEY (meeting_id) REFERENCES dbo.TM_meetings (id),
        CONSTRAINT FK_TM_meeting_followup_notes_updated_by
            FOREIGN KEY (updated_by_user_id) REFERENCES dbo.TM_user_access (portal_user_id)
    );

    COMMIT TRANSACTION;
    PRINT 'Meeting Follow-up Phase 2 migration 037 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
