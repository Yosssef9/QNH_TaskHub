import { CalendarPlus2, CalendarRange, Layers3, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

interface MeetingScheduleChoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSingleMeeting: () => void
}

export function MeetingScheduleChoiceDialog({
  open,
  onOpenChange,
  onSingleMeeting,
}: MeetingScheduleChoiceDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  function chooseSingle() {
    onOpenChange(false)
    onSingleMeeting()
  }

  function chooseMultiple() {
    onOpenChange(false)
    navigate('/meetings/series/new')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="w-[min(46rem,calc(100vw-2rem))] max-w-none p-0"
      >
        <div className="border-b px-5 py-5 pe-14 sm:px-6 sm:pe-16">
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
              <CalendarPlus2 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <DialogTitle>{t('meetings.series.launcher.title')}</DialogTitle>
              <DialogDescription className="mt-1">
                {t('meetings.series.launcher.description')}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
          <ChoiceCard
            icon={CalendarRange}
            title={t('meetings.series.launcher.singleTitle')}
            description={t('meetings.series.launcher.singleDescription')}
            action={t('meetings.series.launcher.singleAction')}
            onClick={chooseSingle}
          />
          <ChoiceCard
            icon={Layers3}
            title={t('meetings.series.launcher.multipleTitle')}
            description={t('meetings.series.launcher.multipleDescription')}
            action={t('meetings.series.launcher.multipleAction')}
            emphasized
            onClick={chooseMultiple}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ChoiceCard({
  icon: Icon,
  title,
  description,
  action,
  emphasized = false,
  onClick,
}: {
  icon: LucideIcon
  title: string
  description: string
  action: string
  emphasized?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'group flex min-h-48 flex-col rounded-2xl border p-5 text-start transition-all outline-none',
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring',
        emphasized
          ? 'border-primary/35 bg-primary/[0.04] hover:border-primary/60'
          : 'border-border bg-card hover:border-primary/30',
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          'grid size-11 place-items-center rounded-xl',
          emphasized ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="mt-4 text-base font-semibold">{title}</span>
      <span className="text-muted-foreground mt-1.5 flex-1 text-sm leading-6">{description}</span>
      <span
        className={cn(
          'mt-5 inline-flex min-h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium',
          emphasized
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-background',
        )}
      >
        {action}
      </span>
    </button>
  )
}

