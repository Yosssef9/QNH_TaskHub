import { getDatabasePool, sql } from '../../database/sql.js';

/** Bump this key when introducing an unrelated future product-tour release. */
export const DISCUSSIONS_INTRO_KEY = 'TASK_DISCUSSIONS_2026_V1';

/** Acknowledgement is keyed by authenticated Portal USER_ID, across browsers/devices. */
export const featureAnnouncementsService = {
  async isSeen(userId: number): Promise<boolean> {
    const pool = await getDatabasePool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('key', sql.VarChar(80), DISCUSSIONS_INTRO_KEY)
      .query<{ seen: number }>(`
        SELECT CAST(CASE WHEN EXISTS (
          SELECT 1 FROM dbo.TM_feature_announcement_views
          WHERE portal_user_id = @userId AND feature_key = @key
        ) THEN 1 ELSE 0 END AS INT) AS seen;
      `);
    return Number(result.recordset[0]?.seen) === 1;
  },

  async markSeen(userId: number): Promise<void> {
    const pool = await getDatabasePool();
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('key', sql.VarChar(80), DISCUSSIONS_INTRO_KEY)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.TM_feature_announcement_views WITH (UPDLOCK, HOLDLOCK)
          WHERE portal_user_id = @userId AND feature_key = @key
        )
          INSERT dbo.TM_feature_announcement_views(portal_user_id, feature_key)
          VALUES (@userId, @key);
      `);
  },
};
