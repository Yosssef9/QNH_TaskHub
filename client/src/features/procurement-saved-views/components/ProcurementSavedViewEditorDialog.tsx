import { BookmarkPlus, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { SearchableMultiSelect, type SearchableSelectOption, type SelectValue as SearchableSelectValue } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useInfiniteItemOptions } from '@/features/items/hooks/use-items'
import type { ItemSortBy } from '@/features/items/types/item.types'
import { useInfiniteSupplierOptions } from '@/features/suppliers/hooks/use-suppliers'

import { useCreateProcurementSavedView, useProcurementSavedView, useUpdateProcurementSavedView } from '../hooks/use-procurement-saved-views'
import type { ProcurementSavedViewConfig, ProcurementSavedViewDetail, ProcurementSavedViewSelection, SavedViewPeriod } from '../types/procurement-saved-view.types'

const defaultConfig: ProcurementSavedViewConfig = {
  itemIds: [], supplierIds: [], period: '1Y', category: null, source: null, statusCode: null,
  sortBy: 'name', sortDirection: 'asc', columns: ['item', 'latest', 'lowest', 'highest', 'change', 'suppliers', 'lastPurchase'],
}

const SORTS: ItemSortBy[] = ['name', 'code', 'category', 'latest', 'lowest', 'highest', 'change', 'suppliers', 'lastPurchase']

function option(selection: ProcurementSavedViewSelection): SearchableSelectOption {
  return { value: selection.id, label: selection.name, description: selection.code }
}

