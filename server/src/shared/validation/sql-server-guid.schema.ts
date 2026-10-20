import { z } from "zod";

/**
 * SQL Server UNIQUEIDENTIFIER values (including NEWSEQUENTIALID) are not
 * necessarily RFC 4122 UUIDs. Validate their canonical 36-character hex
 * representation without restricting the UUID version or variant bits.
 */
export const sqlServerGuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid attachment ID.",
);
