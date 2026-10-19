import { RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SearchableMultiSelect, type SearchableSelectOption, type SelectValue } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { useInfiniteSupplierOptions } from '@/features/suppliers/hooks/use-suppliers'
import type { ProcurementPricePeriod } from '../types/item.types'

const PERIODS: ProcurementPricePeriod[] = ['1M', '3M', '6M', '1Y', 'ALL']

export function ItemPriceFilters({
  period,
  hidePeriod = false,
  supplierIds,
  supplierMode,
  onSupplierModeChange,
  selectedSuppliers = [],
  savedViewName,
  onPeriodChange,
  onSupplierIdsChange,
  onSelectedSuppliersChange,
  onReset,
  resetDisabled = false,
}: {
  period: ProcurementPricePeriod
  hidePeriod?: boolean
  supplierIds: number[]
  /** Optional for legacy Item Details usage; mode switching is enabled on the Items overview. */
  supplierMode?: 'include' | 'exclude'
  onSupplierModeChange?: (mode: 'include' | 'exclude') => void
  selectedSuppliers?: SearchableSelectOption[]
  savedViewName?: string | null
  onPeriodChange: (period: ProcurementPricePeriod) => void
  onSupplierIdsChange: (ids: number[]) => void
  onSelectedSuppliersChange?: (options: SearchableSelectOption[]) => void
  onReset: () => void
  resetDisabled?: boolean
}) {
  const { t } = useTranslation()
  const effectiveSupplierMode = supplierMode ?? (supplierIds.length > 0 ? 'include' : 'exclude')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)
  const suppliers = useInfiniteSupplierOptions(
    { search: supplierSearch, pageSize: 50 },
    supplierPickerOpen,
  )
  const options = useMemo<SearchableSelectOption[]>(
    () =>
      (suppliers.data?.pages.flatMap((page) => page.items) ?? []).map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
        description: supplier.code,
      })),
    [suppliers.data],
  )
  const selectedDisplayOptions = useMemo<SearchableSelectOption[]>(() => {
    const known = new Map<number, SearchableSelectOption>()
    selectedSuppliers.forEach((entry) => known.set(Number(entry.value), entry))
    options.forEach((entry) => known.set(Number(entry.value), entry))

    return supplierIds.map((id) => known.get(id) ?? {
      value: id,
      label: t('items.analytics.supplierFallback', { id }),
      description: String(id),
    })
  }, [options, selectedSuppliers, supplierIds, t])
  const selectedSummaryText = effectiveSupplierMode === 'exclude'
    ? supplierIds.length === 0
      ? t('items.analytics.allSuppliers')
      : t('items.analytics.suppliersExcluded', { count: supplierIds.length })
    : supplierIds.length === 0
      ? t('items.analytics.noSuppliersSelected')
      : supplierIds.length === 1
        ? selectedDisplayOptions[0]?.label
        : t('items.analytics.suppliersSelected', { count: supplierIds.length })

  function changeSuppliers(values: SelectValue[]) {
    const ids = values.map(Number)
    const known = new Map([...selectedDisplayOptions, ...options].map((entry) => [Number(entry.value), entry]))
    const next = ids.map((id) => known.get(id)).filter((entry): entry is SearchableSelectOption => Boolean(entry))
    onSupplierIdsChange(ids)
    onSelectedSuppliersChange?.(next)
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{t('items.analytics.analysisScope')}</p>
            {savedViewName ? <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-medium">{t('items.analytics.savedViewContext', { name: savedViewName })}</span> : null}
          </div>
          {!hidePeriod ? <div className="flex flex-wrap gap-2" role="group" aria-label={t('items.analytics.historyPeriod')}>
            {PERIODS.map((value) => (
              <Button key={value} type="button" size="sm" variant={period === value ? 'default' : 'outline'} onClick={() => onPeriodChange(value)}>
                {t(`savedViews.periods.${value}`)}
              </Button>
            ))}
          </div> : null}
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-[minmax(16rem,30rem)_auto] xl:w-auto">
          <div className="space-y-2">
            {onSupplierModeChange ? <div className="inline-flex w-full gap-1 rounded-lg border bg-muted/30 p-1" role="group" aria-label={t('items.analytics.supplierModeLabel')}>
              {(['exclude', 'include'] as const).map(mode => (
                <button
                  type="button"
                  key={mode}
                  aria-pressed={effectiveSupplierMode === mode}
                  className={cn('min-w-0 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    effectiveSupplierMode === mode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
                  onClick={() => { if (effectiveSupplierMode !== mode) { onSupplierModeChange?.(mode); setSupplierSearch('') } }}
                >
                  {t(mode === 'exclude' ? 'items.analytics.excludeSuppliersMode' : 'items.analytics.includeSuppliersMode')}
                </button>
              ))}
            </div> : null}
          <SearchableMultiSelect
            multiple
            values={supplierIds}
            options={options}
            selectedOptions={selectedDisplayOptions}
            {...(selectedSummaryText ? { selectedSummaryText } : {})}
            pinSelectedOptions
            selectedSectionLabel={t(effectiveSupplierMode === 'exclude' ? 'items.analytics.excludedSuppliersGroup' : 'items.analytics.selectedSuppliersGroup')}
            optionsSectionLabel={t('items.analytics.otherSuppliersGroup')}
            searchValue={supplierSearch}
            onSearchChange={setSupplierSearch}
            onOpenChange={setSupplierPickerOpen}
            onChange={changeSuppliers}
            loading={suppliers.isLoading}
            loadingMore={suppliers.isFetchingNextPage}
            {...(suppliers.isError ? {
              loadErrorText: t('suppliers.optionsLoadError'),
              onRetry: () => { void suppliers.refetch() },
            } : {})}
            hasMore={Boolean(suppliers.hasNextPage)}
            onLoadMore={() => { void suppliers.fetchNextPage() }}
            placeholder={effectiveSupplierMode === 'exclude' ? t('items.analytics.allSuppliers') : t('items.analytics.noSuppliersSelected')}
            searchPlaceholder={t('suppliers.searchPlaceholder')}
            noResultsText={t('suppliers.noResults')}
            ariaLabel={t('items.analytics.suppliersFilter')}
          />
          {onSupplierModeChange ? <p className="text-muted-foreground text-xs" role="status">
            {effectiveSupplierMode === 'exclude'
              ? t('items.analytics.exclusionHint', { count: supplierIds.length })
              : t('items.analytics.inclusionHint', { count: supplierIds.length })}
          </p> : null}
          </div>
          <Button type="button" variant="outline" disabled={resetDisabled} onClick={onReset}><RotateCcw className="size-4" />{t('items.analytics.resetScope')}</Button>
        </div>
      </div>
    </Card>
  )
}
