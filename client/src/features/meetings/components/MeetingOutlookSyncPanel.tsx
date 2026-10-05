import { useState } from 'react'

import { CalendarSync, ExternalLink, RefreshCcw, RotateCcw, TriangleAlert, Unplug } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonStyles } from '@/components/ui/button.styles'
import { Card } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import {
  useMeetingOutlookSync,
  useRecreateMeetingOutlookSync,
  useRestoreMeetingOutlookSync,
  useRetryMeetingOutlookSync,
} from '@/features/meetings/hooks/use-meetings'
import type { MeetingOutlookSyncDifference } from '@/features/meetings/types/meeting.types'

function displayDifferenceValue(
  difference: MeetingOutlookSyncDifference,
  side: 'taskHubValue' | 'outlookValue',
  locale: string,
): string {
  const value = difference[side]
  if (difference.field !== 'START' && difference.field !== 'END') return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(locale)
}

export function MeetingOutlookSyncPanel({ meetingId, organizerUserId }: { meetingId: number; organizerUserId: number }) {
  const { t, i18n } = useTranslation()
  const currentUser = useCurrentUser()
  const query = useMeetingOutlookSync(meetingId)
  const retry = useRetryMeetingOutlookSync()
  const restore = useRestoreMeetingOutlookSync()
  const recreate = useRecreateMeetingOutlookSync()
  const [showDifferences, setShowDifferences] = useState(false)
  const data = query.data
  const status = data?.status ?? null
  const canManage = currentUser.data?.user.userId === organizerUserId || Boolean(currentUser.data?.access.meetingCoordinateEnabled)

  const runAction = async (
    action: 'retry' | 'restore' | 'recreate',
  ) => {
    try {
      if (action === 'retry') await retry.mutateAsync({ meetingId })
      if (action === 'restore') await restore.mutateAsync({ meetingId })
      if (action === 'recreate') await recreate.mutateAsync({ meetingId })
      toast.success(t(`meetings.workspace.outlook.${action}Queued`))
    } catch {
      toast.error(t(`meetings.workspace.outlook.${action}Error`))
    }
  }

  if (query.isPending) return null

  const variant = status?.status === 'SYNC_FAILED' || status?.status === 'OUTLOOK_CHANGED' || status?.status === 'OUTLOOK_DELETED'
    ? 'destructive' as const
    : status?.status === 'SYNCED_WITH_WARNINGS'
      ? 'warning' as const
      : status?.status === 'IN_SYNC'
        ? 'success' as const
        : 'secondary' as const

  const label = !data?.enabled
    ? t('meetings.workspace.outlook.disabled')
    : status
      ? t(`meetings.workspace.outlook.status.${status.status}`)
      : t('meetings.workspace.outlook.notStarted')

  const anyPending = retry.isPending || restore.isPending || recreate.isPending

  return (
    <Card className="border-border/70 p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="bg-sky-500/10 text-sky-600 dark:text-sky-300 grid size-10 shrink-0 place-items-center rounded-xl">
            <CalendarSync aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-bold">{t('meetings.workspace.outlook.title')}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">{t('meetings.workspace.outlook.description')}</p>
          </div>
        </div>
        <Badge variant={variant}>{label}</Badge>
      </div>

      {status?.missingEmailParticipantCount ? (
        <div className="bg-warning/5 border-warning/30 mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm">
          <TriangleAlert aria-hidden="true" className="text-warning mt-0.5 size-4 shrink-0" />
          <p>{t('meetings.workspace.outlook.missingEmails', { count: status.missingEmailParticipantCount })}</p>
        </div>
      ) : null}

      {status?.status === 'OUTLOOK_CHANGED' ? (
        <div className="bg-destructive/5 border-destructive/20 mt-4 rounded-xl border px-3.5 py-3 text-sm">
          <div className="flex items-start gap-2">
            <TriangleAlert aria-hidden="true" className="text-destructive mt-0.5 size-4 shrink-0" />
            <p>{t('meetings.workspace.outlook.changedHelp')}</p>
          </div>
          {showDifferences && status.differences.length > 0 ? (
            <div className="mt-3 overflow-hidden rounded-lg border">
              <div className="bg-muted/50 grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-3 py-2 text-xs font-semibold">
                <span>{t('meetings.workspace.outlook.differenceField')}</span>
                <span>{t('meetings.workspace.outlook.taskHubValue')}</span>
                <span>{t('meetings.workspace.outlook.outlookValue')}</span>
              </div>
              {status.differences.map((difference) => (
                <div key={difference.field} className="grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-t px-3 py-2 text-xs">
                  <span className="font-medium">{t(`meetings.workspace.outlook.fields.${difference.field}`)}</span>
                  <span className="break-words">{displayDifferenceValue(difference, 'taskHubValue', i18n.language)}</span>
                  <span className="break-words">{displayDifferenceValue(difference, 'outlookValue', i18n.language)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {status?.status === 'OUTLOOK_DELETED' ? (
        <div className="bg-destructive/5 border-destructive/20 mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm">
          <Unplug aria-hidden="true" className="text-destructive mt-0.5 size-4 shrink-0" />
          <p>{t('meetings.workspace.outlook.deletedHelp')}</p>
        </div>
      ) : null}

      {status?.lastErrorMessage ? (
        <p className="text-destructive mt-4 text-sm">{status.lastErrorMessage}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {status?.graphWebLink ? (
          <a
            href={status.graphWebLink}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonStyles({ variant: 'outline', size: 'sm' })}
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            {t('meetings.workspace.outlook.openOutlook')}
          </a>
        ) : null}

        {status?.status === 'OUTLOOK_CHANGED' && status.differences.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => setShowDifferences((value) => !value)}>
            {showDifferences ? t('meetings.workspace.outlook.hideDifferences') : t('meetings.workspace.outlook.viewDifferences')}
          </Button>
        ) : null}

        {data?.enabled && canManage && status?.status === 'OUTLOOK_CHANGED' ? (
          <Button variant="outline" size="sm" onClick={() => void runAction('restore')} disabled={anyPending}>
            <RotateCcw aria-hidden="true" className="size-4" />
            {t('meetings.workspace.outlook.restore')}
          </Button>
        ) : null}

        {data?.enabled && canManage && status?.status === 'OUTLOOK_DELETED' ? (
          <Button variant="outline" size="sm" onClick={() => void runAction('recreate')} disabled={anyPending}>
            <CalendarSync aria-hidden="true" className="size-4" />
            {t('meetings.workspace.outlook.recreate')}
          </Button>
        ) : null}

        {data?.enabled && canManage && (status?.status === 'SYNC_FAILED' || status?.status === 'NOT_SYNCED' || status === null) ? (
          <Button variant="outline" size="sm" onClick={() => void runAction('retry')} disabled={anyPending}>
            <RefreshCcw aria-hidden="true" className="size-4" />
            {t('meetings.workspace.outlook.retry')}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
