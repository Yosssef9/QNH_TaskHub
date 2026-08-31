import { formatDateOnly, parseDateOnly } from '@/lib/date-only'

import type {
  Contract,
  ContractInput,
  ContractPaymentFrequency,
  ContractPaymentTiming,
  ContractTrackingState,
  ContractValueType,
} from '../types/contracts.types'

export function displayDate(value: string | null, locale: string): string {
  if (!value) return '—'
  const date = parseDateOnly(value)
  if (!date) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

export function noticeDeadlinePreview(endDate: string | null, noticeDays: number | null): string | null {
  if (!endDate || !noticeDays) return null
  const date = parseDateOnly(endDate)
  if (!date) return null
  date.setDate(date.getDate() - noticeDays)
  return formatDateOnly(date)
}

const sarNumberFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatSarNumber(value: number): string {
  return sarNumberFormatter.format(value)
}

export function formatSar(value: number | null): string {
  if (value === null) return '—'
  return `${formatSarNumber(value)} SAR`
}


function todayInRiyadh(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const map = new Map(parts.map((part) => [part.type, part.value]))
  return `${map.get('year')}-${map.get('month')}-${map.get('day')}`
}

export function daysUntilDate(value: string | null): number | null {
  if (!value) return null
  const target = parseDateOnly(value)
  const today = parseDateOnly(todayInRiyadh())
  if (!target || !today) return null
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((targetUtc - todayUtc) / 86_400_000)
}

export function trackingTone(state: ContractTrackingState): 'default' | 'secondary' | 'destructive' {
  if (state === 'EXPIRED') return 'destructive'
  if (state === 'ACTIVE') return 'secondary'
  return 'default'
}

export const valueTypes: ContractValueType[] = ['FIXED', 'VARIABLE']
export const paymentFrequencies: ContractPaymentFrequency[] = [
  'ONE_TIME',
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUAL',
  'ANNUAL',
]
export const paymentTimings: ContractPaymentTiming[] = ['IN_ADVANCE', 'IN_ARREARS']
export const trackingStates: ContractTrackingState[] = [
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'UPCOMING',
]

export function defaultContractInput(): ContractInput {
  const now = new Date()
  return {
    supplierId: 0,
    contractNumber: null,
    title: '',
    startDate: formatDateOnly(now),
    endDate: null,
    isAutoRenewal: false,
    renewalTermMonths: null,
    noticePeriodDays: null,
    valueType: 'FIXED',
    contractValueSar: null,
    paymentFrequency: null,
    paymentTiming: null,
    notes: null,
  }
}

export function editableContract(contract: Contract): ContractInput {
  return {
    supplierId: contract.supplierId,
    contractNumber: contract.contractNumber,
    title: contract.title,
    startDate: contract.startDate,
    endDate: contract.endDate,
    isAutoRenewal: contract.isAutoRenewal,
    renewalTermMonths: contract.renewalTermMonths,
    noticePeriodDays: contract.noticePeriodDays,
    valueType: contract.valueType,
    contractValueSar: contract.contractValueSar,
    paymentFrequency: contract.paymentFrequency,
    paymentTiming: contract.paymentTiming,
    notes: contract.notes,
  }
}
