import { Loader2, LockKeyhole, PackageSearch } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ApiClientError } from '@/lib/api-error'
import { itemInputFromItem, useCreateItem, useUpdateItem } from '../hooks/use-items'
import type { Item, ItemInput } from '../types/item.types'

const emptyItem: ItemInput = {
  name: '', parentName: null, categoryName: null, unit: null, pieceUnit: null, factor: 1,
  isStockItem: true, statusCode: 1, isAsset: false,
}
const clean = (value: string): string | null => value.trim() || null

export function ItemEditorDialog({ open, item, onOpenChange }: { open: boolean; item?: Item | undefined; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const createMutation = useCreateItem()
  const updateMutation = useUpdateItem()
  const initial = useMemo(() => item ? itemInputFromItem(item) : emptyItem, [item])
  const [form, setForm] = useState<ItemInput>(initial)
  const [discardOpen, setDiscardOpen] = useState(false)
  useEffect(() => { if (open) setForm(initial) }, [initial, open])
  const pending = createMutation.isPending || updateMutation.isPending
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const change = <K extends keyof ItemInput>(key: K, value: ItemInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  const requestClose = () => { if (!pending) dirty ? setDiscardOpen(true) : onOpenChange(false) }

  async function persist() {
    const input: ItemInput = {
      ...form,
      name: form.name.trim(),
      parentName: clean(form.parentName ?? ''), categoryName: clean(form.categoryName ?? ''),
      unit: clean(form.unit ?? ''), pieceUnit: clean(form.pieceUnit ?? ''),
    }
    if (!input.name) { toast.error(t('items.errors.nameRequired')); return }
    try {
      if (item) await updateMutation.mutateAsync({ itemId: item.id, input })
      else await createMutation.mutateAsync(input)
      toast.success(t(item ? 'items.updated' : 'items.created'))
      onOpenChange(false)
    } catch (error) {
      toast.error(t(error instanceof ApiClientError && error.code === 'ITEM_NOT_FOUND' ? 'items.errors.notFound' : 'items.errors.save'))
    }
  }

  return <>
    <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
      <DialogContent variant="modal" closeLabel={t('common.close')} className="w-[min(48rem,calc(100vw-2rem))]">
        <div className="flex items-start gap-3 pe-10">
          <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl"><PackageSearch className="size-5" /></div>
          <div><DialogTitle>{t(item ? 'items.editTitle' : 'items.createTitle')}</DialogTitle><DialogDescription className="mt-1">{t('items.formDescription')}</DialogDescription></div>
        </div>
        {item ? <div className="bg-muted/50 mt-5 flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"><LockKeyhole className="size-4" /><strong>{t('items.code')}:</strong><span dir="ltr">{item.code}</span><span className="text-muted-foreground">{t('items.codeLockedHint')}</span></div> : <p className="bg-muted/50 text-muted-foreground mt-5 rounded-xl border p-3 text-xs">{t('items.manualCodeHint')}</p>}
        <div className="mt-5 grid max-h-[60vh] gap-4 overflow-y-auto pe-1 sm:grid-cols-2">
          <Field label={t('items.name')} required className="sm:col-span-2"><Input value={form.name} onChange={(e) => change('name', e.target.value)} /></Field>
          <Field label={t('items.parentName')}><Input value={form.parentName ?? ''} onChange={(e) => change('parentName', e.target.value)} /></Field>
          <Field label={t('items.category')}><Input value={form.categoryName ?? ''} onChange={(e) => change('categoryName', e.target.value)} /></Field>
          <Field label={t('items.unit')}><Input value={form.unit ?? ''} onChange={(e) => change('unit', e.target.value)} /></Field>
          <Field label={t('items.pieceUnit')}><Input value={form.pieceUnit ?? ''} onChange={(e) => change('pieceUnit', e.target.value)} /></Field>
          <Field label={t('items.factor')}><Input type="number" min="0" step="any" value={form.factor ?? ''} onChange={(e) => change('factor', e.target.value === '' ? null : Number(e.target.value))} /></Field>
          <Field label={t('items.statusCode')}><Input type="number" step="1" value={form.statusCode ?? ''} onChange={(e) => change('statusCode', e.target.value === '' ? null : Number(e.target.value))} /></Field>
          <ToggleField label={t('items.stockItem')} checked={form.isStockItem} onChange={(value) => change('isStockItem', value)} />
          <ToggleField label={t('items.asset')} checked={form.isAsset} onChange={(value) => change('isAsset', value)} />
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={requestClose}>{t('common.cancel')}</Button><Button disabled={pending} onClick={() => void persist()}>{pending ? <Loader2 className="size-4 animate-spin" /> : null}{t('common.save')}</Button></div>
      </DialogContent>
    </Dialog>
    <ConfirmModal open={discardOpen} title={t('items.discardTitle')} message={t('items.discardDescription')} confirmText={t('items.discard')} cancelText={t('items.keepEditing')} danger onConfirm={() => { setDiscardOpen(false); setForm(initial); onOpenChange(false) }} onCancel={() => setDiscardOpen(false)} />
  </>
}

function Field({ label, required = false, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return <label className={className}><span className="mb-1.5 block text-sm font-medium">{label}{required ? ' *' : ''}</span>{children}</label>
}
function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border p-3"><span className="text-sm font-medium">{label}</span><Switch checked={checked} onCheckedChange={onChange} /></div>
}
