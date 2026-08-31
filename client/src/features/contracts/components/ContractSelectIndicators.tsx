import type { LucideIcon } from 'lucide-react'
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  RefreshCw,
  SlidersHorizontal,
  Wallet,
  X,
  ChartNoAxesColumnIncreasing,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import type {
  ContractPaymentFrequency,
  ContractPaymentTiming,
  ContractTrackingState,
  ContractValueType,
} from '../types/contracts.types'

type IndicatorTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

const toneClasses: Record<IndicatorTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success-foreground',
  warning: 'bg-warning/15 text-warning-foreground',
  danger: 'bg-destructive/10 text-destructive',
}

function Indicator({
  icon: Icon,
  marker,
  label,
  tone,
  pill = false,
}: {
  icon?: LucideIcon
  marker?: string
  label: string
  tone: IndicatorTone
  pill?: boolean
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', pill && 'rounded-full border px-2.5 py-1')}>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-bold tabular-nums',
          toneClasses[tone],
        )}
      >
        {Icon ? <Icon className="size-3.5" /> : marker}
      </span>
      <span className="truncate">{label}</span>
    </span>
  )
}

export function ContractStatusIndicator({
  value,
  pill = false,
}: {
  value: ContractTrackingState | 'ALL'
  pill?: boolean
}) {
  const { t } = useTranslation()
  const config =
    value === 'ACTIVE'
      ? { icon: CheckCircle2, tone: 'success' as const, label: t('contracts.status.ACTIVE') }
      : value === 'EXPIRING_SOON'
        ? { icon: Clock3, tone: 'warning' as const, label: t('contracts.status.EXPIRING_SOON') }
        : value === 'EXPIRED'
          ? { icon: CircleAlert, tone: 'danger' as const, label: t('contracts.status.EXPIRED') }
          : value === 'UPCOMING'
            ? { icon: CalendarClock, tone: 'primary' as const, label: t('contracts.status.UPCOMING') }
            : {
                icon: SlidersHorizontal,
                tone: 'neutral' as const,
                label: t('contracts.filters.allStatuses'),
              }
  return <Indicator {...config} pill={pill} />
}

export function RenewalIndicator({
  value,
  pill = false,
}: {
  value: 'ALL' | 'YES' | 'NO'
  pill?: boolean
}) {
  const { t } = useTranslation()
  const config =
    value === 'YES'
      ? {
          icon: RefreshCw,
          tone: 'primary' as const,
          label: t('contracts.filters.autoRenewal'),
        }
      : value === 'NO'
        ? {
            icon: X,
            tone: 'neutral' as const,
            label: t('contracts.filters.noAutoRenewal'),
          }
        : {
            icon: SlidersHorizontal,
            tone: 'neutral' as const,
            label: t('contracts.filters.allRenewal'),
          }
  return <Indicator {...config} pill={pill} />
}

export function ValueTypeIndicator({
  value,
  pill = false,
}: {
  value: ContractValueType | 'ALL'
  pill?: boolean
}) {
  const { t } = useTranslation()
  const config =
    value === 'FIXED'
      ? {
          icon: Wallet,
          tone: 'primary' as const,
          label: t('contracts.valueTypes.FIXED'),
        }
      : value === 'VARIABLE'
        ? {
            icon: ChartNoAxesColumnIncreasing,
            tone: 'neutral' as const,
            label: t('contracts.valueTypes.VARIABLE'),
          }
        : {
            icon: SlidersHorizontal,
            tone: 'neutral' as const,
            label: t('contracts.filters.allValueTypes'),
          }
  return <Indicator {...config} pill={pill} />
}

const frequencyMarkers: Record<ContractPaymentFrequency, string> = {
  ONE_TIME: '1×',
  MONTHLY: 'M',
  QUARTERLY: 'Q',
  SEMI_ANNUAL: '6M',
  ANNUAL: 'Y',
}

export function PaymentFrequencyIndicator({
  value,
  pill = false,
}: {
  value: ContractPaymentFrequency | 'ALL' | 'NONE'
  pill?: boolean
}) {
  const { t } = useTranslation()
  if (value === 'ALL')
    return (
      <Indicator
        icon={SlidersHorizontal}
        label={t('contracts.filters.allPaymentFrequencies')}
        tone="neutral"
        pill={pill}
      />
    )
  if (value === 'NONE')
    return <Indicator marker="—" label={t('common.none')} tone="neutral" pill={pill} />
  return (
    <Indicator
      marker={frequencyMarkers[value]}
      label={t(`contracts.paymentFrequencies.${value}`)}
      tone="primary"
      pill={pill}
    />
  )
}

export function PaymentTimingIndicator({
  value,
  pill = false,
}: {
  value: ContractPaymentTiming | 'ALL' | 'NONE'
  pill?: boolean
}) {
  const { t } = useTranslation()
  const config =
    value === 'IN_ADVANCE'
      ? {
          icon: Wallet,
          tone: 'primary' as const,
          label: t('contracts.paymentTimings.IN_ADVANCE'),
        }
      : value === 'IN_ARREARS'
        ? {
            icon: Clock3,
            tone: 'warning' as const,
            label: t('contracts.paymentTimings.IN_ARREARS'),
          }
        : value === 'NONE'
          ? { marker: '—', tone: 'neutral' as const, label: t('common.none') }
          : {
              icon: SlidersHorizontal,
              tone: 'neutral' as const,
              label: t('contracts.filters.allPaymentTimings'),
            }
  return <Indicator {...config} pill={pill} />
}
