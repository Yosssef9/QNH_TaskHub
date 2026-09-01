USE [QNHDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. Prerequisites
       ============================================================ */
    IF OBJECT_ID(N'dbo.TM_user_access', N'U') IS NULL
    BEGIN
        THROW 51801,
              'TaskHub access schema is required before Meetings can be added.',
              1;
    END;

    IF OBJECT_ID(N'dbo.TM_meeting_user_permissions', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meeting_rooms', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meetings', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meeting_revisions', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meeting_attendees', N'U') IS NOT NULL
       OR OBJECT_ID(N'dbo.TM_meeting_activity', N'U') IS NOT NULL
    BEGIN
        THROW 51802,
              'Meetings Phase 1 foundation already exists. Migration was not applied.',
              1;
    END;

    /* ============================================================
       2. Meeting permissions
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_user_permissions (
        portal_user_id INT NOT NULL,
        permission_code VARCHAR(40) NOT NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_meeting_permissions_is_active DEFAULT (1),
        granted_by_user_id INT NOT NULL,
        granted_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_permissions_granted_at_utc DEFAULT (SYSUTCDATETIME()),
        revoked_by_user_id INT NULL,
        revoked_at_utc DATETIME2(3) NULL,

        CONSTRAINT PK_TM_meeting_user_permissions
            PRIMARY KEY CLUSTERED (portal_user_id, permission_code),
        CONSTRAINT FK_TM_meeting_permissions_user
            FOREIGN KEY (portal_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_meeting_permissions_granted_by
            FOREIGN KEY (granted_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_meeting_permissions_revoked_by
            FOREIGN KEY (revoked_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_meeting_permissions_code
            CHECK (permission_code IN ('MEETING_ORGANIZE', 'MEETING_COORDINATE')),
        CONSTRAINT CK_TM_meeting_permissions_revoke_state CHECK (
            (is_active = 1 AND revoked_by_user_id IS NULL AND revoked_at_utc IS NULL)
            OR
            (is_active = 0 AND revoked_by_user_id IS NOT NULL AND revoked_at_utc IS NOT NULL)
        )
    );

    CREATE INDEX IX_TM_meeting_permissions_active
        ON dbo.TM_meeting_user_permissions (permission_code, is_active, portal_user_id);

    /* ============================================================
       3. Meeting Rooms
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_rooms (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        code NVARCHAR(50) NULL,
        name_ar NVARCHAR(150) NOT NULL,
        name_en NVARCHAR(150) NOT NULL,
        location_text NVARCHAR(300) NULL,
        capacity INT NOT NULL,
        equipment_notes NVARCHAR(1000) NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_TM_meeting_rooms_is_active DEFAULT (1),
        created_by_user_id INT NOT NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_rooms_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_by_user_id INT NULL,
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_rooms PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_meeting_rooms_created_by
            FOREIGN KEY (created_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_meeting_rooms_updated_by
            FOREIGN KEY (updated_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_meeting_rooms_name_ar
            CHECK (LEN(LTRIM(RTRIM(name_ar))) > 0),
        CONSTRAINT CK_TM_meeting_rooms_name_en
            CHECK (LEN(LTRIM(RTRIM(name_en))) > 0),
        CONSTRAINT CK_TM_meeting_rooms_code
            CHECK (code IS NULL OR LEN(LTRIM(RTRIM(code))) > 0),
        CONSTRAINT CK_TM_meeting_rooms_capacity
            CHECK (capacity > 0)
    );

    CREATE UNIQUE INDEX UX_TM_meeting_rooms_code
        ON dbo.TM_meeting_rooms (code)
        WHERE code IS NOT NULL;

    CREATE INDEX IX_TM_meeting_rooms_active_name
        ON dbo.TM_meeting_rooms (is_active, name_en, id)
        INCLUDE (code, name_ar, location_text, capacity);

    /* ============================================================
       4. Stable Meeting identity
       ============================================================ */
    CREATE TABLE dbo.TM_meetings (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        organizer_user_id INT NOT NULL,
        title NVARCHAR(250) NOT NULL,
        description NVARCHAR(MAX) NULL,
        status VARCHAR(30) NOT NULL,
        current_revision_id BIGINT NULL,
        cancelled_at_utc DATETIME2(3) NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meetings_created_at_utc DEFAULT (SYSUTCDATETIME()),
        updated_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meetings PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_meetings_organizer
            FOREIGN KEY (organizer_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_meetings_title
            CHECK (LEN(LTRIM(RTRIM(title))) > 0),
        CONSTRAINT CK_TM_meetings_status
            CHECK (status IN ('PENDING_APPROVAL', 'SCHEDULED', 'REJECTED', 'CANCELLED')),
        CONSTRAINT CK_TM_meetings_cancelled_state CHECK (
            (status = 'CANCELLED' AND cancelled_at_utc IS NOT NULL)
            OR
            (status <> 'CANCELLED' AND cancelled_at_utc IS NULL)
        )
    );

    CREATE INDEX IX_TM_meetings_organizer_status_created
        ON dbo.TM_meetings (organizer_user_id, status, created_at_utc DESC, id DESC)
        INCLUDE (title, current_revision_id);

    /* ============================================================
       5. Meeting scheduling revisions
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_revisions (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        meeting_id BIGINT NOT NULL,
        revision_number INT NOT NULL,
        revision_type VARCHAR(20) NOT NULL,
        revision_status VARCHAR(20) NOT NULL,
        room_id BIGINT NOT NULL,
        start_at_utc DATETIME2(3) NOT NULL,
        end_at_utc DATETIME2(3) NOT NULL,
        scheduling_notes NVARCHAR(1000) NULL,
        requested_by_user_id INT NOT NULL,
        approved_by_user_id INT NULL,
        rejected_by_user_id INT NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_revisions_created_at_utc DEFAULT (SYSUTCDATETIME()),
        decided_at_utc DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,

        CONSTRAINT PK_TM_meeting_revisions PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_TM_meeting_revisions_meeting_number
            UNIQUE (meeting_id, revision_number),
        CONSTRAINT UQ_TM_meeting_revisions_id_meeting
            UNIQUE (id, meeting_id),
        CONSTRAINT FK_TM_meeting_revisions_meeting
            FOREIGN KEY (meeting_id)
            REFERENCES dbo.TM_meetings (id),
        CONSTRAINT FK_TM_meeting_revisions_room
            FOREIGN KEY (room_id)
            REFERENCES dbo.TM_meeting_rooms (id),
        CONSTRAINT FK_TM_meeting_revisions_requested_by
            FOREIGN KEY (requested_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_meeting_revisions_approved_by
            FOREIGN KEY (approved_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_meeting_revisions_rejected_by
            FOREIGN KEY (rejected_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_meeting_revisions_number
            CHECK (revision_number > 0),
        CONSTRAINT CK_TM_meeting_revisions_type
            CHECK (revision_type IN ('INITIAL', 'RESCHEDULE')),
        CONSTRAINT CK_TM_meeting_revisions_status
            CHECK (revision_status IN ('PENDING', 'APPROVED', 'REJECTED')),
        CONSTRAINT CK_TM_meeting_revisions_times
            CHECK (end_at_utc > start_at_utc),
        CONSTRAINT CK_TM_meeting_revisions_decision_state CHECK (
            (
                revision_status = 'PENDING'
                AND approved_by_user_id IS NULL
                AND rejected_by_user_id IS NULL
                AND decided_at_utc IS NULL
            )
            OR
            (
                revision_status = 'APPROVED'
                AND approved_by_user_id IS NOT NULL
                AND rejected_by_user_id IS NULL
                AND decided_at_utc IS NOT NULL
            )
            OR
            (
                revision_status = 'REJECTED'
                AND approved_by_user_id IS NULL
                AND rejected_by_user_id IS NOT NULL
                AND decided_at_utc IS NOT NULL
            )
        )
    );

    CREATE INDEX IX_TM_meeting_revisions_room_schedule
        ON dbo.TM_meeting_revisions (
            room_id,
            revision_status,
            start_at_utc,
            end_at_utc,
            meeting_id
        );

    CREATE INDEX IX_TM_meeting_revisions_meeting_created
        ON dbo.TM_meeting_revisions (meeting_id, revision_number DESC)
        INCLUDE (revision_type, revision_status, room_id, start_at_utc, end_at_utc);

    ALTER TABLE dbo.TM_meetings
        ADD CONSTRAINT FK_TM_meetings_current_revision
        FOREIGN KEY (current_revision_id, id)
        REFERENCES dbo.TM_meeting_revisions (id, meeting_id);

    /* ============================================================
       6. Attendees
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_attendees (
        meeting_id BIGINT NOT NULL,
        attendee_user_id INT NOT NULL,
        added_by_user_id INT NOT NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_attendees_created_at_utc DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_TM_meeting_attendees
            PRIMARY KEY CLUSTERED (meeting_id, attendee_user_id),
        CONSTRAINT FK_TM_meeting_attendees_meeting
            FOREIGN KEY (meeting_id)
            REFERENCES dbo.TM_meetings (id),
        CONSTRAINT FK_TM_meeting_attendees_user
            FOREIGN KEY (attendee_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT FK_TM_meeting_attendees_added_by
            FOREIGN KEY (added_by_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id)
    );

    CREATE INDEX IX_TM_meeting_attendees_user_meeting
        ON dbo.TM_meeting_attendees (attendee_user_id, meeting_id);

    /* ============================================================
       7. Immutable Meeting activity
       ============================================================ */
    CREATE TABLE dbo.TM_meeting_activity (
        id BIGINT IDENTITY(1, 1) NOT NULL,
        meeting_id BIGINT NOT NULL,
        actor_user_id INT NOT NULL,
        activity_type VARCHAR(50) NOT NULL,
        changes_json NVARCHAR(MAX) NULL,
        created_at_utc DATETIME2(3) NOT NULL
            CONSTRAINT DF_TM_meeting_activity_created_at_utc DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_TM_meeting_activity PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_TM_meeting_activity_meeting
            FOREIGN KEY (meeting_id)
            REFERENCES dbo.TM_meetings (id),
        CONSTRAINT FK_TM_meeting_activity_actor
            FOREIGN KEY (actor_user_id)
            REFERENCES dbo.TM_user_access (portal_user_id),
        CONSTRAINT CK_TM_meeting_activity_type
            CHECK (LEN(LTRIM(RTRIM(activity_type))) > 0),
        CONSTRAINT CK_TM_meeting_activity_json
            CHECK (changes_json IS NULL OR ISJSON(changes_json) = 1)
    );

    CREATE INDEX IX_TM_meeting_activity_meeting_created
        ON dbo.TM_meeting_activity (meeting_id, created_at_utc DESC, id DESC)
        INCLUDE (activity_type, actor_user_id);

    COMMIT TRANSACTION;

    PRINT 'Meetings Phase 1 foundation migration completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
