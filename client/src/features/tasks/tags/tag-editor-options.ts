/** UI presets for personal task tags. The database still stores ordinary #RRGGBB values. */
export const TAG_COLOR_PRESETS = [
  '#2563EB', // blue
  '#0891B2', // cyan
  '#0D9488', // teal
  '#16A34A', // green
  '#CA8A04', // amber
  '#EA580C', // orange
  '#DC2626', // red
  '#9333EA', // purple
  '#DB2777', // pink
  '#475569', // slate
] as const

export const TAG_ICON_MAX_BYTES = 262_144
export type TagImageError = 'type' | 'size' | 'empty' | null

export function validateTagImageFile(file: Pick<File, 'type' | 'size'>): TagImageError {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'type'
  if (file.size === 0) return 'empty'
  if (file.size > TAG_ICON_MAX_BYTES) return 'size'
  return null
}
