import { Clock3, ListChecks, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'

import type { MeetingAgendaItem } from '../types/meeting.types'

interface MeetingAgendaDisplayProps {
  items: MeetingAgendaItem[]
  meetingDurationMinutes?: number
  variant?: 'full' | 'compact'
  className?: string
}

function agendaMinutes(items: MeetingAgendaItem[]): number {
  return items.reduce((total, item) => total + (item.plannedDurationMinutes ?? 0), 0)
}

export function MeetingAgendaDisplay({
  items,
  meetingDurationMinutes,
  variant = 'full',
  className,
}: MeetingAgendaDisplayProps) {
  const { t } = useTranslation()
  const plannedMinutes = agendaMinutes(items)
  const hasPlannedTime = items.some((item) => item.plannedDurationMinutes !== null)

  if (variant === 'compact') {
    const visibleItems = items.slice(0, 3)
    const hiddenCount = Math.max(0, items.length - visibleItems.length)

    return (
      <section className={cn('rounded-xl border bg-muted/15 p-3', className)}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-semibold">
            <ListChecks aria-hidden="true" className="text-primary size-4" />
            {t('meetings.create.agenda.title')}
          </span>
          {items.length > 0 ? (
            <span className="text-muted-foreground text-[11px] font-medium">
              {t('meetings.create.agenda.topicCount', { count: items.length })}
            </span>
          ) : null}
        </div>

        {visibleItems.length > 0 ? (
          <ol className="mt-2.5 space-y-2">
            {visibleItems.map((item, index) => (
              <li key={item.id} className="flex min-w-0 items-start gap-2 text-xs">
                <span className="bg-background text-muted-foreground grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 block font-medium">{item.topic}</span>
                  {item.presenter || item.plannedDurationMinutes !== null ? (
                    <span className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
                      {item.presenter ? <span>{item.presenter.userName}</span> : null}
                      {item.plannedDurationMinutes !== null ? (
                        <span className="tabular-nums">
                          {t('meetings.create.agenda.minutesValue', {
                            count: item.plannedDurationMinutes,
                          })}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs italic">
            {t('meetings.create.agenda.noAgenda')}
          </p>
        )}

        {hiddenCount > 0 ? (
          <p className="text-primary mt-2 text-[11px] font-semibold">
            {t('meetings.create.agenda.moreTopics', { count: hiddenCount })}
          </p>
        ) : null}
      </section>
    )
  }

  return (
    <Card className={cn('border-border/70 p-5 shadow-sm sm:p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
            <ListChecks aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold">{t('meetings.create.agenda.title')}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('meetings.workspace.agendaDescription')}
            </p>
          </div>
        </div>
        {items.length > 0 ? (
          <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-semibold">
            {t('meetings.create.agenda.topicCount', { count: items.length })}
          </span>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="mt-5 space-y-2.5">
          {items.map((item, index) => (
            <div key={item.id} className="hover:bg-muted/25 flex items-start gap-3 rounded-xl border border-border/70 bg-muted/10 p-3.5 transition-colors">
              <span className="bg-background text-primary grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold shadow-xs">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-6">{item.topic}</p>
                {item.presenter || item.plannedDurationMinutes !== null ? (
                  <div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {item.presenter ? (
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound aria-hidden="true" className="size-3.5" />
                        {item.presenter.userName}
                      </span>
                    ) : null}
                    {item.plannedDurationMinutes !== null ? (
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <Clock3 aria-hidden="true" className="size-3.5" />
                        {t('meetings.create.agenda.minutesValue', {
                          count: item.plannedDurationMinutes,
                        })}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-muted/15 mt-5 rounded-xl border border-dashed px-5 py-9 text-center">
          <span className="bg-primary/10 text-primary mx-auto grid size-11 place-items-center rounded-full">
            <ListChecks aria-hidden="true" className="size-5" />
          </span>
          <p className="mt-3 text-sm font-semibold">{t('meetings.create.agenda.noAgenda')}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t('meetings.workspace.agendaDescription')}</p>
        </div>
      )}

      {hasPlannedTime ? (
        <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-xs">
          <Clock3 aria-hidden="true" className="size-3.5" />
          {meetingDurationMinutes ? (
            <span>
              {t('meetings.create.agenda.timeValue', {
                planned: plannedMinutes,
                meeting: meetingDurationMinutes,
              })}
            </span>
          ) : (
            <span>{t('meetings.create.agenda.plannedTotal', { minutes: plannedMinutes })}</span>
          )}
          <span>·</span>
          <span>{t('meetings.create.agenda.timeOptionalShort')}</span>
        </div>
      ) : null}
    </Card>
  )
}
