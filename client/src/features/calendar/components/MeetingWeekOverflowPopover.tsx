import { CalendarDays, MapPin, UsersRound } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import type { TimeFormatPreference } from '@/features/auth/types/auth.types'
import { getMeetingRoomAccent } from '@/features/meetings/meeting-room-colors'
import type { MeetingScheduleEntry } from '@/features/meetings/types/meeting.types'
import { formatMeetingCardTimeRange } from './CalendarMeetingEvent'

export interface MeetingWeekOverflowState {
  anchor: {
    left: number
    top: number
    width: number
    height: number
  }
  date: string
  meetings: MeetingScheduleEntry[]
}

interface Props {
  state: MeetingWeekOverflowState | null
  timeFormat: TimeFormatPreference
  onClose: () => void
  onOpenDay: (date: string) => void
  onOpenMeeting: (meetingId: number) => void
}

function dateOnlyToUtcNoon(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12))
}

export function MeetingWeekOverflowPopover({
  state,
  timeFormat,
  onClose,
  onOpenDay,
  onOpenMeeting,
}: Props) {
  const { i18n, t } = useTranslation()
  const isArabic = i18n.language.toLowerCase().startsWith('ar')
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }),
    [i18n.language],
  )

  if (!state) return null

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed z-40"
          style={{
            left: state.anchor.left,
            top: state.anchor.top,
            width: state.anchor.width,
            height: state.anchor.height,
          }}
        />
      </PopoverAnchor>

      <PopoverContent
        dir={i18n.dir()}
        side="bottom"
        align="start"
        sideOffset={7}
        collisionPadding={12}
        className="meeting-week-overflow-popover w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden p-0 shadow-xl"
      >
        <div className="border-b border-border/70 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
              <CalendarDays aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                {t('calendar.moreMeetingsTitle', { count: state.meetings.length })}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {dateFormatter.format(dateOnlyToUtcNoon(state.date))}
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-80 space-y-1.5 overflow-y-auto p-2">
          {state.meetings.map((meeting, index) => {
            const roomName = isArabic ? meeting.room.nameAr : meeting.room.nameEn
            const title = meeting.visibility === 'BUSY' ? t('calendar.meetingBusy') : meeting.title
            const isFull = meeting.visibility === 'FULL'
            const meetingId = isFull ? meeting.meetingId : null
            const statusLabel =
              meeting.visibility === 'FULL' && meeting.hasPendingReschedule
                ? t('calendar.rescheduleRequested')
                : null
            const accent = getMeetingRoomAccent(meeting.room.colorKey)
            const style = { '--meeting-room-accent': accent } as CSSProperties
            const rangeText = formatMeetingCardTimeRange(
              meeting.startAtUtc,
              meeting.endAtUtc,
              i18n.language,
              timeFormat,
            )

            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="meeting-week-overflow-accent absolute inset-y-2 start-0 w-1 rounded-full"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-bold text-foreground">
                      {title}
                    </span>
                    {statusLabel ? (
                      <span className="meeting-status-badge shrink-0">{statusLabel}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground sm:text-[11px]">
                    <span dir="ltr" className="font-semibold tabular-nums text-foreground/80">
                      {rangeText}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPin aria-hidden="true" className="size-3 shrink-0" />
                      <span className="min-w-0 truncate">{roomName}</span>
                    </span>
                    {meeting.visibility === 'FULL' ? (
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <UsersRound aria-hidden="true" className="size-3" />
                        {meeting.participantCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </>
            )

            if (meetingId) {
              return (
                <button
                  key={`meeting-${meetingId}`}
                  type="button"
                  style={style}
                  className="meeting-week-overflow-item relative flex w-full min-w-0 items-start gap-2 overflow-hidden rounded-lg border border-border/70 bg-card px-3 py-2.5 ps-4 text-start outline-none transition hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    onClose()
                    onOpenMeeting(meetingId)
                  }}
                >
                  {content}
                </button>
              )
            }

            return (
              <div
                key={`${meeting.visibility}-${meeting.room.id}-${meeting.startAtUtc}-${index}`}
                style={style}
                className="meeting-week-overflow-item relative flex min-w-0 items-start gap-2 overflow-hidden rounded-lg border border-border/70 bg-card px-3 py-2.5 ps-4 text-start"
              >
                {content}
              </div>
            )
          })}
        </div>

        <div className="border-t border-border/70 bg-muted/20 p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => {
              onClose()
              onOpenDay(state.date)
            }}
          >
            {t('calendar.viewDay')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
