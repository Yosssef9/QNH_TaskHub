import {
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FilePlus2,
  Paperclip,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { DatePicker } from '@/components/shared/DatePicker'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { OverflowTooltipText } from '@/components/shared/OverflowTooltipText'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { SortableHeader } from '@/components/shared/SortableHeader'
import { TablePagination } from '@/components/shared/TablePagination'
import { taskHubEase, taskHubMotion } from '@/components/shared/TaskHubMotion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ContractEditorDialog } from '@/features/contracts/components/ContractEditorDialog'
import {
  ContractStatusIndicator,
  PaymentFrequencyIndicator,
  PaymentTimingIndicator,
  RenewalIndicator,
  ValueTypeIndicator,
} from '@/features/contracts/components/ContractSelectIndicators'
import { ContractStatusBadge } from '@/features/contracts/components/ContractStatusBadge'
import { CurrencyAmount } from '@/features/contracts/components/CurrencyAmount'
import {
  daysUntilDate,
  displayDate,
  paymentFrequencies,
  paymentTimings,
  trackingStates,
  valueTypes,
} from '@/features/contracts/components/contract-display'
import { useContracts, useSuppliers } from '@/features/contracts/hooks/use-contracts'
import type {
  Contract,
  ContractListQuery,
  ContractPaymentFrequency,
  ContractPaymentTiming,
  ContractTrackingState,
  ContractValueType,
} from '@/features/contracts/types/contracts.types'

interface ContractFilterDraft {
  status?: ContractTrackingState
  supplierId?: number
  autoRenewal?: boolean
  valueType?: ContractValueType
  paymentFrequency?: ContractPaymentFrequency
  paymentTiming?: ContractPaymentTiming
  startFrom?: string
  startTo?: string
  endFrom?: string
  endTo?: string
}

const EMPTY_CONTRACT_FILTERS: ContractFilterDraft = {}

function countContractFilters(filters: ContractFilterDraft): number {
  return [
    filters.status,
    filters.supplierId,
    filters.autoRenewal !== undefined ? 'renewal' : undefined,
    filters.valueType,
    filters.paymentFrequency,
    filters.paymentTiming,
    filters.startFrom,
    filters.startTo,
    filters.endFrom,
    filters.endTo,
  ].filter((value) => value !== undefined && value !== null && value !== '').length
}

export function ContractsPage() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [archived, setArchived] = useState(false)
  const [status, setStatus] = useState<ContractTrackingState | undefined>()
  const [supplierId, setSupplierId] = useState<number | undefined>()
  const [autoRenewal, setAutoRenewal] = useState<boolean | undefined>()
  const [valueType, setValueType] = useState<ContractValueType | undefined>()
  const [paymentFrequency, setPaymentFrequency] = useState<ContractPaymentFrequency | undefined>()
  const [paymentTiming, setPaymentTiming] = useState<ContractPaymentTiming | undefined>()
  const [startFrom, setStartFrom] = useState<string | undefined>()
  const [startTo, setStartTo] = useState<string | undefined>()
  const [endFrom, setEndFrom] = useState<string | undefined>()
  const [endTo, setEndTo] = useState<string | undefined>()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState<ContractFilterDraft>({ ...EMPTY_CONTRACT_FILTERS })
  const [sortBy, setSortBy] = useState<ContractListQuery['sortBy']>('endDate')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [createOpen, setCreateOpen] = useState(false)

  const queryInput: ContractListQuery = {
    search,
    page,
    pageSize,
    archived,
    status,
    supplierId,
    autoRenewal,
    valueType,
    paymentFrequency,
    paymentTiming,
    startFrom,
    startTo,
    endFrom,
    endTo,
    sortBy,
    sortDirection,
  }
  const contracts = useContracts(queryInput)
  const suppliers = useSuppliers({ search: '', page: 1, pageSize: 100, archived: false })
  const data = contracts.data
  const supplierItems = suppliers.data?.items ?? []
  const selectedSupplier = supplierItems.find((item) => item.id === supplierId)
  const selectedDraftSupplier = supplierItems.find((item) => item.id === draftFilters.supplierId)
  const activeFilterCount = countContractFilters({
    status,
    supplierId,
    autoRenewal,
    valueType,
    paymentFrequency,
    paymentTiming,
    startFrom,
    startTo,
    endFrom,
    endTo,
  })
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))
  const startRow = data?.total ? (page - 1) * pageSize + 1 : 0
  const endRow = Math.min(page * pageSize, data?.total ?? 0)

  function resetPage() {
    setPage(1)
  }

  function changeSort(column: ContractListQuery['sortBy']) {
    if (sortBy === column) setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(column)
      setSortDirection('asc')
    }
    resetPage()
  }

  function clearFilters() {
    setStatus(undefined)
    setSupplierId(undefined)
    setAutoRenewal(undefined)
    setValueType(undefined)
    setPaymentFrequency(undefined)
    setPaymentTiming(undefined)
    setStartFrom(undefined)
    setStartTo(undefined)
    setEndFrom(undefined)
    setEndTo(undefined)
    setDraftFilters({ ...EMPTY_CONTRACT_FILTERS })
    resetPage()
  }

  function openFiltersPanel() {
    setDraftFilters({
      status,
      supplierId,
      autoRenewal,
      valueType,
      paymentFrequency,
      paymentTiming,
      startFrom,
      startTo,
      endFrom,
      endTo,
    })
    setFiltersOpen(true)
  }

  function applyFilters() {
    setStatus(draftFilters.status)
    setSupplierId(draftFilters.supplierId)
    setAutoRenewal(draftFilters.autoRenewal)
    setValueType(draftFilters.valueType)
    setPaymentFrequency(draftFilters.paymentFrequency)
    setPaymentTiming(draftFilters.paymentTiming)
    setStartFrom(draftFilters.startFrom)
    setStartTo(draftFilters.startTo)
    setEndFrom(draftFilters.endFrom)
    setEndTo(draftFilters.endTo)
    resetPage()
    setFiltersOpen(false)
  }

  const hasFilters = Boolean(search || activeFilterCount > 0)

  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = []
  if (status)
    activeChips.push({
      key: 'status',
      label: t(`contracts.status.${status}`),
      onRemove: () => setStatus(undefined),
    })
  if (selectedSupplier)
    activeChips.push({
      key: 'supplier',
      label: selectedSupplier.name,
      onRemove: () => setSupplierId(undefined),
    })
  if (autoRenewal !== undefined)
    activeChips.push({
      key: 'renewal',
      label: t(
        autoRenewal ? 'contracts.filters.autoRenewal' : 'contracts.filters.noAutoRenewal',
      ),
      onRemove: () => setAutoRenewal(undefined),
    })
  if (valueType)
    activeChips.push({
      key: 'valueType',
      label: t(`contracts.valueTypes.${valueType}`),
      onRemove: () => setValueType(undefined),
    })
  if (paymentFrequency)
    activeChips.push({
      key: 'paymentFrequency',
      label: t(`contracts.paymentFrequencies.${paymentFrequency}`),
      onRemove: () => setPaymentFrequency(undefined),
    })
  if (paymentTiming)
    activeChips.push({
      key: 'paymentTiming',
      label: t(`contracts.paymentTimings.${paymentTiming}`),
      onRemove: () => setPaymentTiming(undefined),
    })
  for (const [key, value, label, remove] of [
    ['startFrom', startFrom, t('contracts.filters.startFrom'), () => setStartFrom(undefined)],
    ['startTo', startTo, t('contracts.filters.startTo'), () => setStartTo(undefined)],
    ['endFrom', endFrom, t('contracts.filters.endFrom'), () => setEndFrom(undefined)],
    ['endTo', endTo, t('contracts.filters.endTo'), () => setEndTo(undefined)],
  ] as const) {
    if (value)
      activeChips.push({
        key,
        label: `${label}: ${displayDate(value, i18n.language)}`,
        onRemove: remove,
      })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('contracts.eyebrow')}
        title={t('contracts.pageTitle')}
        description={t('contracts.pageDescription')}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/contracts/suppliers')}>
              <Building2 aria-hidden="true" className="size-4" />
              {t('contracts.navigation.suppliers')}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <FilePlus2 aria-hidden="true" className="size-4" />
              {t('contracts.create')}
            </Button>
          </>
        }
      />

      {!archived && data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryButton
            icon={SlidersHorizontal}
            tone="primary"
            label={t('contracts.summary.all')}
            value={data.summary.total}
            active={!status}
            onClick={() => {
              setStatus(undefined)
              setFiltersOpen(false)
              resetPage()
            }}
          />
          <SummaryButton
            icon={CheckCircle2}
            tone="success"
            label={t('contracts.status.ACTIVE')}
            value={data.summary.active}
            active={status === 'ACTIVE'}
            onClick={() => {
              setStatus('ACTIVE')
              setFiltersOpen(false)
              resetPage()
            }}
          />
          <SummaryButton
            icon={Clock3}
            tone="warning"
            label={t('contracts.status.EXPIRING_SOON')}
            value={data.summary.expiringSoon}
            active={status === 'EXPIRING_SOON'}
            onClick={() => {
              setStatus('EXPIRING_SOON')
              setFiltersOpen(false)
              resetPage()
            }}
          />
          <SummaryButton
            icon={CircleAlert}
            tone="danger"
            label={t('contracts.status.EXPIRED')}
            value={data.summary.expired}
            active={status === 'EXPIRED'}
            onClick={() => {
              setStatus('EXPIRED')
              setFiltersOpen(false)
              resetPage()
            }}
          />
          <SummaryButton
            icon={CalendarClock}
            tone="primary"
            label={t('contracts.status.UPCOMING')}
            value={data.summary.upcoming}
            active={status === 'UPCOMING'}
            onClick={() => {
              setStatus('UPCOMING')
              setFiltersOpen(false)
              resetPage()
            }}
          />
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              resetPage()
            }}
            className="min-w-0 flex-1 xl:max-w-xl"
            placeholder={t('contracts.searchPlaceholder')}
            ariaLabel={t('contracts.searchLabel')}
          />

          <Button
            variant={filtersOpen || activeFilterCount > 0 ? 'secondary' : 'outline'}
            className={
              activeFilterCount > 0
                ? 'border-primary/25 bg-primary/[0.08] text-primary hover:bg-primary/[0.12]'
                : 'hover:border-primary/25 hover:bg-primary/[0.05] hover:text-primary'
            }
            aria-expanded={filtersOpen}
            aria-controls="contracts-filter-panel"
            onClick={() => {
              if (filtersOpen) setFiltersOpen(false)
              else openFiltersPanel()
            }}
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            {t('contracts.filters.button')}
            {activeFilterCount > 0 ? (
              <span className="bg-primary text-primary-foreground grid min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums">
                {activeFilterCount}
              </span>
            ) : null}
            <motion.span
              aria-hidden="true"
              animate={{ rotate: filtersOpen ? 180 : 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: taskHubMotion.state, ease: taskHubEase }
              }
              className="text-muted-foreground ms-0.5"
            >
              <span className="block text-xs">⌄</span>
            </motion.span>
          </Button>

          <div className="bg-muted/35 inline-flex w-fit rounded-xl border p-1 xl:ms-auto">
            <Button
              size="sm"
              variant={!archived ? 'default' : 'ghost'}
              onClick={() => {
                setArchived(false)
                resetPage()
              }}
            >
              {t('contracts.currentRecords')}
            </Button>
            <Button
              size="sm"
              variant={archived ? 'default' : 'ghost'}
              onClick={() => {
                setArchived(true)
                setStatus(undefined)
                setFiltersOpen(false)
                resetPage()
              }}
            >
              {t('contracts.archivedRecords')}
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {filtersOpen ? (
            <motion.div
              id="contracts-filter-panel"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      height: { duration: taskHubMotion.layout, ease: taskHubEase },
                      opacity: { duration: taskHubMotion.state, ease: taskHubEase },
                    }
              }
              className="overflow-hidden border-b"
            >
              <div className="bg-primary/[0.018] p-4 sm:p-5">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold">{t('contracts.filters.panelTitle')}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {t('contracts.filters.panelDescription')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={t('contracts.filters.close')}
                    onClick={() => setFiltersOpen(false)}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </div>

                <div className="grid gap-5 xl:grid-cols-3">
                  <FilterGroup title={t('contracts.filters.groups.contract')}>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                      <FilterField label={t('contracts.statusLabel')}>
                        <Select
                          value={draftFilters.status ?? 'ALL'}
                          onValueChange={(value) =>
                            setDraftFilters((current) => ({
                              ...current,
                              status:
                                value === 'ALL' ? undefined : (value as ContractTrackingState),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue>
                              <ContractStatusIndicator value={draftFilters.status ?? 'ALL'} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">
                              <ContractStatusIndicator value="ALL" />
                            </SelectItem>
                            {trackingStates.map((value) => (
                              <SelectItem key={value} value={value}>
                                <ContractStatusIndicator value={value} />
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FilterField>

                      <FilterField label={t('contracts.supplier')}>
                        <Select
                          value={draftFilters.supplierId ? String(draftFilters.supplierId) : 'ALL'}
                          onValueChange={(value) =>
                            setDraftFilters((current) => ({
                              ...current,
                              supplierId: value === 'ALL' ? undefined : Number(value),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue>
                              <span className="inline-flex min-w-0 items-center gap-2">
                                <span className="bg-primary/10 text-primary grid size-6 shrink-0 place-items-center rounded-md">
                                  <Building2 aria-hidden="true" className="size-3.5" />
                                </span>
                                <span className="truncate">
                                  {selectedDraftSupplier?.name ?? t('contracts.filters.allSuppliers')}
                                </span>
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">
                              <span className="inline-flex items-center gap-2">
                                <Building2
                                  aria-hidden="true"
                                  className="text-muted-foreground size-4"
                                />
                                {t('contracts.filters.allSuppliers')}
                              </span>
                            </SelectItem>
                            {supplierItems.map((supplier) => (
                              <SelectItem key={supplier.id} value={String(supplier.id)}>
                                <span className="inline-flex items-center gap-2">
                                  <Building2 aria-hidden="true" className="text-primary size-4" />
                                  {supplier.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FilterField>

                      <FilterField label={t('contracts.renewal')}>
                        <Select
                          value={
                            draftFilters.autoRenewal === undefined
                              ? 'ALL'
                              : draftFilters.autoRenewal
                                ? 'YES'
                                : 'NO'
                          }
                          onValueChange={(value) =>
                            setDraftFilters((current) => ({
                              ...current,
                              autoRenewal: value === 'ALL' ? undefined : value === 'YES',
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue>
                              <RenewalIndicator
                                value={
                                  draftFilters.autoRenewal === undefined
                                    ? 'ALL'
                                    : draftFilters.autoRenewal
                                      ? 'YES'
                                      : 'NO'
                                }
                              />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL"><RenewalIndicator value="ALL" /></SelectItem>
                            <SelectItem value="YES"><RenewalIndicator value="YES" /></SelectItem>
                            <SelectItem value="NO"><RenewalIndicator value="NO" /></SelectItem>
                          </SelectContent>
                        </Select>
                      </FilterField>

                      <FilterField label={t('contracts.valueType')}>
                        <Select
                          value={draftFilters.valueType ?? 'ALL'}
                          onValueChange={(value) =>
                            setDraftFilters((current) => ({
                              ...current,
                              valueType:
                                value === 'ALL' ? undefined : (value as ContractValueType),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue>
                              <ValueTypeIndicator value={draftFilters.valueType ?? 'ALL'} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL"><ValueTypeIndicator value="ALL" /></SelectItem>
                            {valueTypes.map((value) => (
                              <SelectItem key={value} value={value}>
                                <ValueTypeIndicator value={value} />
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FilterField>
                    </div>
                  </FilterGroup>

                  <FilterGroup title={t('contracts.filters.groups.payment')}>
                    <div className="grid gap-4">
                      <FilterField label={t('contracts.paymentFrequency')}>
                        <Select
                          value={draftFilters.paymentFrequency ?? 'ALL'}
                          onValueChange={(value) =>
                            setDraftFilters((current) => ({
                              ...current,
                              paymentFrequency:
                                value === 'ALL'
                                  ? undefined
                                  : (value as ContractPaymentFrequency),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue>
                              <PaymentFrequencyIndicator
                                value={draftFilters.paymentFrequency ?? 'ALL'}
                              />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">
                              <PaymentFrequencyIndicator value="ALL" />
                            </SelectItem>
                            {paymentFrequencies.map((value) => (
                              <SelectItem key={value} value={value}>
                                <PaymentFrequencyIndicator value={value} />
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FilterField>

                      <FilterField label={t('contracts.paymentTiming')}>
                        <Select
                          value={draftFilters.paymentTiming ?? 'ALL'}
                          onValueChange={(value) =>
                            setDraftFilters((current) => ({
                              ...current,
                              paymentTiming:
                                value === 'ALL' ? undefined : (value as ContractPaymentTiming),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue>
                              <PaymentTimingIndicator value={draftFilters.paymentTiming ?? 'ALL'} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL"><PaymentTimingIndicator value="ALL" /></SelectItem>
                            {paymentTimings.map((value) => (
                              <SelectItem key={value} value={value}>
                                <PaymentTimingIndicator value={value} />
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FilterField>
                    </div>
                  </FilterGroup>

                  <FilterGroup title={t('contracts.filters.groups.dates')}>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <DatePicker
                        value={draftFilters.startFrom ?? ''}
                        onChange={(value) =>
                          setDraftFilters((current) => ({
                            ...current,
                            startFrom: value || undefined,
                          }))
                        }
                        label={t('contracts.filters.startFrom')}
                        maxDate={draftFilters.startTo}
                      />
                      <DatePicker
                        value={draftFilters.startTo ?? ''}
                        onChange={(value) =>
                          setDraftFilters((current) => ({
                            ...current,
                            startTo: value || undefined,
                          }))
                        }
                        label={t('contracts.filters.startTo')}
                        minDate={draftFilters.startFrom}
                      />
                      <DatePicker
                        value={draftFilters.endFrom ?? ''}
                        onChange={(value) =>
                          setDraftFilters((current) => ({
                            ...current,
                            endFrom: value || undefined,
                          }))
                        }
                        label={t('contracts.filters.endFrom')}
                        maxDate={draftFilters.endTo}
                      />
                      <DatePicker
                        value={draftFilters.endTo ?? ''}
                        onChange={(value) =>
                          setDraftFilters((current) => ({
                            ...current,
                            endTo: value || undefined,
                          }))
                        }
                        label={t('contracts.filters.endTo')}
                        minDate={draftFilters.endFrom}
                      />
                    </div>
                  </FilterGroup>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDraftFilters({ ...EMPTY_CONTRACT_FILTERS })}
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    {t('contracts.filters.clearAll')}
                  </Button>
                  <Button type="button" onClick={applyFilters}>
                    <SlidersHorizontal aria-hidden="true" className="size-4" />
                    {t('contracts.filters.apply')}
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {activeChips.length > 0 && !filtersOpen ? (
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/[0.12] px-4 py-3">
            <span className="text-muted-foreground me-1 text-xs font-semibold">
              {t('contracts.filters.activeFilters')}
            </span>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="bg-primary/10 text-primary hover:bg-primary/15 focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2"
                onClick={() => {
                  chip.onRemove()
                  resetPage()
                }}
              >
                <span>{chip.label}</span>
                <X aria-hidden="true" className="size-3" />
              </button>
            ))}
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}>
              {t('contracts.filters.clearAll')}
            </Button>
          </div>
        ) : null}

        {contracts.isPending ? (
          <LoadingState className="rounded-none border-0" />
        ) : contracts.isError || !data ? (
          <ErrorState className="rounded-none border-0" onRetry={() => void contracts.refetch()} />
        ) : data.items.length === 0 ? (
          <EmptyState
            className="rounded-none border-0"
            icon={SearchX}
            title={t(archived ? 'contracts.emptyArchived' : 'contracts.emptyTitle')}
            description={t(hasFilters ? 'contracts.emptyFiltered' : 'contracts.emptyDescription')}
          />
        ) : (
          <>
            <div className="hidden max-h-[68vh] overflow-auto md:block">
              <table className="w-full min-w-[1020px] text-sm">
                <thead className="sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))]">
                  <tr>
                    <SortableHeader
                      tone="soft-primary"
                      label={t('contracts.title')}
                      column="title"
                      sortColumn={sortBy}
                      sortDirection={sortDirection}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      tone="soft-primary"
                      label={t('contracts.supplier')}
                      column="supplier"
                      sortColumn={sortBy}
                      sortDirection={sortDirection}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      tone="soft-primary"
                      label={t('contracts.endDate')}
                      column="endDate"
                      sortColumn={sortBy}
                      sortDirection={sortDirection}
                      onSort={changeSort}
                    />
                    <TableHeader>{t('contracts.statusLabel')}</TableHeader>
                    <TableHeader>{t('contracts.renewal')}</TableHeader>
                    <TableHeader>{t('contracts.files.column')}</TableHeader>
                    <TableHeader>{t('contracts.noticeDeadline')}</TableHeader>
                    <SortableHeader
                      tone="soft-primary"
                      label={t('contracts.contractValue')}
                      column="value"
                      sortColumn={sortBy}
                      sortDirection={sortDirection}
                      onSort={changeSort}
                      className="text-end"
                    />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((contract) => (
                    <tr
                      key={contract.id}
                      className="hover:bg-primary/[0.035] focus-within:bg-primary/[0.035] border-b last:border-b-0"
                    >
                      <td className="px-4 py-4">
                        <ContractLink contract={contract} />
                      </td>
                      <td className="px-4 py-4">
                        <SupplierLink contract={contract} />
                      </td>
                      <td className="px-4 py-4 tabular-nums">
                        {contract.endDate
                          ? displayDate(contract.endDate, i18n.language)
                          : t('contracts.noEndDate')}
                      </td>
                      <td className="px-4 py-4">
                        <ContractStatusBadge
                          state={contract.trackingState}
                          daysRemaining={contract.daysRemaining}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex flex-col items-start gap-1">
                          <RenewalIndicator value={contract.isAutoRenewal ? 'YES' : 'NO'} pill />
                          {contract.isAutoRenewal && contract.renewalTermMonths ? (
                            <span className="text-muted-foreground text-xs">
                              {t('contracts.monthsValue', { count: contract.renewalTermMonths })}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {contract.fileCount > 0 ? (
                          <Link
                            to={`/contracts/${contract.id}?tab=files`}
                            className="text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold outline-none focus-visible:ring-2"
                            title={t('contracts.files.count', { count: contract.fileCount })}
                          >
                            <Paperclip aria-hidden="true" className="size-3.5" />
                            <span className="tabular-nums">{contract.fileCount}</span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <NoticeDeadlineCell contract={contract} locale={i18n.language} />
                      </td>
                      <td className="px-4 py-4 text-end">
                        {contract.valueType === 'VARIABLE' ? (
                          <ValueTypeIndicator value="VARIABLE" />
                        ) : (
                          <CurrencyAmount value={contract.contractValueSar} className="font-semibold" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y md:hidden">
              {data.items.map((contract) => (
                <article key={contract.id} className="hover:bg-primary/[0.035] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <ContractLink contract={contract} />
                      <div className="mt-2">
                        <SupplierLink contract={contract} />
                      </div>
                    </div>
                    <ContractStatusBadge state={contract.trackingState} />
                  </div>
                  <div className="text-muted-foreground mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    {contract.fileCount > 0 ? (
                      <>
                        <span>{t('contracts.files.column')}</span>
                        <Link
                          to={`/contracts/${contract.id}?tab=files`}
                          className="text-primary inline-flex items-center justify-end gap-1.5 font-semibold"
                        >
                          <Paperclip aria-hidden="true" className="size-3.5" />
                          {t('contracts.files.count', { count: contract.fileCount })}
                        </Link>
                      </>
                    ) : null}
                    <span>{t('contracts.endDate')}</span>
                    <span className="text-foreground text-end tabular-nums">
                      {contract.endDate
                        ? displayDate(contract.endDate, i18n.language)
                        : t('contracts.noEndDate')}
                    </span>
                    {contract.noticeDeadline ? (
                      <>
                        <span>{t('contracts.noticeDeadline')}</span>
                        <span className="text-end">
                          <NoticeDeadlineCell contract={contract} locale={i18n.language} compact />
                        </span>
                      </>
                    ) : null}
                    <span>{t('contracts.contractValue')}</span>
                    <span className="text-foreground text-end">
                      {contract.valueType === 'VARIABLE' ? (
                        t('contracts.valueTypes.VARIABLE')
                      ) : (
                        <CurrencyAmount value={contract.contractValueSar} />
                      )}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              startRow={startRow}
              endRow={endRow}
              totalRows={data.total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          </>
        )}
      </Card>

      <ContractEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(contract) => navigate(`/contracts/${contract.id}`)}
      />
    </div>
  )
}

function ContractLink({ contract }: { contract: Contract }) {
  return (
    <div className="min-w-0">
      <Link
        className="group hover:bg-primary/10 hover:text-primary focus-visible:ring-ring -ms-2 inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-1 font-semibold outline-none focus-visible:ring-2"
        to={`/contracts/${contract.id}`}
      >
        <OverflowTooltipText className="max-w-full">{contract.title}</OverflowTooltipText>
        <span
          aria-hidden="true"
          className="translate-x-0 text-xs opacity-0 group-hover:translate-x-0.5 group-hover:opacity-100 rtl:group-hover:-translate-x-0.5"
        >
          ›
        </span>
      </Link>
      {contract.contractNumber ? (
        <p dir="ltr" className="text-muted-foreground mt-1 w-fit text-xs tabular-nums">
          {contract.contractNumber}
        </p>
      ) : null}
    </div>
  )
}

function SupplierLink({ contract }: { contract: Contract }) {
  return (
    <Link
      className="hover:bg-primary/10 hover:text-primary focus-visible:ring-ring inline-flex max-w-56 items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2"
      to={`/contracts/suppliers/${contract.supplierId}`}
    >
      <Building2 aria-hidden="true" className="text-primary size-3.5 shrink-0" />
      <OverflowTooltipText className="max-w-48">{contract.supplierName}</OverflowTooltipText>
    </Link>
  )
}

function NoticeDeadlineCell({
  contract,
  locale,
  compact = false,
}: {
  contract: Contract
  locale: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  if (!contract.noticeDeadline) return <span>—</span>
  const remaining = daysUntilDate(contract.noticeDeadline)
  const urgent = remaining !== null && remaining <= 30

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="tabular-nums">{displayDate(contract.noticeDeadline, locale)}</span>
      {urgent ? (
        <span
          className={
            remaining !== null && remaining < 0
              ? 'text-destructive text-xs font-medium'
              : 'text-warning-foreground text-xs font-medium'
          }
        >
          {remaining !== null && remaining < 0
            ? t('contracts.noticeDeadlinePassed')
            : t('contracts.noticeDaysRemaining', { count: remaining ?? 0 })}
        </span>
      ) : compact ? null : null}
    </span>
  )
}

function TableHeader({ children }: { children: ReactNode }) {
  return (
    <th className="border-primary/15 bg-primary/[0.065] border-b px-4 py-3.5 text-start text-[11px] font-semibold tracking-wide text-foreground/75">
      {children}
    </th>
  )
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide">{title}</h3>
      {children}
    </section>
  )
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-foreground/75 text-xs font-medium">{label}</p>
      {children}
    </div>
  )
}

function SummaryButton({
  icon: Icon,
  tone,
  label,
  value,
  active,
  onClick,
}: {
  icon: LucideIcon
  tone: 'primary' | 'success' | 'warning' | 'danger'
  label: string
  value: number
  active: boolean
  onClick: () => void
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-success/12 text-success-foreground'
      : tone === 'warning'
        ? 'bg-warning/15 text-warning-foreground'
        : tone === 'danger'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-primary/10 text-primary'

  return (
    <button
      type="button"
      aria-pressed={active}
      className={`bg-card hover:bg-primary/[0.025] focus-visible:ring-ring rounded-xl border p-4 text-start shadow-sm outline-none focus-visible:ring-2 ${active ? 'border-primary/40 ring-1 ring-primary/10' : 'border-border'}`}
      onClick={onClick}
    >
      <span className={`grid size-9 place-items-center rounded-lg ${toneClass}`}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <p className="text-muted-foreground mt-3 text-xs font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </button>
  )
}

