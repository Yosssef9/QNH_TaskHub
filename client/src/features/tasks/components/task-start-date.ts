/** The same business timezone used by the TaskHub backend (APP_TIME_ZONE). */
export function getTodayInRiyadh(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function isInvalidNormalTaskStartDate(
  selected: string | null | undefined,
  previous: string | null | undefined,
  today: string,
): boolean {
  return Boolean(selected && selected !== previous && selected < today)
}
