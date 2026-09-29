import { CalendarDays, Link2, Maximize2, Minimize2, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/shared/DatePicker'
import { InputField } from '@/components/shared/Input'
import { Button } from '@/components/ui/button'
import { formatRiyadhDateInput } from '@/lib/date-time'

import { MeetingTimeRangePicker } from './MeetingTimeRangePicker'

interface ZoomMeetingSchedulePanelProps {
  date: string
  startTime: string
  endTime: string
  onlineJoinUrl: string
  disabled?: boolean
  focused?: boolean
  errors?: {
    date?: string
    duration?: string
    time?: string
    onlineJoinUrl?: string
  }
  onFocusToggle?: () => void
  onDateChange: (date: string) => void
  onTimeChange: (startTime: string, endTime: string) => void
  onJoinUrlChange: (value: string) => void
  onValidationClear?: (field: 'date' | 'duration' | 'time' | 'onlineJoinUrl') => void
}

export function ZoomMeetingSchedulePanel({
  date,
  startTime,
  endTime,
  onlineJoinUrl,
  disabled = false,
  focused = false,
  errors,
  onFocusToggle,
  onDateChange,
  onTimeChange,
  onJoinUrlChange,
  onValidationClear,
}: ZoomMeetingSchedulePanelProps) {
  const { t } = useTranslation()
  const today = formatRiyadhDateInput(Date.now())

  return (
    <section className="space-y-5 border-b p-5 sm:p-6 xl:border-b-0 xl:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="bg-[#2D8CFF]/10 text-[#2D8CFF] grid size-10 shrink-0 place-items-center rounded-xl">
            <Video aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">{t('meetings.zoom.scheduleTitle')}</h2>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {t('meetings.zoom.scheduleDescription')}
            </p>
          </div>
        </div>
        {onFocusToggle ? (
          <Button variant="outline" size="sm" aria-pressed={focused} onClick={onFocusToggle}>
            {focused ? <Minimize2 aria-hidden="true" className="size-4" /> : <Maximize2 aria-hidden="true" className="size-4" />}
            {t(focused ? 'meetings.create.showBothSections' : 'meetings.create.focusSection')}
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="mb-3 flex items-start gap-2">
          <CalendarDays aria-hidden="true" className="text-primary mt-0.5 size-4" />
          <div>
            <p className="text-sm font-semibold">{t('meetings.zoom.dateTitle')}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{t('meetings.zoom.dateHint')}</p>
          </div>
        </div>
        <div className="max-w-64">
          <DatePicker
            required
            value={date}
            minDate={today}
            label={t('meetings.fields.date')}
            disabled={disabled}
            onChange={(value) => {
              onValidationClear?.('date')
              onValidationClear?.('time')
              onDateChange(value)
            }}
          />
        </div>
        {errors?.date ? <p role="alert" className="text-destructive mt-2 text-xs font-medium">{errors.date}</p> : null}
      </div>

      <MeetingTimeRangePicker
        startTime={startTime}
        endTime={endTime}
        disabled={disabled}
        error={errors?.time}
        onChange={(nextStart, nextEnd) => {
          onValidationClear?.('time')
          onTimeChange(nextStart, nextEnd)
        }}
      />

      <div className="rounded-xl border bg-background p-4">
        <div className="mb-3 flex items-start gap-2">
          <Link2 aria-hidden="true" className="text-[#2D8CFF] mt-0.5 size-4" />
          <div>
            <p className="text-sm font-semibold">{t('meetings.zoom.joinLinkTitle')}</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">{t('meetings.zoom.joinLinkHint')}</p>
          </div>
        </div>
        <InputField
          required
          type="url"
          label={t('meetings.zoom.joinLink')}
          placeholder="https://zoom.us/j/..."
          value={onlineJoinUrl}
          maxLength={2048}
          disabled={disabled}
          error={errors?.onlineJoinUrl}
          onChange={(event) => {
            onJoinUrlChange(event.target.value)
            if (event.target.value.trim()) onValidationClear?.('onlineJoinUrl')
          }}
        />
      </div>
    </section>
  )
}
