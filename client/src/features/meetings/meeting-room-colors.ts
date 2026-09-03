export const MEETING_ROOM_COLOR_OPTIONS = [
  { key: 'BLUE', accent: '#2563EB' },
  { key: 'PURPLE', accent: '#7C3AED' },
  { key: 'GREEN', accent: '#16A34A' },
  { key: 'ORANGE', accent: '#EA580C' },
  { key: 'RED', accent: '#DC2626' },
  { key: 'GOLD', accent: '#CA8A04' },
  { key: 'SLATE', accent: '#475569' },
  { key: 'PINK', accent: '#DB2777' },
] as const

export type MeetingRoomColorKey = (typeof MEETING_ROOM_COLOR_OPTIONS)[number]['key']

const MEETING_ROOM_COLOR_MAP = Object.fromEntries(
  MEETING_ROOM_COLOR_OPTIONS.map((option) => [option.key, option]),
) as Record<MeetingRoomColorKey, (typeof MEETING_ROOM_COLOR_OPTIONS)[number]>

export function getMeetingRoomColor(
  colorKey: MeetingRoomColorKey | string | null | undefined,
): (typeof MEETING_ROOM_COLOR_OPTIONS)[number] {
  if (colorKey && colorKey in MEETING_ROOM_COLOR_MAP) {
    return MEETING_ROOM_COLOR_MAP[colorKey as MeetingRoomColorKey]
  }
  return MEETING_ROOM_COLOR_OPTIONS[0]
}

export function getMeetingRoomAccent(
  colorKey: MeetingRoomColorKey | string | null | undefined,
): string {
  return getMeetingRoomColor(colorKey).accent
}