export function ProcurementSavedViewEditorDialog({ open, savedViewId, onOpenChange, onSaved }: {
  open: boolean
  savedViewId?: number | null
  onOpenChange: (open: boolean) => void
  onSaved?: (id: number) => void
}) {
  const { t } = useTranslation()
  const detail = useProcurementSavedView(savedViewId ?? null)
  const createMutation = useCreateProcurementSavedView()
  const updateMutation = useUpdateProcurementSavedView()
  const [name, setName] = useState('')
  const [config, setConfig] = useState<ProcurementSavedViewConfig>(defaultConfig)
  const [isDefault, setIsDefault] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [selectedItemOptions, setSelectedItemOptions] = useState<SearchableSelectOption[]>([])
  const [selectedSupplierOptions, setSelectedSupplierOptions] = useState<SearchableSelectOption[]>([])
  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)

  const items = useInfiniteItemOptions(
    { search: itemSearch, pageSize: 50 },
    open && itemPickerOpen,
  )
  const suppliers = useInfiniteSupplierOptions(
    { search: supplierSearch, pageSize: 50 },
    open && supplierPickerOpen,
  )
  const itemOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (items.data?.pages.flatMap((page) => page.items) ?? []).map((item) => ({
        value: item.id,
        label: item.name,
        description: item.code,
      })),
    [items.data],
  )
  const supplierOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (suppliers.data?.pages.flatMap((page) => page.items) ?? []).map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
        description: supplier.code,
      })),
    [suppliers.data],
  )

  useEffect(() => {
    if (!open) return
    const current: ProcurementSavedViewDetail | undefined = detail.data
    if (savedViewId && current) {
      setName(current.name); setConfig(current.config); setIsDefault(current.isDefault)
      setSelectedItemOptions(current.selectedItems.map(option)); setSelectedSupplierOptions(current.selectedSuppliers.map(option))
    } else if (!savedViewId) {
      setName(''); setConfig(defaultConfig); setIsDefault(false); setSelectedItemOptions([]); setSelectedSupplierOptions([])
    }
  }, [detail.data, open, savedViewId])

  function updateSelections(kind: 'items' | 'suppliers', values: SearchableSelectValue[], currentOptions: SearchableSelectOption[]) {
    const ids = values.map(Number)
    const known = new Map([...(kind === 'items' ? selectedItemOptions : selectedSupplierOptions), ...currentOptions].map((entry) => [Number(entry.value), entry]))
    const nextOptions = ids.map((id) => known.get(id)).filter((entry): entry is SearchableSelectOption => Boolean(entry))
    if (kind === 'items') { setConfig((current) => ({ ...current, itemIds: ids })); setSelectedItemOptions(nextOptions) }
    else { setConfig((current) => ({ ...current, supplierIds: ids })); setSelectedSupplierOptions(nextOptions) }
  }

  async function persist() {
    if (!name.trim()) { toast.error(t('savedViews.errors.nameRequired')); return }
    try {
      const input = { name: name.trim(), config, isDefault }
      const saved = savedViewId && detail.data
        ? await updateMutation.mutateAsync({ id: savedViewId, input: { ...input, rowVersion: detail.data.rowVersion } })
        : await createMutation.mutateAsync(input)
      toast.success(t(savedViewId ? 'savedViews.updated' : 'savedViews.created'))
      onSaved?.(saved.id); onOpenChange(false)
    } catch { toast.error(t('savedViews.errors.save')) }
  }

  const pending = createMutation.isPending || updateMutation.isPending
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent variant="modal" closeLabel={t('common.close')} className="w-[min(54rem,calc(100vw-2rem))]">
      <div className="flex items-start gap-3 pe-10"><div className="bg-primary/10 text-primary grid size-11 place-items-center rounded-xl"><BookmarkPlus className="size-5" /></div><div><DialogTitle>{t(savedViewId ? 'savedViews.editTitle' : 'savedViews.createTitle')}</DialogTitle><DialogDescription className="mt-1">{t('savedViews.description')}</DialogDescription></div></div>
      {savedViewId && detail.isPending ? <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</div> : <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium">{t('savedViews.name')} *</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium">{t('savedViews.items')}</span><SearchableMultiSelect multiple values={config.itemIds} options={itemOptions} selectedOptions={selectedItemOptions} searchValue={itemSearch} onSearchChange={setItemSearch} onOpenChange={setItemPickerOpen} onChange={(values) => updateSelections('items', values, itemOptions)} loading={items.isPending} loadingMore={items.isFetchingNextPage} hasMore={Boolean(items.hasNextPage)} onLoadMore={() => { void items.fetchNextPage() }} placeholder={t('savedViews.selectItems')} searchPlaceholder={t('items.searchPlaceholder')} /></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium">{t('savedViews.suppliers')}</span><SearchableMultiSelect multiple values={config.supplierIds} options={supplierOptions} selectedOptions={selectedSupplierOptions} searchValue={supplierSearch} onSearchChange={setSupplierSearch} onOpenChange={setSupplierPickerOpen} onChange={(values) => updateSelections('suppliers', values, supplierOptions)} loading={suppliers.isPending} loadingMore={suppliers.isFetchingNextPage} hasMore={Boolean(suppliers.hasNextPage)} onLoadMore={() => { void suppliers.fetchNextPage() }} placeholder={t('savedViews.selectSuppliers')} searchPlaceholder={t('suppliers.searchPlaceholder')} /><span className="text-muted-foreground mt-1.5 block text-xs">{t('savedViews.supplierAnalyticsHint')}</span></label>
        <label><span className="mb-1.5 block text-sm font-medium">{t('savedViews.period')}</span><Select value={config.period} onValueChange={(value) => setConfig((current) => ({ ...current, period: value as SavedViewPeriod }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1M">{t('savedViews.periods.1M')}</SelectItem><SelectItem value="3M">{t('savedViews.periods.3M')}</SelectItem><SelectItem value="6M">{t('savedViews.periods.6M')}</SelectItem><SelectItem value="1Y">{t('savedViews.periods.1Y')}</SelectItem><SelectItem value="ALL">{t('savedViews.periods.ALL')}</SelectItem></SelectContent></Select></label>
        <label><span className="mb-1.5 block text-sm font-medium">{t('savedViews.category')}</span><Input value={config.category ?? ''} onChange={(e) => setConfig((current) => ({ ...current, category: e.target.value.trim() || null }))} /></label>
        <label><span className="mb-1.5 block text-sm font-medium">{t('savedViews.source')}</span><Select value={config.source ?? 'ALL'} onValueChange={(value) => setConfig((current) => ({ ...current, source: value === 'ALL' ? null : value as 'ORACLE' | 'MANUAL' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('items.sourceAll')}</SelectItem><SelectItem value="ORACLE">{t('items.sourceOracle')}</SelectItem><SelectItem value="MANUAL">{t('items.sourceManual')}</SelectItem></SelectContent></Select></label>
        <label><span className="mb-1.5 block text-sm font-medium">{t('savedViews.status')}</span><Select value={config.statusCode === null ? 'ALL' : String(config.statusCode)} onValueChange={(value) => setConfig((current) => ({ ...current, statusCode: value === 'ALL' ? null : Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('items.statusAll')}</SelectItem><SelectItem value="1">{t('items.statusActive')}</SelectItem><SelectItem value="0">{t('items.statusInactive')}</SelectItem></SelectContent></Select></label>
        <label><span className="mb-1.5 block text-sm font-medium">{t('savedViews.sortBy')}</span><Select value={config.sortBy ?? 'name'} onValueChange={(value) => setConfig((current) => ({ ...current, sortBy: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SORTS.map((sort) => <SelectItem key={sort} value={sort}>{t(`savedViews.sorts.${sort}`)}</SelectItem>)}</SelectContent></Select></label>
        <label><span className="mb-1.5 block text-sm font-medium">{t('savedViews.sortDirection')}</span><Select value={config.sortDirection} onValueChange={(value) => setConfig((current) => ({ ...current, sortDirection: value as 'asc' | 'desc' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="asc">{t('savedViews.ascending')}</SelectItem><SelectItem value="desc">{t('savedViews.descending')}</SelectItem></SelectContent></Select></label>
        <div className="sm:col-span-2 flex items-center justify-between rounded-xl border p-3"><div><p className="text-sm font-medium">{t('savedViews.default')}</p><p className="text-muted-foreground text-xs">{t('savedViews.defaultHint')}</p></div><Switch checked={isDefault} onCheckedChange={setIsDefault} /></div>
      </div>}
      <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button disabled={pending || (savedViewId ? detail.isPending : false)} onClick={() => void persist()}>{pending ? <Loader2 className="size-4 animate-spin" /> : null}{t('common.save')}</Button></div>
    </DialogContent>
  </Dialog>
}


