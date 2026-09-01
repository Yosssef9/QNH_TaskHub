const PREFIXED_HEX_ROW_VERSION = /^0[xX]([0-9A-Fa-f]{16})$/;
const HEX_ROW_VERSION = /^[0-9A-Fa-f]{16}$/;
const BASE64_ROW_VERSION = /^[A-Za-z0-9+/]{11}=$/;
const BASE64URL_ROW_VERSION = /^[A-Za-z0-9_-]{11}=?$/;

function fromBytes(bytes: Uint8Array): string | null {
  if (bytes.byteLength !== 8) return null;
  return `0x${Buffer.from(bytes).toString("hex").toUpperCase()}`;
}

function decodeBase64RowVersion(value: string): string | null {
  if (!BASE64_ROW_VERSION.test(value) && !BASE64URL_ROW_VERSION.test(value)) return null;

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(12, "=");
    return fromBytes(Buffer.from(normalized, "base64"));
  } catch {
    return null;
  }
}

/**
 * Normalizes SQL Server ROWVERSION values to the API's canonical form:
 * `0x` followed by exactly 16 uppercase hexadecimal characters.
 *
 * SQL Server ROWVERSION is BINARY(8). Depending on the query/driver boundary,
 * the same 8 bytes may surface as 0x-prefixed hex, bare hex, base64, a Buffer,
 * or a JSON-serialized Buffer. Treat the token as opaque concurrency data and
 * normalize it before validation/comparison.
 */
export function normalizeSqlRowVersion(value: unknown): string | null {
  if (Buffer.isBuffer(value)) return fromBytes(value);
  if (value instanceof Uint8Array) return fromBytes(value);
  if (value instanceof ArrayBuffer) return fromBytes(new Uint8Array(value));

  if (typeof value === "object" && value !== null) {
    const candidate = value as { type?: unknown; data?: unknown };
    if (
      candidate.type === "Buffer" &&
      Array.isArray(candidate.data) &&
      candidate.data.length === 8 &&
      candidate.data.every(
        (item) => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 255,
      )
    ) {
      return fromBytes(Buffer.from(candidate.data as number[]));
    }
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const prefixedHex = PREFIXED_HEX_ROW_VERSION.exec(trimmed);
  if (prefixedHex) return `0x${prefixedHex[1].toUpperCase()}`;
  if (HEX_ROW_VERSION.test(trimmed)) return `0x${trimmed.toUpperCase()}`;

  return decodeBase64RowVersion(trimmed);
}


/** Converts an API row-version token back to the exact 8 bytes SQL Server compares. */
export function rowVersionToBuffer(value: unknown): Buffer | null {
  const normalized = normalizeSqlRowVersion(value);
  if (!normalized) return null;
  return Buffer.from(normalized.slice(2), "hex");
}
