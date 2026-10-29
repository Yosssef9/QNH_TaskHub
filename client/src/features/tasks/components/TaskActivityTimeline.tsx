import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { formatDateTime } from '@/lib/date-time'

import type { Subtask, TaskActivity } from '../types/task.types'

type ChangedField = 'title' | 'description' | 'priority' | 'startDate' | 'dueDate' | 'agendaItemId' | 'assigneeUserIds' | 'tagIds'
const AUDIT_FIELDS: readonly ChangedField[] = ['title', 'description', 'priority', 'startDate', 'dueDate', 'agendaItemId', 'assigneeUserIds', 'tagIds']

function activityChanges(event: TaskActivity['eventData']): Array<{field: ChangedField; from: string | null; to: string | null}> {
  const entries = event?.changes
  if (!Array.isArray(entries)) return []
  return entries.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const value = entry as Record<string, unknown>
    if (!AUDIT_FIELDS.some((field) => field === value.field)) return []
    if (!(value.from === null || typeof value.from === 'string')) return []
    if (!(value.to === null || typeof value.to === 'string')) return []
    return [{field: value.field as ChangedField, from: value.from as string | null, to: value.to as string | null}]
  })
}
import { taskActivityDetails } from './task-activity-details'

/** Keep each person's name, user code and email together in both RTL and LTR. */
function ActivityPerson({ label, name, code, email }: {
  label: string
  name: string
  code: string | null
  email: string | null
}) {
  return <div className="min-w-0 space-y-1">
    <p className="text-muted-foreground text-xs font-medium">{label}</p>
    <div className="min-w-0 space-y-1">
      <p className="min-w-0 text-sm">
        <span dir="ltr" className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 align-baseline [unicode-bidi:isolate]">
          <bdi dir="auto" className="min-w-0 break-words font-medium">{name}</bdi>
          {code && <>
            <span aria-hidden="true" className="text-muted-foreground">-</span>
            <bdi dir="ltr" className="text-muted-foreground text-xs tabular-nums">{code}</bdi>
          </>}
        </span>
      </p>
      {email && <p className="min-w-0 text-xs text-muted-foreground">
        <bdi dir="ltr" className="inline-block max-w-full break-all [unicode-bidi:isolate]">{email}</bdi>
      </p>}
    </div>
  </div>
}

export function TaskActivityTimeline({ activity, subtasks }: {
  activity: TaskActivity[]
  subtasks: Subtask[]
}) {
  const { t, i18n } = useTranslation()
  const timeFormat = useTimeFormatPreference()

  return <Card>
    <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
      <CardTitle>{t('tasks.details.activity')}</CardTitle>
      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">{activity.length}</span>
    </CardHeader>
    <CardContent>
      {activity.length ? <ol className="max-h-[38rem] space-y-0 overflow-y-auto pe-2">
        {activity.map(item => {
          const detail = taskActivityDetails(item, subtasks)
          const changes = activityChanges(item.eventData)
          return <li key={item.id} className="border-border relative border-s py-3 ps-5 text-sm last:pb-0">
            <span className="bg-primary ring-background absolute -start-[4.5px] top-[1.15rem] size-2 rounded-full ring-4" />
            <div className="w-full min-w-0 max-w-2xl space-y-2 text-start">
              <div className="min-w-0 space-y-1">
                <p className="break-words font-semibold">{t(`tasks.details.activities.${item.activityType}`, {
                  defaultValue: item.activityType, assigneeName: detail.assigneeName ?? '',
                })}</p>
                {item.activityType==='STATUS_CHANGED' && typeof item.eventData?.proxyOfName==='string' ?
                  <p className="text-muted-foreground text-xs">{t('tasks.proxy.completedByProxy', {
                    actor:item.actorName,principal:item.eventData.proxyOfName,
                  })}</p>:null}
                {detail.subtaskTitle && <p className="break-words text-xs font-medium">{t('tasks.details.activitySubtask', {name:detail.subtaskTitle})}</p>}
                {detail.fileName && <p className="text-muted-foreground break-all text-xs">{t('tasks.details.activityFile',{name:detail.fileName})}</p>}
                {detail.from && detail.to && <p className="text-muted-foreground text-xs">
                  <bdi dir="auto" className="break-words">{detail.from}</bdi> <span aria-hidden="true">→</span> <bdi dir="auto" className="break-words">{detail.to}</bdi>
                </p>}
                {changes.length > 0 && <ul className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
                  {changes.map((change) => <li key={change.field} className="min-w-0 break-words">
                    <span className="font-semibold">{change.field === 'agendaItemId'
                      ? t('meetings.followUp.relatedAgenda')
                      : change.field === 'assigneeUserIds'
                        ? t('meetings.followUp.assignTo')
                        : change.field === 'tagIds'
                          ? t('tags.title')
                          : t(`tasks.details.activityFields.${change.field}`)}:</span>{' '}
                    <bdi dir="auto">{change.from ?? t('tasks.details.notSet')}</bdi>{' '}
                    <span aria-hidden="true">→</span>{' '}
                    <bdi dir="auto">{change.to ?? t('tasks.details.notSet')}</bdi>
                  </li>)}
                </ul>}
                {detail.oldTitle && detail.newTitle && detail.oldTitle !== detail.newTitle && <p className="text-muted-foreground text-xs">
                  <bdi dir="auto" className="break-words">{detail.oldTitle}</bdi> <span aria-hidden="true">→</span> <bdi dir="auto" className="break-words">{detail.newTitle}</bdi>
                </p>}
              </div>
              <div className="bg-muted/35 border-border/60 min-w-0 space-y-2 rounded-lg border px-3 py-2.5">
                {detail.assigneeName && <ActivityPerson
                  label={t('tasks.details.activityAffectedUser')}
                  name={detail.assigneeName}
                  code={detail.assigneeCode}
                  email={detail.assigneeEmail}
                />}
                <ActivityPerson
                  label={t('tasks.details.activityActor')}
                  name={detail.actorName}
                  code={detail.actorCode}
                  email={detail.actorEmail}
                />
              </div>
              <time dateTime={item.createdAtUtc} className="text-muted-foreground block text-xs">
                {formatDateTime(item.createdAtUtc, i18n.language, timeFormat)}
              </time>
            </div>
          </li>
        })}
      </ol> : <p className="text-muted-foreground py-5 text-center text-sm">{t('tasks.details.noActivity')}</p>}
    </CardContent>
  </Card>
}

