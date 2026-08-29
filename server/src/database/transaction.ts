import { logger } from "../config/logger.js";
import { getDatabasePool, sql } from "./sql.js";
import type { DatabaseTransaction } from "./types.js";

export async function withTransaction<T>(
  operation: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  const pool = await getDatabasePool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const result = await operation(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      logger.error({ err: rollbackError }, "SQL transaction rollback failed");
    }

    throw error;
  }
}
