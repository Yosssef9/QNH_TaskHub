import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'

import type { ExpectedFinishEstimate } from './expected-finishes.api'
import { useExpectedFinishes } from './use-expected-finishes'

function dateLabel(date: string | null, language: string, empty: string): string {
  if (!date) return empty
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(
    language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-GB',
    { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' },
  )
}

function EstimateValue({
  estimate,
  showUserName,
  saving,
  onSave,
}: {
  estimate: ExpectedFinishEstimate
  showUserName: boolean
  saving: boolean
  onSave: (date: string | null, onSuccess: () => void) => void
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(estimate.expectedFinishDate ?? '')
  const late = Boolean(
    estimate.dueDate && estimate.expectedFinishDate && estimate.expectedFinishDate > estimate.dueDate,
  )

  useEffect(() => {
    setDraft(estimate.expectedFinishDate ?? '')
  }, [estimate.expectedFinishDate])

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm">
      {showUserName ? (
        <span className="text-muted-foreground text-xs">{estimate.userName}:</span>
      ) : null}
      <span className={cn('font-medium', late && 'text-amber-700 dark:text-amber-400')}>
        {dateLabel(estimate.expectedFinishDate, i18n.language, t('expectedFinish.notSet'))}
      </span>
      {late ? (
        <span className="text-amber-700 dark:text-amber-400" title={t('expectedFinish.afterDeadline')}>
          <AlertTriangle aria-label={t('expectedFinish.afterDeadline')} className="size-3.5" />
        </span>
      ) : null}
      {estimate.canEdit ? (
        <Popover open={open} onOpenChange={(next) => {
          if (!next) setDraft(estimate.expectedFinishDate ?? '')
          setOpen(next)
        }}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon"
              className="text-muted-foreground hover:text-foreground size-7 shrink-0"
              aria-label={t('expectedFinish.edit')} disabled={saving}>
              <Pencil className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={8} className="w-[min(19rem,calc(100vw-2rem))] space-y-3 p-3">
            <DatePicker label={t('expectedFinish.label')} labelPlacement="above"
              value={draft} onChange={setDraft} disabled={saving} />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {draft && <Button type="button" variant="ghost" size="sm"
                disabled={saving} onClick={() => setDraft('')}>
                {t('expectedFinish.clear')}
              </Button>}
              <Button type="button" size="sm"
                disabled={saving || draft === (estimate.expectedFinishDate ?? '')}
                onClick={() => onSave(draft || null, () => setOpen(false))}>
                {t('common.save')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}

/** Compact, assignment-scoped display placed immediately below the owner's Due Date.
 * The API controls which assignees are visible and who may edit; no client-side
 * permission or history behavior is changed by this presentation component.
 */
export function ExpectedFinishInline({
  taskId,
  subtaskId,
  compact = false,
}: {
  taskId: number
  subtaskId: number | null
  compact?: boolean
}) {
  const { t } = useTranslation()
  // All scopes share a single React Query cache entry for this task.
  const { query, save } = useExpectedFinishes(taskId)
  const estimates = query.data?.estimates.filter((item) => item.subtaskId === subtaskId) ?? []
  if (query.isPending || (query.isSuccess && estimates.length === 0)) return null

  if (query.isError) return (
    <p className="text-destructive py-1 text-xs">{t('expectedFinish.loadFailed')}</p>
  )

  return (
    <div className={cn(
      'min-w-0 py-1',
      compact ? 'text-xs' : 'border-b py-3 last:border-b-0',
    )}>
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <CalendarClock className="size-3.5 shrink-0" />
        {t('expectedFinish.label')}
      </div>
      <div className={cn('min-w-0', !compact && 'ps-5')}>
        {estimates.map((estimate) => (
          <EstimateValue key={`${estimate.assigneeUserId}-${estimate.id ?? 'unset'}`}
            estimate={estimate} showUserName={Boolean(query.data?.canViewAll)}
            saving={save.isPending}
            onSave={(date, onSuccess) => save.mutate({ subtaskId, date }, {
              onSuccess: () => {
                toast.success(t('expectedFinish.saved'))
                onSuccess()
              },
              onError: () => toast.error(t('expectedFinish.saveFailed')),
            })}
          />
        ))}
      </div>
    </div>
  )
}
