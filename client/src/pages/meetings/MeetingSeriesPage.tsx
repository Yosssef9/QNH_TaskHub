import { CalendarDays, CalendarPlus2, ChevronLeft, ChevronRight, Clock3, DoorOpen, Repeat2, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMeetingSeriesList } from '@/features/meetings/series/use-meeting-series'
import type { MeetingSeriesDerivedState, MeetingSeriesListState } from '@/features/meetings/series/meeting-series.types'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { formatDateTime, formatTimeRange } from '@/lib/date-time'

function stateVariant(state: MeetingSeriesDerivedState) {
  if (state === 'UPCOMING') return 'success' as const
  if (state === 'ALL_CANCELLED') return 'destructive' as const
  return 'secondary' as const
}

function formatDateOnly(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    numberingSystem: 'latn',
    timeZone: 'Asia/Riyadh',
  }).format(new Date(value))
}

export function MeetingSeriesPage() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const timeFormat = useTimeFormatPreference()
  const locale = i18n.language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-SA'
  const arabic = i18n.language.startsWith('ar')
  const [search, setSearch] = useState('')
  const [state, setState] = useState<MeetingSeriesListState>('ALL')
  const [page, setPage] = useState(1)
  const pageSize = 12

  const query = useMeetingSeriesList({ ...(search ? { search } : {}), state, page, pageSize })
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / pageSize))
  const items = query.data?.items ?? []
  const futureMeetings = useMemo(() => items.reduce((sum, item) => sum + item.upcomingCount, 0), [items])
  const customized = useMemo(() => items.reduce((sum, item) => sum + item.customizedCount, 0), [items])

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('meetings.seriesManagement.title')}
        description={t('meetings.seriesManagement.description')}
        actions={(
          <Button onClick={() => navigate('/meetings/series/new')}>
            <CalendarPlus2 aria-hidden="true" className="size-4" />
            {t('meetings.seriesManagement.scheduleMultiple')}
          </Button>
        )}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{t('meetings.seriesManagement.seriesCount')}</p>
          <p className="mt-2 text-2xl font-bold">{query.data?.total ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{t('meetings.seriesManagement.futureOnPage')}</p>
          <p className="mt-2 text-2xl font-bold">{futureMeetings}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{t('meetings.seriesManagement.customizedOnPage')}</p>
          <p className="mt-2 text-2xl font-bold">{customized}</p>
        </Card>
      </section>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
          <SearchInput
            value={search}
            onChange={(value) => { setSearch(value); setPage(1) }}
            placeholder={t('meetings.seriesManagement.searchPlaceholder')}
            ariaLabel={t('meetings.seriesManagement.searchPlaceholder')}
          />
          <Select value={state} onValueChange={(value) => { setState(value as MeetingSeriesListState); setPage(1) }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('meetings.seriesManagement.states.ALL')}</SelectItem>
              <SelectItem value="UPCOMING">{t('meetings.seriesManagement.states.UPCOMING')}</SelectItem>
              <SelectItem value="COMPLETED">{t('meetings.seriesManagement.states.COMPLETED')}</SelectItem>
              <SelectItem value="ALL_CANCELLED">{t('meetings.seriesManagement.states.ALL_CANCELLED')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {query.isLoading ? <LoadingState className="min-h-72" /> : null}
      {query.isError ? (
        <ErrorState
          className="min-h-72"
          title={t('meetings.seriesManagement.loadErrorTitle')}
          description={t('meetings.seriesManagement.loadErrorDescription')}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.isSuccess && items.length === 0 ? (
        <Card className="grid min-h-64 place-items-center p-8 text-center">
          <div>
            <Repeat2 aria-hidden="true" className="text-muted-foreground mx-auto size-9" />
            <h2 className="mt-3 font-semibold">{t('meetings.seriesManagement.emptyTitle')}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{t('meetings.seriesManagement.emptyDescription')}</p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((item) => (
          <Card key={item.seriesId} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold">{item.title}</h2>
                  <Badge variant={stateVariant(item.state)}>{t(`meetings.seriesManagement.states.${item.state}`)}</Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {item.creationMode === 'PATTERN'
                    ? t('meetings.seriesManagement.repeatPattern')
                    : t('meetings.seriesManagement.customSchedule')}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/meetings/series/${item.seriesId}`)}>
                {t('meetings.seriesManagement.openSeries')}
              </Button>
            </div>

            <div className="text-muted-foreground mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <span className="inline-flex items-center gap-2">
                <CalendarDays aria-hidden="true" className="size-4" />
                {formatDateOnly(item.originalStartAtUtc, locale)} – {formatDateOnly(item.originalEndAtUtc, locale)}
              </span>
              <span className="inline-flex items-center gap-2">
                <Sparkles aria-hidden="true" className="size-4" />
                {t('meetings.seriesManagement.meetingCounts', { total: item.meetingCount, upcoming: item.upcomingCount, customized: item.customizedCount })}
              </span>
            </div>

            {item.nextMeeting ? (
              <div className="bg-muted/35 mt-4 rounded-xl border p-3">
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{t('meetings.seriesManagement.nextMeeting')}</p>
                <p className="mt-1 font-medium">{formatDateTime(item.nextMeeting.startAtUtc, locale, timeFormat, { dateStyle: 'medium' })}</p>
                <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-3.5" />{formatTimeRange(item.nextMeeting.startAtUtc, item.nextMeeting.endAtUtc, locale, timeFormat)}</span>
                  <span className="inline-flex items-center gap-1.5"><DoorOpen aria-hidden="true" className="size-3.5" />{arabic ? item.nextMeeting.roomNameAr : item.nextMeeting.roomNameEn}</span>
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      {query.isSuccess && query.data.total > pageSize ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">{t('meetings.seriesManagement.pageOf', { page, total: totalPages })}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              {arabic ? <ChevronRight aria-hidden="true" className="size-4" /> : <ChevronLeft aria-hidden="true" className="size-4" />}
              {t('meetings.seriesManagement.previousPage')}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              {t('meetings.seriesManagement.nextPage')}
              {arabic ? <ChevronLeft aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
