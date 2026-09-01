import { CalendarClock, MapPin, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { MeetingScheduleEntry } from '@/features/meetings/types/meeting.types'
import { cn } from '@/lib/cn'

interface Props {
  meeting: MeetingScheduleEntry
  monthGrid: boolean
  timeText: string
}

export function CalendarMeetingEvent({ meeting, monthGrid, timeText }: Props) {
  const { i18n, t } = useTranslation()
  const isArabic = i18n.language.toLowerCase().startsWith('ar')
  const roomName = isArabic ? meeting.room.nameAr : meeting.room.nameEn
  const title = meeting.visibility === 'BUSY' ? t('calendar.meetingBusy') : meeting.title

  if (monthGrid) {
    return (
      <div
        className={cn(
          'flex min-w-0 items-center gap-1.5 rounded-md border px-1.5 py-1 text-[10px] font-medium sm:text-xs',
          meeting.visibility === 'BUSY'
            ? 'border-border/80 bg-muted/70 text-muted-foreground'
            : 'border-primary/20 bg-primary/10 text-primary',
        )}
      >
        <CalendarClock aria-hidden="true" className="size-3 shrink-0" />
        {timeText ? <span className="shrink-0 tabular-nums">{timeText}</span> : null}
        <span className="min-w-0 truncate">{title}</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col gap-1 overflow-hidden rounded-md border p-1.5 text-[11px]',
        meeting.visibility === 'BUSY'
          ? 'border-border bg-muted/80 text-muted-foreground'
          : 'border-primary/25 bg-primary/12 text-foreground',
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 font-semibold">
        <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{title}</span>
      </div>

      {timeText ? (
        <span className="shrink-0 text-[10px] font-medium tabular-nums opacity-80">{timeText}</span>
      ) : null}

      <span className="flex min-w-0 items-center gap-1 text-[10px]">
        <MapPin aria-hidden="true" className="size-3 shrink-0" />
        <span className="truncate">{roomName}</span>
      </span>

      {meeting.visibility === 'BUSY' ? (
        <span className="flex min-w-0 items-center gap-1 text-[10px]">
          <UserRound aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate">
            {t('calendar.organizerName', { name: meeting.organizer.userName })}
          </span>
        </span>
      ) : null}
    </div>
  )
}
