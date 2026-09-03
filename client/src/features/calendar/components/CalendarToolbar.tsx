import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TimeFormatPreference } from '@/features/auth/types/auth.types'
import { cn } from '@/lib/cn'

import type { CalendarViewMode } from '../types/calendar.types'

interface Props {
  title: string
  viewMode: CalendarViewMode
  meetingsEnabled: boolean
  onViewModeChange: (viewMode: CalendarViewMode) => void
  onPrevious: () => void
  onToday: () => void
  onNext: () => void
  showAdjacentDates: boolean
  displayPreferencePending: boolean
  onShowAdjacentDatesChange: (showAdjacentDates: boolean) => void
  showTimeFormat: boolean
  timeFormat: TimeFormatPreference
  timeFormatPending: boolean
  onTimeFormatChange: (timeFormat: TimeFormatPreference) => void
}

export function CalendarToolbar({
  onNext,
  onPrevious,
  onToday,
  onViewModeChange,
  title,
  viewMode,
  meetingsEnabled,
  showAdjacentDates,
  displayPreferencePending,
  onShowAdjacentDatesChange,
  showTimeFormat,
  timeFormat,
  timeFormatPending,
  onTimeFormatChange,
}: Props) {
  const { i18n, t } = useTranslation()
  const isRtl = i18n.dir() === 'rtl'
  const PreviousIcon = isRtl ? ChevronRight : ChevronLeft
  const NextIcon = isRtl ? ChevronLeft : ChevronRight

  const views: Array<{
    value: CalendarViewMode
    icon: typeof CalendarDays
    label: string
    visible: boolean
  }> = [
    { value: 'MONTH', icon: CalendarDays, label: t('calendar.monthView'), visible: true },
    { value: 'WEEK', icon: CalendarRange, label: t('calendar.weekView'), visible: meetingsEnabled },
    { value: 'DAY', icon: Clock3, label: t('calendar.dayView'), visible: meetingsEnabled },
    { value: 'AGENDA', icon: List, label: t('calendar.agendaView'), visible: true },
  ]

  return (
    <div className="space-y-3 border-b px-3 py-3 sm:px-5 sm:py-4 lg:flex lg:items-center lg:justify-between lg:gap-4 lg:space-y-0">
      <div className="flex min-w-0 items-center justify-between gap-3 lg:justify-start">
        <h2 className="min-w-0 truncate text-base font-semibold sm:text-lg" aria-live="polite">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            aria-label={t('calendar.previousPeriod')}
            onClick={onPrevious}
          >
            <PreviousIcon aria-hidden="true" className="size-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-9 px-3" onClick={onToday}>
            {t('calendar.today')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            aria-label={t('calendar.nextPeriod')}
            onClick={onNext}
          >
            <NextIcon aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {viewMode === 'MONTH' ? (
          <Select
            value={showAdjacentDates ? 'ADJACENT' : 'CURRENT'}
            disabled={displayPreferencePending}
            onValueChange={(value) => onShowAdjacentDatesChange(value === 'ADJACENT')}
          >
            <SelectTrigger className="h-9 w-full sm:w-56" aria-label={t('calendar.monthDisplayLabel')}>
              <CalendarDays aria-hidden="true" className="text-primary size-4 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CURRENT">{t('calendar.currentMonthOnly')}</SelectItem>
              <SelectItem value="ADJACENT">{t('calendar.includeAdjacentDates')}</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        {showTimeFormat ? (
          <Select
            value={timeFormat}
            disabled={timeFormatPending}
            onValueChange={(value) => onTimeFormatChange(value as TimeFormatPreference)}
          >
            <SelectTrigger
              className="h-9 w-full sm:w-[8.5rem]"
              aria-label={t('calendar.timeFormatLabel')}
              title={t('calendar.timeFormatGlobalHint')}
            >
              <Clock3 aria-hidden="true" className="text-primary size-4 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12H">
                {t('calendar.timeFormat12Hour')} · {t('calendar.timeFormatExample12')}
              </SelectItem>
              <SelectItem value="24H">
                {t('calendar.timeFormat24Hour')} · {t('calendar.timeFormatExample24')}
              </SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        <div
          className={cn(
            'bg-muted/60 grid gap-1 rounded-xl p-1 sm:w-fit',
            meetingsEnabled ? 'grid-cols-4' : 'grid-cols-2',
          )}
          aria-label={t('calendar.viewModeLabel')}
        >
          {views
            .filter((view) => view.visible)
            .map((view) => {
              const Icon = view.icon
              return (
                <Button
                  key={view.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={viewMode === view.value}
                  className={cn(
                    'justify-center px-2.5',
                    viewMode === view.value &&
                      'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
                  )}
                  onClick={() => onViewModeChange(view.value)}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  <span className="hidden md:inline">{view.label}</span>
                </Button>
              )
            })}
        </div>
      </div>
    </div>
  )
}
