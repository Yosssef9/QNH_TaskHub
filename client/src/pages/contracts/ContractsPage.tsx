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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { DatePicker } from '@/components/shared/DatePicker'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableEntityLink } from '@/components/shared/TableEntityLink'
import { SearchInput } from '@/components/shared/SearchInput'
import { SearchableMultiSelect, type SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
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
import { hasAccessPermission } from '@/features/auth/access-permissions'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
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
import { useContracts } from '@/features/contracts/hooks/use-contracts'
import { useInfiniteSupplierOptions } from '@/features/suppliers/hooks/use-suppliers'
import type {
  Contract,
  ContractListQuery,
  ContractPaymentFrequency,
  ContractPaymentTiming,
  ContractTrackingState,
  ContractValueType,
} from '@/features/contracts/types/contracts.types'

interface ContractFilterDraft {
  status?: ContractTrackingState | undefined
  supplierId?: number | undefined
  autoRenewal?: boolean | undefined
  valueType?: ContractValueType | undefined
  paymentFrequency?: ContractPaymentFrequency | undefined
  paymentTiming?: ContractPaymentTiming | undefined
  startFrom?: string | undefined
  startTo?: string | undefined
  endFrom?: string | undefined
  endTo?: string | undefined
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
  const [searchParams] = useSearchParams()
  const currentUser = useCurrentUser()
  const reduceMotion = useReducedMotion()
  const ownerParam = Number(searchParams.get('ownerUserId'))
  const ownerUserId = Number.isSafeInteger(ownerParam) && ownerParam > 0 ? ownerParam : undefined
  const canOpenSuppliers = hasAccessPermission(currentUser.data?.access, 'SUPPLIERS')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
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
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)
  const [selectedSupplierOption, setSelectedSupplierOption] = useState<SearchableSelectOption | null>(null)
  const [draftSupplierOption, setDraftSupplierOption] = useState<SearchableSelectOption | null>(null)

  const queryInput: ContractListQuery = {
    search,
    ownerUserId,
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
  const suppliers = useInfiniteSupplierOptions(
    { search: supplierSearch, pageSize: 50 },
    filtersOpen && supplierPickerOpen,
  )
  const supplierOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (suppliers.data?.pages.flatMap((supplierPage) => supplierPage.items) ?? []).map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
        description: supplier.code,
      })),
    [suppliers.data],
  )
  const data = contracts.data
  const isOwnScope = data?.scope.isOwn ?? ownerUserId === undefined

  useEffect(() => {
    setPage(1)
  }, [ownerUserId])

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
    setSelectedSupplierOption(null)
    setDraftSupplierOption(null)
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
    setDraftSupplierOption(selectedSupplierOption)
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
    setSelectedSupplierOption(draftSupplierOption)
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
  if (supplierId && selectedSupplierOption)
    activeChips.push({
      key: 'supplier',
      label: selectedSupplierOption.label,
      onRemove: () => {
        setSupplierId(undefined)
        setSelectedSupplierOption(null)
      },
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
        title={
          data && !data.scope.isOwn
            ? t('contracts.sharedPageTitle', { name: data.scope.ownerUserName })
            : t('contracts.pageTitle')
        }
        description={
          data && !data.scope.isOwn
            ? t(
                data.scope.canManageAttachments
                  ? 'contracts.sharedPageDescriptionManageFiles'
                  : 'contracts.sharedPageDescription',
              )
            : t('contracts.pageDescription')
        }
        actions={
          isOwnScope ? (
            <>
              {canOpenSuppliers ? (
                <Button variant="outline" onClick={() => navigate('/suppliers')}>
                  <Building2 aria-hidden="true" className="size-4" />
                  {t('procurement.navigation.suppliers')}
                </Button>
              ) : null}
              <Button onClick={() => setCreateOpen(true)}>
                <FilePlus2 aria-hidden="true" className="size-4" />
                {t('contracts.create')}
              </Button>
            </>
          ) : undefined
        }
      />

      {data && !data.scope.isOwn ? (
        <div className="bg-primary/5 border-primary/20 rounded-xl border p-4 text-sm">
          <p className="font-semibold">{t('contracts.sharedAccessTitle', { name: data.scope.ownerUserName })}</p>
          <p className="text-muted-foreground mt-1">
            {t(
              data.scope.canManageAttachments
                ? 'contracts.sharedAccessManageFiles'
                : 'contracts.sharedAccessReadOnly',
            )}
          </p>
        </div>
      ) : null}

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

      <Card className="relative overflow-visible">
        <div className="bg-card sticky top-16 z-30 flex flex-col gap-3 rounded-t-xl border-b p-4 shadow-sm xl:flex-row xl:items-center">
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
            variant="outline"
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
                        <SearchableMultiSelect
                          value={draftFilters.supplierId ?? null}
                          options={supplierOptions}
                          selectedOptions={draftSupplierOption ? [draftSupplierOption] : []}
                          searchValue={supplierSearch}
                          onSearchChange={setSupplierSearch}
                          onOpenChange={setSupplierPickerOpen}
                          onChange={(value) => {
                            const nextId = value === null ? undefined : Number(value)
                            const nextOption = nextId === undefined
                              ? null
                              : supplierOptions.find((option) => Number(option.value) === nextId) ?? null
                            setDraftFilters((current) => ({
                              ...current,
                              supplierId: nextId,
                            }))
                            setDraftSupplierOption(nextOption)
                          }}
                          onLoadMore={() => { void suppliers.fetchNextPage() }}
                          hasMore={Boolean(suppliers.hasNextPage)}
                          loading={suppliers.isLoading}
                          loadingMore={suppliers.isFetchingNextPage}
                          {...(suppliers.isError ? {
                            loadErrorText: t('suppliers.optionsLoadError'),
                            onRetry: () => { void suppliers.refetch() },
                          } : {})}
                          placeholder={t('contracts.filters.allSuppliers')}
                          searchPlaceholder={t('suppliers.searchPlaceholder')}
                          noResultsText={t('suppliers.noResults')}
                          ariaLabel={t('contracts.supplier')}
                        />
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
            description={t(
              hasFilters
                ? 'contracts.emptyFiltered'
                : data.scope.isOwn
                  ? 'contracts.emptyDescription'
                  : 'contracts.sharedEmptyDescription',
            )}
          />
        ) : (
          <>
            <div className="relative isolate hidden max-h-[calc(100vh-11rem)] overflow-auto overscroll-contain md:block">
              <table className="w-full min-w-[1020px] text-sm">
                <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20">
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
                        <SupplierLink contract={contract} canNavigate={canOpenSuppliers} />
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
                        <SupplierLink contract={contract} canNavigate={canOpenSuppliers} />
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

      {isOwnScope ? (
        <ContractEditorDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSaved={(contract) => navigate(`/contracts/${contract.id}`)}
        />
      ) : null}
    </div>
  )
}

function ContractLink({ contract }: { contract: Contract }) {
  return <TableEntityLink kind="contract" id={contract.id} name={contract.title} code={contract.contractNumber} className="max-w-[22rem]" />
}

function SupplierLink({ contract, canNavigate }: { contract: Contract; canNavigate: boolean }) {
  if (!canNavigate) return <span className="font-medium">{contract.supplierName}</span>
  return <TableEntityLink kind="supplier" id={contract.supplierId} name={contract.supplierName} compact className="max-w-56" />
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
    <th className="border-primary/20 bg-accent border-b-2 px-4 py-4 text-start text-xs font-semibold text-accent-foreground">
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


