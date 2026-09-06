import { Loader2, Tags } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { DatePicker } from '@/components/shared/DatePicker'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ItemPicker } from '@/features/items/components/ItemPicker'
import { formatDateOnly, formatUnitCost } from '@/features/items/components/item-price-format'
import type { ItemOption } from '@/features/items/types/item.types'
import { SupplierPicker } from '@/features/suppliers/components/SupplierPicker'
import type { SupplierOption } from '@/features/suppliers/types/supplier.types'
import { ApiClientError } from '@/lib/api-error'
import { useCreatePriceQuote, usePriceQuoteContext, useUpdatePriceQuote } from '../hooks/use-price-quotes'
import type { PriceQuote, PriceQuoteInput, PriceQuoteUnitSource } from '../types/price-quote.types'

function todayLocal(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const blank: PriceQuoteInput = {
  itemId: 0,
  supplierId: 0,
  quoteDate: todayLocal(),
  quotedUnitCost: 0,
  unitName: '',
  quoteNumber: null,
  notes: null,
}

function unitSourceKey(source: PriceQuoteUnitSource): string | null {
  if (source === 'SUPPLIER_HISTORY') return 'priceQuotes.unitFromSupplierHistory'
  if (source === 'ITEM_HISTORY') return 'priceQuotes.unitFromItemHistory'
  if (source === 'ITEM_MASTER') return 'priceQuotes.unitFromMaster'
  if (source === 'ITEM_PIECE_UNIT') return 'priceQuotes.unitFromPieceUnit'
  return null
}

export function PriceQuoteEditorDialog({
  open,
  quote,
  initialItem,
  initialSupplier,
  onOpenChange,
}: {
  open: boolean
  quote?: PriceQuote | undefined
  initialItem?: { id: number; name: string; unit?: string | null } | undefined
  initialSupplier?: { id: number; name: string } | undefined
  onOpenChange: (open: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const create = useCreatePriceQuote()
  const update = useUpdatePriceQuote()
  const initial = useMemo<PriceQuoteInput>(() => quote ? {
    itemId: quote.itemId,
    supplierId: quote.supplierId,
    quoteDate: quote.quoteDate,
    quotedUnitCost: quote.quotedUnitCost,
    unitName: quote.unitName,
    quoteNumber: quote.quoteNumber,
    notes: quote.notes,
  } : {
    ...blank,
    itemId: initialItem?.id ?? 0,
    supplierId: initialSupplier?.id ?? 0,
  }, [initialItem?.id, initialSupplier?.id, quote])
  const [form, setForm] = useState(initial)
  const [itemName, setItemName] = useState(quote?.itemName ?? initialItem?.name)
  const [supplierName, setSupplierName] = useState(quote?.supplierName ?? initialSupplier?.name)
  const [discardOpen, setDiscardOpen] = useState(false)
  const context = usePriceQuoteContext(open && form.itemId ? form.itemId : null, form.supplierId || null)
  const pending = create.isPending || update.isPending
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const unitOptions = useMemo(() => {
    const options = context.data?.unitOptions ?? []
    const current = form.unitName.trim()
    return current && !options.includes(current) ? [current, ...options] : options
  }, [context.data?.unitOptions, form.unitName])
  const sourceKey = unitSourceKey(context.data?.defaultUnitSource ?? null)

  useEffect(() => {
    if (!open) return
    setForm(initial)
    setItemName(quote?.itemName ?? initialItem?.name)
    setSupplierName(quote?.supplierName ?? initialSupplier?.name)
  }, [initial, initialItem?.name, initialSupplier?.name, open, quote?.itemName, quote?.supplierName])

  useEffect(() => {
    if (!open || !context.data?.defaultUnit || form.unitName) return
    setForm((current) => ({ ...current, unitName: context.data?.defaultUnit ?? '' }))
  }, [context.data, form.unitName, open])

  const change = <K extends keyof PriceQuoteInput>(key: K, value: PriceQuoteInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  function requestClose() {
    if (pending) return
    if (dirty) setDiscardOpen(true)
    else onOpenChange(false)
  }

  async function save() {
    if (!form.itemId) return void toast.error(t('priceQuotes.errors.itemRequired'))
    if (!form.supplierId) return void toast.error(t('priceQuotes.errors.supplierRequired'))
    if (!form.quoteDate) return void toast.error(t('priceQuotes.errors.dateRequired'))
    if (!(form.quotedUnitCost > 0)) return void toast.error(t('priceQuotes.errors.priceRequired'))
    if (!form.unitName.trim()) return void toast.error(t('priceQuotes.errors.unitRequired'))
    const input: PriceQuoteInput = {
      ...form,
      unitName: form.unitName.trim(),
      quoteNumber: form.quoteNumber?.trim() || null,
      notes: form.notes?.trim() || null,
    }
    try {
      if (quote) await update.mutateAsync({ id: quote.id, input: { ...input, rowVersion: quote.rowVersion } })
      else await create.mutateAsync(input)
      toast.success(t(quote ? 'priceQuotes.updated' : 'priceQuotes.created'))
      onOpenChange(false)
    } catch (error) {
      const key = error instanceof ApiClientError && error.code === 'PRICE_QUOTE_STALE'
        ? 'priceQuotes.errors.stale'
        : 'priceQuotes.errors.save'
      toast.error(t(key))
    }
  }

  return <>
    <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
      <DialogContent variant="modal" closeLabel={t('common.close')} className="w-[min(52rem,calc(100vw-2rem))]">
        <div className="flex items-start gap-3 pe-10">
          <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl"><Tags className="size-5" /></div>
          <div>
            <DialogTitle>{t(quote ? 'priceQuotes.editTitle' : 'priceQuotes.createTitle')}</DialogTitle>
            <DialogDescription className="mt-1">{t('priceQuotes.formDescription')}</DialogDescription>
          </div>
        </div>
        <div className="mt-5 grid max-h-[64vh] gap-4 overflow-y-auto pe-1 sm:grid-cols-2">
          <Field label={t('priceQuotes.item')} required>
            <ItemPicker
              value={form.itemId}
              selectedName={itemName}
              onChange={(item: ItemOption) => {
                setForm((current) => ({ ...current, itemId: item.id, unitName: '' }))
                setItemName(item.name)
              }}
            />
          </Field>
          <Field label={t('priceQuotes.supplier')} required>
            <SupplierPicker
              value={form.supplierId}
              selectedName={supplierName}
              onChange={(supplier: SupplierOption) => {
                setForm((current) => ({ ...current, supplierId: supplier.id, unitName: '' }))
                setSupplierName(supplier.name)
              }}
            />
          </Field>
          <Field label={t('priceQuotes.quoteDate')} required>
            <DatePicker
              value={form.quoteDate}
              onChange={(value) => change('quoteDate', value)}
              required
            />
          </Field>
          <Field label={t('priceQuotes.unit')} required>
            <Select value={form.unitName || undefined} onValueChange={(value) => change('unitName', value)} disabled={!form.itemId || context.isPending || unitOptions.length === 0}>
              <SelectTrigger aria-label={t('priceQuotes.unit')}>
                <SelectValue placeholder={!form.itemId ? t('priceQuotes.unitSelectItemFirst') : context.isPending ? t('priceQuotes.unitLoading') : t('priceQuotes.unitSelectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {unitOptions.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
              </SelectContent>
            </Select>
            {context.isError ? <p className="text-destructive mt-1.5 text-xs">{t('priceQuotes.unitContextError')}</p> : null}
            {!context.isPending && !context.isError && form.itemId && unitOptions.length === 0 ? <p className="text-destructive mt-1.5 text-xs">{t('priceQuotes.unitNoOptions')}</p> : null}
            {sourceKey ? <p className="text-muted-foreground mt-1.5 text-xs">{t(sourceKey)}</p> : null}
            {context.data?.latestActualUnitCost !== null && context.data?.latestActualUnitCost !== undefined && context.data.latestActualDate ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {t('priceQuotes.latestActualContext', {
                  value: formatUnitCost(context.data.latestActualUnitCost, locale, 'SAR', context.data.defaultUnit),
                  date: formatDateOnly(context.data.latestActualDate, locale),
                })}
              </p>
            ) : null}
          </Field>
          <Field label={t('priceQuotes.quotedUnitCost')} required>
            <MoneyInput
              value={form.quotedUnitCost > 0 ? form.quotedUnitCost : null}
              onChange={(value) => change('quotedUnitCost', value ?? 0)}
              currencyCode="SAR"
              minimumFractionDigits={0}
              maximumFractionDigits={6}
              ariaLabel={t('priceQuotes.quotedUnitCost')}
            />
          </Field>
          <Field label={t('priceQuotes.quoteNumber')}>
            <Input dir="ltr" value={form.quoteNumber ?? ''} onChange={(event) => change('quoteNumber', event.target.value)} />
          </Field>
          <Field label={t('priceQuotes.notes')} className="sm:col-span-2">
            <Textarea rows={4} value={form.notes ?? ''} onChange={(event) => change('notes', event.target.value)} />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={requestClose}>{t('common.cancel')}</Button>
          <Button disabled={pending || context.isPending || context.isError || unitOptions.length === 0} onClick={() => void save()}>{pending ? <Loader2 className="size-4 animate-spin" /> : null}{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmModal
      open={discardOpen}
      title={t('priceQuotes.discardTitle')}
      message={t('priceQuotes.discardDescription')}
      confirmText={t('priceQuotes.discard')}
      cancelText={t('priceQuotes.keepEditing')}
      danger
      onConfirm={() => { setDiscardOpen(false); setForm(initial); onOpenChange(false) }}
      onCancel={() => setDiscardOpen(false)}
    />
  </>
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return <label className={className}><span className="mb-1.5 block text-sm font-medium">{label}{required ? <span className="text-destructive ms-1">*</span> : null}</span>{children}</label>
}
