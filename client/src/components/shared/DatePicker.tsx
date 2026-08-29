import { DesktopDatePicker } from '@mui/x-date-pickers/DesktopDatePicker'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useDialogFloatingContainer } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

export interface DatePickerProps {
  value?: string | null
  onChange: (value: string) => void

  label?: string
  description?: string | undefined
  error?: string | undefined

  required?: boolean
  disabled?: boolean

  minDate?: string
  maxDate?: string

  className?: string
}

export function DatePicker({
  value,
  onChange,
  label,
  description,
  error,
  required = false,
  disabled = false,
  minDate,
  maxDate,
  className,
}: DatePickerProps) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const dialogFloatingContainer = useDialogFloatingContainer()

  const direction = i18n.dir()

  const pickerValue = value ? dayjs(value) : null
  const pickerMinDate = minDate ? dayjs(minDate) : undefined
  const pickerMaxDate = maxDate ? dayjs(maxDate) : undefined

  return (
    <div className={cn('min-w-0', className)} dir={direction}>
      <DesktopDatePicker
        label={label}
        value={pickerValue}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        onChange={(newValue, context) => {
          if (context.validationError != null) {
            return
          }

          if (newValue === null) {
            onChange('')
            return
          }

          onChange(newValue.format('YYYY-MM-DD'))
        }}
        disabled={disabled}
        format="DD MMM YYYY"
        views={['year', 'month', 'day']}
        openTo="day"
        closeOnSelect
        yearsOrder="desc"
        yearsPerRow={4}
        {...(pickerMinDate ? { minDate: pickerMinDate } : {})}
        {...(pickerMaxDate ? { maxDate: pickerMaxDate } : {})}
        slots={{
          /*
           * Remove the calendar button completely.
           */
          openPickerButton: () => null,
        }}
        slotProps={{
          field: {
            clearable: !required,
          },

          textField: {
            fullWidth: true,
            size: 'small',
            required,

            error: Boolean(error),

            helperText: error || description || undefined,

            /*
             * The whole field now opens the calendar.
             */
            onClick: (event) => {
              if (disabled) {
                return
              }

              /*
               * If the user clicked another button
               * such as Clear, don't reopen the picker.
               */
              const target = event.target as HTMLElement

              if (target.closest('button')) {
                return
              }

              setOpen(true)
            },

            sx: {
              direction,

              '& .MuiPickersInputBase-root': {
                minHeight: 48,

                borderRadius: 'var(--radius)',

                backgroundColor: 'var(--background)',
                color: 'var(--foreground)',

                fontSize: 14,
                fontWeight: 500,

                cursor: disabled ? 'not-allowed' : 'pointer',

                transition: 'border-color 160ms ease, box-shadow 160ms ease',
              },

              /*
               * Make the date sections look clickable too.
               */
              '& .MuiPickersSectionList-root': {
                cursor: disabled ? 'not-allowed' : 'pointer',
              },

              '& .MuiPickersOutlinedInput-notchedOutline': {
                borderColor: error ? 'var(--destructive)' : 'var(--input)',
              },

              '&:hover .MuiPickersOutlinedInput-notchedOutline': {
                borderColor: error ? 'var(--destructive)' : 'var(--ring)',
              },

              '& .Mui-focused .MuiPickersOutlinedInput-notchedOutline': {
                borderColor: error ? 'var(--destructive)' : 'var(--ring)',

                borderWidth: 2,
              },

              '& .MuiInputLabel-root': {
                color: 'var(--muted-foreground)',
              },

              '& .MuiInputLabel-root.Mui-focused': {
                color: error ? 'var(--destructive)' : 'var(--ring)',
              },

              '& .MuiFormHelperText-root': {
                marginInline: 0,
                marginTop: '6px',

                color: error ? 'var(--destructive)' : 'var(--muted-foreground)',
              },
            },
          },

          desktopPaper: {
            dir: direction,

            sx: {
              color: 'var(--popover-foreground)',
              backgroundColor: 'var(--popover)',

              border: '1px solid var(--border)',
              borderRadius: '1.25rem',

              boxShadow: 'var(--shadow-lg)',

              overflow: 'hidden',

              '& .MuiPickersDay-root, & .MuiPickersCalendarHeader-label, & .MuiYearCalendar-button, & .MuiMonthCalendar-button':
                {
                  color: 'var(--popover-foreground)',
                },

              '& .MuiPickersDay-root:hover, & .MuiYearCalendar-button:hover, & .MuiMonthCalendar-button:hover':
                {
                  backgroundColor: 'var(--accent)',
                },

              '& .Mui-selected': {
                color: 'var(--primary-foreground) !important',
                backgroundColor: 'var(--primary) !important',
              },

              '& .MuiPickersArrowSwitcher-button, & .MuiPickersCalendarHeader-switchViewButton': {
                color: 'var(--muted-foreground)',
              },
            },
          },

          popper: {
            /*
             * Render the calendar outside the form's scroll region while
             * keeping it inside the active Radix dialog when one exists.
             * This prevents clipping without breaking the dialog focus/pointer
             * boundary. Outside a dialog, MUI falls back to document.body.
             */
            disablePortal: false,
            container: dialogFloatingContainer ?? undefined,

            placement: direction === 'rtl' ? 'bottom-end' : 'bottom-start',

            modifiers: [
              {
                name: 'offset',
                options: {
                  offset: [0, 8],
                },
              },
              {
                name: 'flip',
                enabled: true,
                options: {
                  padding: 12,
                  rootBoundary: 'viewport',
                },
              },
              {
                name: 'preventOverflow',
                enabled: true,
                options: {
                  altAxis: true,
                  padding: 12,
                  rootBoundary: 'viewport',
                },
              },
            ],

            sx: {
              direction,
              pointerEvents: 'auto',
              zIndex: 70,
            },
          },
        }}
      />
    </div>
  )
}
