import sql from "mssql";

import { databaseConfig } from "../config/database.js";
import { logger } from "../config/logger.js";

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export function getDatabasePool(): Promise<sql.ConnectionPool> {
  poolPromise ??= new sql.ConnectionPool(databaseConfig).connect().catch((error: unknown) => {
    poolPromise = undefined;
    logger.error({ err: error }, "SQL Server connection failed");
    throw error;
  });

  return poolPromise;
}

export async function closeDatabasePool(): Promise<void> {
  if (!poolPromise) {
    return;
  }

  const pool = await poolPromise;
  poolPromise = undefined;
  await pool.close();
}

export { sql };
