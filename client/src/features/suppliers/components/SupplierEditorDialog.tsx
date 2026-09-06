import { Building2, Loader2, LockKeyhole } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ApiClientError } from '@/lib/api-error'

import { supplierInputFromSupplier, useCreateSupplier, useUpdateSupplier } from '../hooks/use-suppliers'
import type { Supplier, SupplierInput } from '../types/supplier.types'

const emptySupplier: SupplierInput = {
  manualFileNo: null,
  name: '',
  nameSecondary: null,
  taxRegistrationNo: null,
  countryName: null,
  cityName: null,
  currency: null,
  contactJobTel: null,
  extensionNo: null,
  mobileNo: null,
  homePhone: null,
  email: null,
}

function clean(value: string): string | null {
  return value.trim() || null
}

export function SupplierEditorDialog({
  open,
  supplier,
  quickCreateName,
  quickCreate = false,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  supplier?: Supplier | undefined
  quickCreateName?: string | undefined
  quickCreate?: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (supplier: Supplier) => void
}) {
  const { t } = useTranslation()
  const createMutation = useCreateSupplier()
  const updateMutation = useUpdateSupplier()
  const initial = useMemo<SupplierInput>(() => {
    if (supplier) return supplierInputFromSupplier(supplier)
    return { ...emptySupplier, name: quickCreateName?.trim() ?? '' }
  }, [quickCreateName, supplier])
  const [form, setForm] = useState(initial)
  const [discardOpen, setDiscardOpen] = useState(false)

  useEffect(() => {
    if (open) setForm(initial)
  }, [initial, open])

  const pending = createMutation.isPending || updateMutation.isPending
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  function change<K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function requestClose() {
    if (pending) return
    if (dirty) setDiscardOpen(true)
    else onOpenChange(false)
  }

  function normalized(): SupplierInput {
    return {
      manualFileNo: clean(form.manualFileNo ?? ''),
      name: form.name.trim(),
      nameSecondary: clean(form.nameSecondary ?? ''),
      taxRegistrationNo: clean(form.taxRegistrationNo ?? ''),
      countryName: clean(form.countryName ?? ''),
      cityName: clean(form.cityName ?? ''),
      currency: clean(form.currency ?? ''),
      contactJobTel: clean(form.contactJobTel ?? ''),
      extensionNo: clean(form.extensionNo ?? ''),
      mobileNo: clean(form.mobileNo ?? ''),
      homePhone: clean(form.homePhone ?? ''),
      email: clean(form.email ?? ''),
    }
  }

  async function persist() {
    const input = normalized()
    if (!input.name) {
      toast.error(t('suppliers.errors.nameRequired'))
      return
    }
    try {
      const saved = supplier
        ? await updateMutation.mutateAsync({ supplierId: supplier.id, input })
        : await createMutation.mutateAsync(input)
      toast.success(t(supplier ? 'suppliers.updated' : 'suppliers.created'))
      onSaved?.(saved)
      onOpenChange(false)
    } catch (error) {
      const key =
        error instanceof ApiClientError && error.code === 'SUPPLIER_NOT_FOUND'
          ? 'suppliers.errors.notFound'
          : 'suppliers.errors.save'
      toast.error(t(key))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && requestClose()}>
        <DialogContent variant="modal" closeLabel={t('common.close')} className="w-[min(48rem,calc(100vw-2rem))]">
          <div className="flex items-start gap-3 pe-10">
            <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
              <Building2 aria-hidden="true" className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                {t(supplier ? 'suppliers.editTitle' : 'suppliers.createTitle')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1 text-sm">
                {t('suppliers.formDescription')}
              </DialogDescription>
            </div>
          </div>

          {supplier ? (
            <div className="bg-muted/50 mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border p-3 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <LockKeyhole aria-hidden="true" className="text-muted-foreground size-4" />
                {t('suppliers.code')}: <span dir="ltr">{supplier.code}</span>
              </span>
              <span className="text-muted-foreground">{t('suppliers.codeLockedHint')}</span>
            </div>
          ) : (
            <p className="bg-muted/50 text-muted-foreground mt-5 rounded-xl border p-3 text-xs leading-5">
              {t('suppliers.manualCodeHint')}
            </p>
          )}

          <div className="mt-5 grid max-h-[60vh] gap-4 overflow-y-auto pe-1 sm:grid-cols-2">
            <Field label={t('suppliers.name')} required className="sm:col-span-2">
              <Input value={form.name} onChange={(event) => change('name', event.target.value)} />
            </Field>
            {quickCreate ? null : (
              <>
                <Field label={t('suppliers.nameSecondary')}>
                  <Input value={form.nameSecondary ?? ''} onChange={(event) => change('nameSecondary', event.target.value)} />
                </Field>
                <Field label={t('suppliers.manualFileNo')}>
                  <Input value={form.manualFileNo ?? ''} onChange={(event) => change('manualFileNo', event.target.value)} />
                </Field>
                <Field label={t('suppliers.taxRegistrationNo')}>
                  <Input value={form.taxRegistrationNo ?? ''} onChange={(event) => change('taxRegistrationNo', event.target.value)} />
                </Field>
                <Field label={t('suppliers.currency')}>
                  <Input value={form.currency ?? ''} onChange={(event) => change('currency', event.target.value)} />
                </Field>
                <Field label={t('suppliers.country')}>
                  <Input value={form.countryName ?? ''} onChange={(event) => change('countryName', event.target.value)} />
                </Field>
                <Field label={t('suppliers.city')}>
                  <Input value={form.cityName ?? ''} onChange={(event) => change('cityName', event.target.value)} />
                </Field>
                <Field label={t('suppliers.contactJobTel')}>
                  <Input value={form.contactJobTel ?? ''} onChange={(event) => change('contactJobTel', event.target.value)} />
                </Field>
                <Field label={t('suppliers.extensionNo')}>
                  <Input value={form.extensionNo ?? ''} onChange={(event) => change('extensionNo', event.target.value)} />
                </Field>
                <Field label={t('suppliers.mobileNo')}>
                  <Input value={form.mobileNo ?? ''} onChange={(event) => change('mobileNo', event.target.value)} />
                </Field>
                <Field label={t('suppliers.homePhone')}>
                  <Input value={form.homePhone ?? ''} onChange={(event) => change('homePhone', event.target.value)} />
                </Field>
                <Field label={t('suppliers.email')} className="sm:col-span-2">
                  <Input type="email" value={form.email ?? ''} onChange={(event) => change('email', event.target.value)} />
                </Field>
              </>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" disabled={pending} onClick={requestClose}>{t('common.cancel')}</Button>
            <Button disabled={pending} onClick={() => void persist()}>
              {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

function Field({ label, required = false, className, children }: {
  label: string
  required?: boolean
  className?: string | undefined
  children: ReactNode
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-sm font-medium">{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  )
}
