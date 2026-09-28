import { CheckCircle2, CircleHelp, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/cn'
import type { MeetingAttendanceStatus } from '../types/meeting.types'

const attendancePresentation = {
  NOT_MARKED: {
    icon: CircleHelp,
    tone: 'bg-muted text-muted-foreground',
    trigger: 'border-input bg-background',
  },
  ATTENDED: {
    icon: CheckCircle2,
    tone: 'bg-success/12 text-success-foreground',
    trigger: 'border-success/30 bg-success/5',
  },
  ABSENT: {
    icon: XCircle,
    tone: 'bg-destructive/10 text-destructive',
    trigger: 'border-destructive/30 bg-destructive/5',
  },
} as const

/** One presentation for menu options, the selected value and read-only attendance. */
export function MeetingAttendanceIndicator({ status, pill = false }: {
  status: MeetingAttendanceStatus
  pill?: boolean
}) {
  const { t } = useTranslation()
  const { icon: Icon, tone } = attendancePresentation[status]
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-2 font-medium',
      pill && 'rounded-full px-2.5 py-1.5 text-xs', pill && tone)} data-attendance-status={status}>
      <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', !pill && tone)}>
        <Icon aria-hidden="true" className={pill ? 'size-4' : 'size-3.5'} />
      </span>
      <span className="truncate">{t(`meetings.workspace.attendance.status.${status}`)}</span>
    </span>
  )
}

export function MeetingAttendanceSelect({ status, participantName, disabled, onStatusChange }: {
  status: MeetingAttendanceStatus
  participantName: string
  disabled: boolean
  onStatusChange: (status: MeetingAttendanceStatus) => void
}) {
  const { t } = useTranslation()
  return (
    <Select value={status} disabled={disabled} onValueChange={(value) => {
      // Never widen the API's status domain merely to support a styled control.
      if (value === 'NOT_MARKED' || value === 'ATTENDED' || value === 'ABSENT') onStatusChange(value)
    }}>
      <SelectTrigger
        className={cn('w-full min-w-0', attendancePresentation[status].trigger)}
        aria-label={t('meetings.workspace.attendance.statusLabel', { name: participantName })}
      >
        <SelectValue><MeetingAttendanceIndicator status={status} /></SelectValue>
      </SelectTrigger>
      {/* The existing SelectContent portals to document.body, outside the scrolling roster. */}
      <SelectContent sideOffset={6} collisionPadding={12} className="max-w-[calc(100vw-1.5rem)]">
        {(['NOT_MARKED', 'ATTENDED', 'ABSENT'] as const).map((value) => (
          <SelectItem key={value} value={value} textValue={t(`meetings.workspace.attendance.status.${value}`)}>
            <MeetingAttendanceIndicator status={value} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
