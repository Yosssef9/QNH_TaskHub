export const APP_TIME_ZONE = 'Asia/Riyadh'

export function formatDateTime(value: Date | string | number, locale = 'en-SA'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value))
}
