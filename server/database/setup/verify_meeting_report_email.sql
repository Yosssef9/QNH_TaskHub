/* Read-only Phase 5 diagnostics. No queue writes, setting changes, or email sends. */
USE [QNHDB];
GO
SET NOCOUNT ON;
DECLARE @MeetingId BIGINT = NULL; -- Set to a specific Meeting ID to filter report attempts.

IF OBJECT_ID(N'dbo.TM_meeting_report_delivery_config', N'U') IS NULL
BEGIN
    SELECT N'MIGRATION_044_REQUIRED' AS configuration_state;
END
ELSE
BEGIN
    EXEC sys.sp_executesql N'
        SELECT is_enabled, activated_at_utc, last_scan_at_utc,
            SYSUTCDATETIME() AS checked_at_utc
        FROM dbo.TM_meeting_report_delivery_config WHERE id = 1;
    ';
END;

SELECT event_type, is_enabled, COUNT_BIG(*) AS users_with_stored_preference
FROM dbo.TM_email_preferences
WHERE event_type = 'MEETING_REPORT_AVAILABLE'
GROUP BY event_type, is_enabled;

SELECT outbox.id, outbox.status, outbox.attempt_count,
    outbox.created_at_utc, outbox.next_attempt_at_utc, outbox.sent_at_utc,
    JSON_VALUE(outbox.template_payload_json, '$.meetingId') AS meeting_id,
    JSON_VALUE(outbox.template_payload_json, '$.revisionId') AS revision_id,
    JSON_VALUE(outbox.template_payload_json, '$.scheduledEndAtUtc') AS approved_end_utc,
    JSON_VALUE(outbox.template_payload_json, '$.generatedAtUtc') AS generated_at_utc,
    JSON_VALUE(outbox.template_payload_json, '$.pdfBytes') AS pdf_bytes,
    outbox.last_error AS diagnostic_code
FROM dbo.TM_email_outbox AS outbox
WHERE outbox.template_key = 'MEETING_REPORT_AVAILABLE'
  AND (@MeetingId IS NULL OR TRY_CONVERT(BIGINT, JSON_VALUE(outbox.template_payload_json, '$.meetingId')) = @MeetingId)
ORDER BY outbox.id DESC;
GO
