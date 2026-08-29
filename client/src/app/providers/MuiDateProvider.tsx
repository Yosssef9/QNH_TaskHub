import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles'
import rtlPlugin from '@mui/stylis-plugin-rtl'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import 'dayjs/locale/ar-sa'
import 'dayjs/locale/en'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { prefixer } from 'stylis'

import { useTheme } from '@/hooks/use-theme'

const ltrCache = createCache({
  key: 'mui',
  stylisPlugins: [prefixer],
})

const rtlCache = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
})

export function MuiDateProvider({ children }: { children: ReactNode }) {
  const { i18n, t } = useTranslation()
  const { resolvedTheme } = useTheme()

  const isArabic = i18n.language.startsWith('ar')
  const direction = isArabic ? 'rtl' : 'ltr'

  const muiTheme = useMemo(
    () =>
      createTheme({
        direction,
        palette: {
          mode: resolvedTheme,
        },
      }),
    [direction, resolvedTheme],
  )

  const localeText = useMemo(
    () => ({
      previousMonth: t('datePicker.previousMonth'),
      nextMonth: t('datePicker.nextMonth'),

      clearButtonLabel: t('datePicker.clear'),
      fieldClearLabel: t('datePicker.clear'),

      openDatePickerDialogue: () => t('datePicker.open'),
      datePickerToolbarTitle: t('datePicker.chooseDate'),

      year: t('datePicker.year'),
      month: t('datePicker.month'),
      day: t('datePicker.day'),
    }),
    [t],
  )

  return (
    <CacheProvider value={isArabic ? rtlCache : ltrCache}>
      <MuiThemeProvider theme={muiTheme}>
        <LocalizationProvider
          dateAdapter={AdapterDayjs}
          adapterLocale={isArabic ? 'ar-sa' : 'en'}
          localeText={localeText}
        >
          {children}
        </LocalizationProvider>
      </MuiThemeProvider>
    </CacheProvider>
  )
}
