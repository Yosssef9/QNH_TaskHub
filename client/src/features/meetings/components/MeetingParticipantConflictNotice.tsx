import { AlertTriangle, ArrowUpRight, ChevronDown, Loader2, MapPin, UserRound, Video } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { cn } from '@/lib/cn'
import { formatTimeRange } from '@/lib/date-time'

import type {
  MeetingParticipantAvailability,
  MeetingParticipantConflictWindow,
} from '../types/meeting.types'

function ConflictWindow({
  window,
  locale,
  timeFormat,
  arabic,
}: {
  window: MeetingParticipantConflictWindow
  locale: string
  timeFormat: ReturnType<typeof useTimeFormatPreference>
  arabic: boolean
}) {
  const { t } = useTranslation()
  const meeting = window.meeting
  const time = formatTimeRange(window.startAtUtc, window.endAtUtc, locale, timeFormat)

  if (!meeting) {
    return (
      <div className="bg-background/70 rounded-md border border-warning/15 px-2.5 py-2">
        <p className="text-foreground text-xs font-semibold">
          {t('meetings.participantAvailability.anotherMeeting')}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">{time}</p>
      </div>
    )
  }

  const roomName = meeting.room
    ? arabic
      ? meeting.room.nameAr
      : meeting.room.nameEn
    : null
  const locationLabel =
    meeting.meetingMode === 'ZOOM'
      ? t('meetings.zoom.zoomType')
      : roomName ?? t('meetings.participantAvailability.meetingRoom')
  const locationText = meeting.room?.locationText?.trim()
    ? `${locationLabel} · ${meeting.room.locationText.trim()}`
    : locationLabel

  return (
    <div className="bg-background/80 rounded-md border border-warning/20 px-2.5 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-xs font-semibold" title={meeting.title}>
            {meeting.title}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">{time}</p>
        </div>
        {meeting.visibility === 'PREVIEW' ? (
          <span className="text-muted-foreground shrink-0 text-[10px] font-medium">
            {t('meetings.participantAvailability.previewOnly')}
          </span>
        ) : null}
      </div>

      <div className="text-muted-foreground mt-2 space-y-1 text-[11px] leading-4">
        <p className="flex items-center gap-1.5">
          <UserRound aria-hidden="true" className="size-3 shrink-0" />
          <span>
            {t('meetings.participantAvailability.organizer', {
              name: meeting.organizer.userName,
            })}
          </span>
        </p>
        <p className="flex items-center gap-1.5">
          {meeting.meetingMode === 'ZOOM' ? (
            <Video aria-hidden="true" className="size-3 shrink-0" />
          ) : (
            <MapPin aria-hidden="true" className="size-3 shrink-0" />
          )}
          <span>{locationText}</span>
        </p>
      </div>

      {meeting.visibility === 'FULL' && meeting.meetingId !== null ? (
        <Link
          to={`/meetings/${meeting.meetingId}`}
          className="text-primary mt-2 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
        >
          {t('meetings.participantAvailability.openMeeting')}
          <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
        </Link>
      ) : null}
    </div>
  )
}

export function MeetingParticipantConflictNotice({
  availability,
  isChecking = false,
  isError = false,
  className,
}: {
  availability: MeetingParticipantAvailability | undefined
  isChecking?: boolean
  isError?: boolean
  className?: string
}) {
  const { i18n, t } = useTranslation()
  const timeFormat = useTimeFormatPreference()
  const [showAll, setShowAll] = useState(false)
  const arabic = i18n.language.startsWith('ar')
  const locale = arabic ? 'ar-SA-u-ca-gregory' : 'en-SA'

  const conflicts = availability?.conflicts ?? []
  const visibleConflicts = useMemo(
    () => (showAll ? conflicts : conflicts.slice(0, 3)),
    [conflicts, showAll],
  )

  if (isChecking && !availability) {
    return (
      <div className={cn('text-muted-foreground flex items-center gap-2 text-xs', className)} role="status">
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        {t('meetings.participantAvailability.checking')}
      </div>
    )
  }

  if (isError) {
    return (
      <div className={cn('border-warning/35 bg-warning/5 text-warning-foreground flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm', className)}>
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">{t('meetings.participantAvailability.checkFailed')}</p>
          <p className="mt-0.5 text-xs opacity-85">
            {t('meetings.participantAvailability.nonBlocking')}
          </p>
        </div>
      </div>
    )
  }

  if (!availability || availability.conflictParticipantCount === 0) return null

  return (
    <div className={cn('border-warning/40 bg-warning/5 rounded-xl border p-3.5', className)}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle aria-hidden="true" className="text-warning-foreground mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-warning-foreground text-sm font-semibold">
            {t('meetings.participantAvailability.summary', {
              count: availability.conflictParticipantCount,
            })}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-5">
            {t('meetings.participantAvailability.nonBlocking')}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {visibleConflicts.map((conflict) => (
          <div
            key={conflict.participant.userId}
            className="bg-background/70 rounded-lg border border-warning/20 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{conflict.participant.userName}</p>
                <p className="text-muted-foreground text-[11px]">{conflict.participant.userCode}</p>
              </div>
              <span className="text-warning-foreground text-xs font-semibold">
                {t('meetings.participantAvailability.conflictLabel')}
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {conflict.overlaps.map((window, index) => (
                <ConflictWindow
                  key={`${window.startAtUtc}-${window.endAtUtc}-${index}`}
                  window={window}
                  locale={locale}
                  timeFormat={timeFormat}
                  arabic={arabic}
                />
              ))}
              {conflict.conflictCount > conflict.overlaps.length ? (
                <p className="text-muted-foreground text-xs">
                  {t('meetings.participantAvailability.moreConflicts', {
                    count: conflict.conflictCount - conflict.overlaps.length,
                  })}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {conflicts.length > 3 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-8 px-2 text-xs"
          onClick={() => setShowAll((current) => !current)}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('size-3.5 transition-transform', showAll && 'rotate-180')}
          />
          {t(showAll ? 'meetings.participantAvailability.showLess' : 'meetings.participantAvailability.showAll', {
            count: conflicts.length,
          })}
        </Button>
      ) : null}
    </div>
  )
}
