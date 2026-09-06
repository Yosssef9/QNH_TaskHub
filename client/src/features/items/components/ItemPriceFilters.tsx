import { RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SearchableMultiSelect, type SearchableSelectOption, type SelectValue } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useInfiniteSupplierOptions } from '@/features/suppliers/hooks/use-suppliers'
import type { ProcurementPricePeriod } from '../types/item.types'

const PERIODS: ProcurementPricePeriod[] = ['1M', '3M', '6M', '1Y', 'ALL']

export function ItemPriceFilters({
  period,
  supplierIds,
  selectedSuppliers = [],
  savedViewName,
  onPeriodChange,
  onSupplierIdsChange,
  onSelectedSuppliersChange,
  onReset,
}: {
  period: ProcurementPricePeriod
  supplierIds: number[]
  selectedSuppliers?: SearchableSelectOption[]
  savedViewName?: string | null
  onPeriodChange: (period: ProcurementPricePeriod) => void
  onSupplierIdsChange: (ids: number[]) => void
  onSelectedSuppliersChange?: (options: SearchableSelectOption[]) => void
  onReset: () => void
}) {
  const { t } = useTranslation()
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

  function changeSuppliers(values: SelectValue[]) {
    const ids = values.map(Number)
    const known = new Map([...selectedSuppliers, ...options].map((entry) => [Number(entry.value), entry]))
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
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('items.analytics.historyPeriod')}>
            {PERIODS.map((value) => (
              <Button key={value} type="button" size="sm" variant={period === value ? 'default' : 'outline'} onClick={() => onPeriodChange(value)}>
                {t(`savedViews.periods.${value}`)}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-[minmax(16rem,30rem)_auto] xl:w-auto">
          <SearchableMultiSelect
            multiple
            values={supplierIds}
            options={options}
            selectedOptions={selectedSuppliers}
            searchValue={supplierSearch}
            onSearchChange={setSupplierSearch}
            onOpenChange={setSupplierPickerOpen}
            onChange={changeSuppliers}
            loading={suppliers.isPending}
            loadingMore={suppliers.isFetchingNextPage}
            hasMore={Boolean(suppliers.hasNextPage)}
            onLoadMore={() => { void suppliers.fetchNextPage() }}
            placeholder={t('items.analytics.allSuppliers')}
            searchPlaceholder={t('suppliers.searchPlaceholder')}
            ariaLabel={t('items.analytics.suppliersFilter')}
          />
          <Button type="button" variant="outline" onClick={onReset}><RotateCcw className="size-4" />{t('items.analytics.resetScope')}</Button>
        </div>
      </div>
    </Card>
  )
}
