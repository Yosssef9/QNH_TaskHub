import { Building2, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-error'

import {
  supplierInputFromSupplier,
  useCreateSupplier,
  useUpdateSupplier,
} from '../hooks/use-contracts'
import type { Supplier, SupplierInput } from '../types/contracts.types'

const emptySupplier: SupplierInput = {
  name: '',
  commercialRegistrationNo: null,
  taxNumber: null,
  primaryContactName: null,
  primaryContactEmail: null,
  primaryContactPhone: null,
  addressText: null,
  notes: null,
}

function clean(value: string): string | null {
  return value.trim() || null
}

export function SupplierEditorDialog({
  open,
  supplier,
  quickCreateName,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  supplier?: Supplier | null
  quickCreateName?: string | undefined
  onOpenChange: (open: boolean) => void
  onSaved?: (supplier: Supplier) => void
}) {
  const { t } = useTranslation()
  const createMutation = useCreateSupplier()
  const updateMutation = useUpdateSupplier()
  const initial = useMemo(
    () =>
      supplier
        ? supplierInputFromSupplier(supplier)
        : { ...emptySupplier, name: quickCreateName?.trim() ?? '' },
    [quickCreateName, supplier],
  )
  const [form, setForm] = useState<SupplierInput>(initial)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  const quickCreate = !supplier && quickCreateName !== undefined

  useEffect(() => {
    if (!open) return
    setForm(initial)
    setConfirmOpen(false)
    setDiscardOpen(false)
  }, [open, initial])

  const pending = createMutation.isPending || updateMutation.isPending
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const supplierNameChanged = Boolean(supplier && form.name.trim() !== supplier.name)

  function change<K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function requestClose() {
    if (dirty && !pending) setDiscardOpen(true)
    else onOpenChange(false)
  }

  async function persist() {
    if (!form.name.trim()) {
      toast.error(t('contracts.suppliers.errors.nameRequired'))
      return
    }

    const normalized: SupplierInput = {
      ...form,
      name: form.name.trim(),
      commercialRegistrationNo: clean(form.commercialRegistrationNo ?? ''),
      taxNumber: clean(form.taxNumber ?? ''),
      primaryContactName: clean(form.primaryContactName ?? ''),
      primaryContactEmail: clean(form.primaryContactEmail ?? ''),
      primaryContactPhone: clean(form.primaryContactPhone ?? ''),
      addressText: clean(form.addressText ?? ''),
      notes: clean(form.notes ?? ''),
    }

    try {
      const saved = supplier
        ? await updateMutation.mutateAsync({
            supplierId: supplier.id,
            input: { ...normalized, rowVersion: supplier.rowVersion },
          })
        : await createMutation.mutateAsync(normalized)
      toast.success(t(supplier ? 'contracts.suppliers.updated' : 'contracts.suppliers.created'))
      setConfirmOpen(false)
      onSaved?.(saved)
      onOpenChange(false)
    } catch (error) {
      const key =
        error instanceof ApiClientError && error.code === 'SUPPLIER_NAME_EXISTS'
          ? 'contracts.suppliers.errors.duplicate'
          : error instanceof ApiClientError && error.code === 'SUPPLIER_CHANGED'
            ? 'contracts.errors.changed'
            : 'contracts.suppliers.errors.save'
      toast.error(t(key))
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose()
        }}
      >
        <DialogContent variant="modal" closeLabel={t('common.close')} className="w-[min(44rem,calc(100vw-2rem))]">
          <div className="flex items-start gap-3 pe-10">
            <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
              <Building2 aria-hidden="true" className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                {t(supplier ? 'contracts.suppliers.editTitle' : 'contracts.suppliers.createTitle')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1 text-sm">
                {t('contracts.suppliers.formDescription')}
              </DialogDescription>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label={t('contracts.suppliers.name')} required className="sm:col-span-2">
              <Input value={form.name} onChange={(event) => change('name', event.target.value)} />
            </Field>
            {quickCreate ? (
              <p className="text-muted-foreground text-xs sm:col-span-2">
                {t('contracts.suppliers.quickCreateHint')}
              </p>
            ) : (
              <>
                <Field label={t('contracts.suppliers.commercialRegistrationNo')}>
                  <Input
                    value={form.commercialRegistrationNo ?? ''}
                    onChange={(event) => change('commercialRegistrationNo', event.target.value)}
                  />
                </Field>
                <Field label={t('contracts.suppliers.taxNumber')}>
                  <Input value={form.taxNumber ?? ''} onChange={(event) => change('taxNumber', event.target.value)} />
                </Field>
                <Field label={t('contracts.suppliers.primaryContactName')}>
                  <Input
                    value={form.primaryContactName ?? ''}
                    onChange={(event) => change('primaryContactName', event.target.value)}
                  />
                </Field>
                <Field label={t('contracts.suppliers.primaryContactEmail')}>
                  <Input
                    type="email"
                    value={form.primaryContactEmail ?? ''}
                    onChange={(event) => change('primaryContactEmail', event.target.value)}
                  />
                </Field>
                <Field label={t('contracts.suppliers.primaryContactPhone')}>
                  <Input
                    value={form.primaryContactPhone ?? ''}
                    onChange={(event) => change('primaryContactPhone', event.target.value)}
                  />
                </Field>
                <Field label={t('contracts.suppliers.address')} className="sm:col-span-2">
                  <Textarea
                    value={form.addressText ?? ''}
                    onChange={(event) => change('addressText', event.target.value)}
                  />
                </Field>
                <Field label={t('contracts.notes')} className="sm:col-span-2">
                  <Textarea value={form.notes ?? ''} onChange={(event) => change('notes', event.target.value)} />
                </Field>
              </>
            )}
          </div>

          <div className="mt-7 flex justify-end gap-2">
            <Button variant="outline" disabled={pending} onClick={requestClose}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={pending}
              onClick={() => (supplierNameChanged ? setConfirmOpen(true) : void persist())}
            >
              {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {t(supplier ? 'common.save' : 'contracts.suppliers.create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmOpen}
        title={t('contracts.suppliers.confirmTitle')}
        message={t('contracts.suppliers.confirmDescription', {
          count: supplier?.currentContractCount ?? 0,
        })}
        confirmText={t('contracts.confirmChanges')}
        cancelText={t('contracts.keepEditing')}
        loading={pending}
        onConfirm={() => void persist()}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmModal
        open={discardOpen}
        title={t('contracts.discardTitle')}
        message={t('contracts.discardDescription')}
        confirmText={t('contracts.discard')}
        cancelText={t('contracts.keepEditing')}
        danger
        onConfirm={() => {
          setDiscardOpen(false)
          setForm(initial)
          onOpenChange(false)
        }}
        onCancel={() => setDiscardOpen(false)}
      />
    </>
  )
}

function Field({
  label,
  required = false,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string | undefined
  children: ReactNode
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  )
}
