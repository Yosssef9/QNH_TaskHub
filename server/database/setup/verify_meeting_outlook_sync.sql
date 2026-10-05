
/*
  QNH TaskHub Outlook Calendar synchronization foundation diagnostics.
  Read-only: no queue writes, activation changes, Graph calls, or Meeting changes.
*/
USE [QNHDB];
GO

SET NOCOUNT ON;

SELECT
    CAST(
        CASE
            WHEN OBJECT_ID(N'dbo.TM_meeting_outlook_sync_config', N'U') IS NOT NULL
             AND OBJECT_ID(N'dbo.TM_meeting_outlook_sync', N'U') IS NOT NULL
             AND OBJECT_ID(N'dbo.TM_meeting_outlook_sync_jobs', N'U') IS NOT NULL
            THEN 1
            ELSE 0
        END
        AS BIT
    ) AS outlook_sync_foundation_installed;

IF OBJECT_ID(N'dbo.TM_meeting_outlook_sync_config', N'U') IS NOT NULL
BEGIN
    SELECT
        id,
        is_enabled,
        activated_at_utc,
        last_worker_at_utc,
        last_poll_at_utc,
        created_at_utc,
        updated_at_utc
    FROM dbo.TM_meeting_outlook_sync_config
    WHERE id = 1;
END;

IF OBJECT_ID(N'dbo.TM_meeting_outlook_sync', N'U') IS NOT NULL
BEGIN
    SELECT
        sync_status,
        COUNT_BIG(*) AS meeting_count
    FROM dbo.TM_meeting_outlook_sync
    GROUP BY sync_status
    ORDER BY sync_status;
END;

IF OBJECT_ID(N'dbo.TM_meeting_outlook_sync_jobs', N'U') IS NOT NULL
BEGIN
    SELECT
        status,
        operation,
        COUNT_BIG(*) AS job_count,
        MIN(next_attempt_at_utc) AS earliest_next_attempt_at_utc,
        MAX(updated_at_utc) AS latest_updated_at_utc
    FROM dbo.TM_meeting_outlook_sync_jobs
    GROUP BY status, operation
    ORDER BY status, operation;
END;
GO
