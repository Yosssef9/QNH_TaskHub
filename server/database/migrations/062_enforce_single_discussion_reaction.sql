USE [QNHDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.TM_task_discussion_reactions', N'U') IS NULL
    THROW 56201, 'Migration 061 must be applied before 062.', 1;

  -- Migration 061 allowed multiple emojis per user/message. Retain each user's
  -- most recent reaction and discard duplicates before enforcing the new rule.
  -- This alters reaction selections only, never discussion messages or attachments.
  ;WITH duplicates AS (
    SELECT message_id, user_id, emoji,
      ROW_NUMBER() OVER (
        PARTITION BY message_id, user_id
        ORDER BY created_at_utc DESC, emoji ASC
      ) AS rn
    FROM dbo.TM_task_discussion_reactions WITH (UPDLOCK, HOLDLOCK)
  )
  DELETE FROM duplicates WHERE rn > 1;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id=OBJECT_ID(N'dbo.TM_task_discussion_reactions')
      AND name=N'UX_TM_discussion_reactions_message_user'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_TM_discussion_reactions_message_user
      ON dbo.TM_task_discussion_reactions(message_id, user_id);
  END;

  COMMIT TRANSACTION;
  PRINT 'Migration 062: single reaction per participant and message enforced.';
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
