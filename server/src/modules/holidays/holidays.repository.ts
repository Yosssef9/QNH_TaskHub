import { getDatabasePool, sql } from "../../database/sql.js";
import type { SaveHolidayBody } from "./holidays.schemas.js";

export interface HolidayRecord {
  id: number;
  holidayDate: Date;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
}

const fields = "id,holiday_date holidayDate,name_ar nameAr,name_en nameEn,is_active isActive";

export const holidaysRepository = {
  async list() {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .query<HolidayRecord>(`SELECT ${fields} FROM dbo.TM_holidays ORDER BY holiday_date DESC;`);
    return result.recordset;
  },

  async listActiveDates(): Promise<Date[]> {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .query<{ holidayDate: Date }>(
        `SELECT holiday_date AS holidayDate FROM dbo.TM_holidays WHERE is_active=1 ORDER BY holiday_date;`,
      );
    return result.recordset.map((row) => row.holidayDate);
  },

  async create(userId: number, input: SaveHolidayBody) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("date", sql.Date, input.holidayDate)
      .input("ar", sql.NVarChar(150), input.nameAr)
      .input("en", sql.NVarChar(150), input.nameEn)
      .input("active", sql.Bit, input.isActive)
      .input("user", sql.Int, userId)
      .query<HolidayRecord>(
        `INSERT dbo.TM_holidays(holiday_date,name_ar,name_en,is_active,created_by_user_id) OUTPUT inserted.id,inserted.holiday_date holidayDate,inserted.name_ar nameAr,inserted.name_en nameEn,inserted.is_active isActive VALUES(@date,@ar,@en,@active,@user);`,
      );
    return result.recordset[0] ?? null;
  },

  async update(userId: number, id: number, input: SaveHolidayBody) {
    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("date", sql.Date, input.holidayDate)
      .input("ar", sql.NVarChar(150), input.nameAr)
      .input("en", sql.NVarChar(150), input.nameEn)
      .input("active", sql.Bit, input.isActive)
      .input("user", sql.Int, userId)
      .query<HolidayRecord>(
        `UPDATE dbo.TM_holidays SET holiday_date=@date,name_ar=@ar,name_en=@en,is_active=@active,updated_by_user_id=@user,updated_at_utc=SYSUTCDATETIME() OUTPUT inserted.id,inserted.holiday_date holidayDate,inserted.name_ar nameAr,inserted.name_en nameEn,inserted.is_active isActive WHERE id=@id;`,
      );
    return result.recordset[0] ?? null;
  },
};
