import { Loader2, Tags } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ItemPicker } from '@/features/items/components/ItemPicker'
import type { ItemOption } from '@/features/items/types/item.types'
import { SupplierPicker } from '@/features/suppliers/components/SupplierPicker'
import type { Supplier } from '@/features/suppliers/types/supplier.types'
import { ApiClientError } from '@/lib/api-error'
import { useCreatePriceQuote, useUpdatePriceQuote } from '../hooks/use-price-quotes'
import type { PriceQuote, PriceQuoteInput } from '../types/price-quote.types'

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
  currencyCode: 'SAR',
  unitName: '',
  quoteNumber: null,
  notes: null,
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
  initialSupplier?: { id: number; name: string; currency?: string | null } | undefined
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const create = useCreatePriceQuote()
  const update = useUpdatePriceQuote()
  const initial = useMemo<PriceQuoteInput>(() => quote ? {
    itemId: quote.itemId,
    supplierId: quote.supplierId,
    quoteDate: quote.quoteDate,
    quotedUnitCost: quote.quotedUnitCost,
    currencyCode: quote.currencyCode,
    unitName: quote.unitName,
    quoteNumber: quote.quoteNumber,
    notes: quote.notes,
  } : {
    ...blank,
    itemId: initialItem?.id ?? 0,
    supplierId: initialSupplier?.id ?? 0,
    unitName: initialItem?.unit ?? '',
    currencyCode: initialSupplier?.currency ?? 'SAR',
  }, [initialItem, initialSupplier, quote])
  const [form, setForm] = useState(initial)
  const [itemName, setItemName] = useState(quote?.itemName ?? initialItem?.name)
  const [supplierName, setSupplierName] = useState(quote?.supplierName ?? initialSupplier?.name)
  const [discardOpen, setDiscardOpen] = useState(false)
  const pending = create.isPending || update.isPending
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  useEffect(() => {
    if (!open) return
    setForm(initial)
    setItemName(quote?.itemName ?? initialItem?.name)
    setSupplierName(quote?.supplierName ?? initialSupplier?.name)
  }, [initial, initialItem?.name, initialSupplier?.name, open, quote?.itemName, quote?.supplierName])

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
    if (!form.currencyCode.trim()) return void toast.error(t('priceQuotes.errors.currencyRequired'))
    if (!form.unitName.trim()) return void toast.error(t('priceQuotes.errors.unitRequired'))
    const input: PriceQuoteInput = {
      ...form,
      currencyCode: form.currencyCode.trim(),
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
                change('itemId', item.id)
                setItemName(item.name)
                if (item.unit) change('unitName', item.unit)
              }}
            />
          </Field>
          <Field label={t('priceQuotes.supplier')} required>
            <SupplierPicker
              value={form.supplierId}
              selectedName={supplierName}
              onChange={(supplier: Supplier) => {
                change('supplierId', supplier.id)
                setSupplierName(supplier.name)
                if (supplier.currency) change('currencyCode', supplier.currency)
              }}
            />
          </Field>
          <Field label={t('priceQuotes.quoteDate')} required>
            <Input type="date" value={form.quoteDate} onChange={(event) => change('quoteDate', event.target.value)} />
          </Field>
          <Field label={t('priceQuotes.quotedUnitCost')} required>
            <Input type="number" min="0" step="0.000001" dir="ltr" value={form.quotedUnitCost || ''} onChange={(event) => change('quotedUnitCost', Number(event.target.value))} />
          </Field>
          <Field label={t('priceQuotes.currency')} required>
            <Input dir="ltr" value={form.currencyCode} onChange={(event) => change('currencyCode', event.target.value)} />
          </Field>
          <Field label={t('priceQuotes.unit')} required>
            <Input value={form.unitName} onChange={(event) => change('unitName', event.target.value)} />
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
          <Button disabled={pending} onClick={() => void save()}>{pending ? <Loader2 className="size-4 animate-spin" /> : null}{t('common.save')}</Button>
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

