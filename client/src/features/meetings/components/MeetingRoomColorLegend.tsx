import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { MeetingRoom } from '@/features/meetings/types/meeting.types'
import { getMeetingRoomAccent } from '@/features/meetings/meeting-room-colors'

interface Props {
  rooms: MeetingRoom[]
}

export function MeetingRoomColorLegend({ rooms }: Props) {
  const { i18n, t } = useTranslation()

  if (rooms.length === 0) return null

  return (
    <section
      aria-label={t('meetings.schedulePage.roomColorLegend')}
      className="rounded-xl border border-border/70 bg-card/75 px-4 py-3 shadow-sm sm:px-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Info aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              {t('meetings.schedulePage.roomColorLegend')}
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t('meetings.schedulePage.roomColorLegendHint')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 lg:justify-end">
          {rooms.map((room) => {
            const roomName = i18n.language.startsWith('ar') ? room.nameAr : room.nameEn
            return (
              <span
                key={room.id}
                className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-foreground/85"
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                  style={{ backgroundColor: getMeetingRoomAccent(room.colorKey) }}
                />
                <span className="max-w-56 truncate" title={roomName}>
                  {roomName}
                </span>
              </span>
            )
          })}
        </div>
      </div>
    </section>
  )
}

