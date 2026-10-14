/** SQL Server BIGINT identity values may arrive as decimal strings. */
export function normalizeTagId(value: unknown): number {
  const parsed =
    typeof value === 'string' && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : value

  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Invalid TaskHub tag identifier.')
  }

  return parsed
}

export function normalizeTagIds(values: readonly unknown[]): number[] {
  return values.map(normalizeTagId)
}

export function normalizeTagRecord<T extends { id: unknown }>(tag: T): Omit<T, 'id'> & { id: number } {
  return { ...tag, id: normalizeTagId(tag.id) }
}
