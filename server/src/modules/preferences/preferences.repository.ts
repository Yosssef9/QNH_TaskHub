import { getDatabasePool, sql } from "../../database/sql.js";
import type { UserPreferences } from "../auth/auth.types.js";
import type { UpdatePreferencesBody } from "./preferences.schemas.js";

interface PreferencesRecord {
  languageCode: "AR" | "EN";
  theme: "LIGHT" | "DARK" | "SYSTEM";
  sidebarCollapsed: boolean;
  calendarShowAdjacentDates: boolean;
  timezone: "Asia/Riyadh";
}

export async function updatePreferences(
  userId: number,
  input: UpdatePreferencesBody,
): Promise<UserPreferences | null> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("languageCode", sql.VarChar(2), input.languageCode ?? null)
    .input("theme", sql.VarChar(10), input.theme ?? null)
    .input("sidebarCollapsed", sql.Bit, input.sidebarCollapsed ?? null)
    .input(
      "calendarShowAdjacentDates",
      sql.Bit,
      input.calendarShowAdjacentDates ?? null,
    ).query<PreferencesRecord>(`
      UPDATE dbo.TM_user_settings
      SET
        language_code = COALESCE(@languageCode, language_code),
        theme = COALESCE(@theme, theme),
        sidebar_collapsed = COALESCE(@sidebarCollapsed, sidebar_collapsed),
        calendar_show_adjacent_dates = COALESCE(
          @calendarShowAdjacentDates,
          calendar_show_adjacent_dates
        ),
        updated_at_utc = SYSUTCDATETIME()
      OUTPUT
        inserted.language_code AS languageCode,
        inserted.theme,
        inserted.sidebar_collapsed AS sidebarCollapsed,
        inserted.calendar_show_adjacent_dates AS calendarShowAdjacentDates,
        inserted.timezone_name AS timezone
      WHERE portal_user_id = @userId;
    `);

  return result.recordset[0] ?? null;
}

export const preferencesRepository = { updatePreferences };
