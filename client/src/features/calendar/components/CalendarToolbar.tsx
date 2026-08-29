import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

import type { CalendarViewMode } from '../types/calendar.types'

interface Props {
  title: string
  viewMode: CalendarViewMode
  onViewModeChange: (viewMode: CalendarViewMode) => void
  onPrevious: () => void
  onToday: () => void
  onNext: () => void
}

export function CalendarToolbar({
  onNext,
  onPrevious,
  onToday,
  onViewModeChange,
  title,
  viewMode,
}: Props) {
  const { i18n, t } = useTranslation()
  const isRtl = i18n.dir() === 'rtl'
  const PreviousIcon = isRtl ? ChevronRight : ChevronLeft
  const NextIcon = isRtl ? ChevronLeft : ChevronRight

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
            aria-label={t('calendar.previousMonth')}
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
            aria-label={t('calendar.nextMonth')}
            onClick={onNext}
          >
            <NextIcon aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      <div
        className="bg-muted/60 grid grid-cols-2 gap-1 rounded-xl p-1 sm:w-fit"
        aria-label={t('calendar.viewModeLabel')}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={viewMode === 'MONTH'}
          className={cn(
            'justify-center',
            viewMode === 'MONTH' &&
              'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
          )}
          onClick={() => onViewModeChange('MONTH')}
        >
          <CalendarDays aria-hidden="true" className="size-4" />
          {t('calendar.monthView')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={viewMode === 'AGENDA'}
          className={cn(
            'justify-center',
            viewMode === 'AGENDA' &&
              'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
          )}
          onClick={() => onViewModeChange('AGENDA')}
        >
          <List aria-hidden="true" className="size-4" />
          {t('calendar.agendaView')}
        </Button>
      </div>
    </div>
  )
}
