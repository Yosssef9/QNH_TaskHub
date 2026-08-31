import { FilePenLine, FileUp, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { DatePicker } from '@/components/shared/DatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-error'

import { useCreateContract, useUpdateContract, useUploadContractAttachment } from '../hooks/use-contracts'
import type {
  Contract,
  ContractInput,
  ContractPaymentFrequency,
  ContractPaymentTiming,
  ContractValueType,
  Supplier,
} from '../types/contracts.types'
import {
  defaultContractInput,
  displayDate,
  editableContract,
  formatSar,
  noticeDeadlinePreview,
  paymentFrequencies,
  paymentTimings,
  valueTypes,
} from './contract-display'
import { CurrencyAmount } from './CurrencyAmount'
import { CurrencyInput } from './CurrencyInput'
import {
  PaymentFrequencyIndicator,
  PaymentTimingIndicator,
  ValueTypeIndicator,
} from './ContractSelectIndicators'
import { SupplierPicker } from './SupplierPicker'

function clean(value: string): string | null {
  return value.trim() || null
}

function normalized(input: ContractInput): ContractInput {
  return {
    ...input,
    title: input.title.trim(),
    contractNumber: clean(input.contractNumber ?? ''),
    renewalTermMonths: input.isAutoRenewal ? input.renewalTermMonths : null,
    noticePeriodDays: input.isAutoRenewal ? input.noticePeriodDays : null,
    contractValueSar: input.valueType === 'FIXED' ? input.contractValueSar : null,
    notes: clean(input.notes ?? ''),
  }
}

export function ContractEditorDialog({
  open,
  contract,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  contract?: Contract | null
  onOpenChange: (open: boolean) => void
  onSaved?: (contract: Contract) => void
}) {
  const { i18n, t } = useTranslation()
  const createMutation = useCreateContract()
  const updateMutation = useUpdateContract()
  const uploadMutation = useUploadContractAttachment()
  const initial = useMemo(() => (contract ? editableContract(contract) : defaultContractInput()), [contract])
  const [form, setForm] = useState<ContractInput>(initial)
  const [openEnded, setOpenEnded] = useState(contract ? contract.endDate === null : false)
  const [selectedSupplierName, setSelectedSupplierName] = useState(contract?.supplierName ?? '')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [primaryFile, setPrimaryFile] = useState<File | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(initial)
    setOpenEnded(contract ? contract.endDate === null : false)
    setSelectedSupplierName(contract?.supplierName ?? '')
    setConfirmOpen(false)
    setDiscardOpen(false)
    setPrimaryFile(null)
  }, [open, contract, initial])

  const pending = createMutation.isPending || updateMutation.isPending || uploadMutation.isPending
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || (contract ? contract.endDate === null : false) !== openEnded || Boolean(primaryFile)
  const noticeDeadline = form.isAutoRenewal
    ? noticeDeadlinePreview(form.endDate, form.noticePeriodDays)
    : null

  function change<K extends keyof ContractInput>(key: K, value: ContractInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setAutoRenewal(value: boolean) {
    setForm((current) => ({
      ...current,
      isAutoRenewal: value,
      renewalTermMonths: value ? current.renewalTermMonths : null,
      noticePeriodDays: value ? current.noticePeriodDays : null,
    }))
    if (value) setOpenEnded(false)
  }

  function setValueType(value: ContractValueType) {
    setForm((current) => ({
      ...current,
      valueType: value,
      contractValueSar: value === 'VARIABLE' ? null : current.contractValueSar,
    }))
  }

  function validate(): string | null {
    if (!form.title.trim()) return t('contracts.errors.titleRequired')
    if (!form.supplierId) return t('contracts.errors.supplierRequired')
    if (!form.startDate) return t('contracts.errors.startDateRequired')
    if (!openEnded && !form.endDate) return t('contracts.errors.endDateOrOpenEnded')
    if (form.endDate && form.endDate < form.startDate) return t('contracts.errors.dateRange')
    if (form.isAutoRenewal && !form.endDate) return t('contracts.errors.autoEndDate')
    if (form.isAutoRenewal && !form.renewalTermMonths) return t('contracts.errors.renewalTerm')
    if (form.isAutoRenewal && !form.noticePeriodDays) return t('contracts.errors.noticePeriod')
    if (form.valueType === 'FIXED' && form.contractValueSar === null)
      return t('contracts.errors.fixedValue')
    return null
  }

  function requestSave() {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }
    if (contract) setConfirmOpen(true)
    else void persist()
  }

  async function persist() {
    const input = normalized({ ...form, endDate: openEnded ? null : form.endDate })
    try {
      const saved = contract
        ? await updateMutation.mutateAsync({
            contractId: contract.id,
            input: { ...input, rowVersion: contract.rowVersion },
          })
        : await createMutation.mutateAsync(input)

      let fileUploadFailed = false
      if (!contract && primaryFile) {
        try {
          await uploadMutation.mutateAsync({ contractId: saved.id, file: primaryFile })
        } catch {
          fileUploadFailed = true
        }
      }

      toast.success(t(contract ? 'contracts.updated' : 'contracts.created'))
      if (fileUploadFailed) toast.error(t('contracts.files.errors.createUpload'))
      setConfirmOpen(false)
      onSaved?.(saved)
      onOpenChange(false)
    } catch (error) {
      const key =
        error instanceof ApiClientError && error.code === 'CONTRACT_CHANGED'
          ? 'contracts.errors.changed'
          : error instanceof ApiClientError && error.code === 'ACTIVE_SUPPLIER_REQUIRED'
            ? 'contracts.errors.activeSupplierRequired'
            : 'contracts.errors.save'
      toast.error(t(key))
    }
  }

  function requestClose() {
    if (dirty && !pending) setDiscardOpen(true)
    else onOpenChange(false)
  }

  const changes = contract
    ? buildChanges(
        contract,
        normalized({ ...form, endDate: openEnded ? null : form.endDate }),
        selectedSupplierName,
        i18n.language,
        {
          supplier: t('contracts.supplier'),
          contractNumber: t('contracts.contractNumber'),
          title: t('contracts.title'),
          startDate: t('contracts.startDate'),
          endDate: t('contracts.endDate'),
          automaticRenewal: t('contracts.automaticRenewal'),
          renewalTerm: t('contracts.renewalTermMonths'),
          noticePeriod: t('contracts.noticePeriodDays'),
          valueType: t('contracts.valueType'),
          contractValue: t('contracts.contractValue'),
          paymentFrequency: t('contracts.paymentFrequency'),
          paymentTiming: t('contracts.paymentTiming'),
          notes: t('contracts.notes'),
          yes: t('common.yes'),
          no: t('common.no'),
        },
      )
    : []

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose()
        }}
      >
        <DialogContent
          variant="modal"
          closeLabel={t('common.close')}
          className="w-[min(58rem,calc(100vw-2rem))]"
        >
          <div className="flex items-start gap-3 pe-10">
            <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
              <FilePenLine aria-hidden="true" className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                {t(contract ? 'contracts.editTitle' : 'contracts.createTitle')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1 text-sm">
                {t('contracts.formDescription')}
              </DialogDescription>
            </div>
          </div>

          <div className="mt-6 space-y-7">
            <FormSection title={t('contracts.sections.basic')}>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t('contracts.title')} required className="sm:col-span-2">
                  <Input value={form.title} onChange={(event) => change('title', event.target.value)} />
                </Field>
                <Field label={t('contracts.contractNumber')}>
                  <Input
                    dir="ltr"
                    className="tabular-nums"
                    value={form.contractNumber ?? ''}
                    onChange={(event) => change('contractNumber', event.target.value)}
                  />
                </Field>
                <Field label={t('contracts.supplier')} required>
                  <SupplierPicker
                    value={form.supplierId}
                    selectedName={selectedSupplierName}
                    onChange={(supplier: Supplier) => {
                      change('supplierId', supplier.id)
                      setSelectedSupplierName(supplier.name)
                    }}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection title={t('contracts.sections.term')}>
              <div className="grid gap-5 sm:grid-cols-2">
                <DatePicker
                  value={form.startDate}
                  onChange={(value) => change('startDate', value)}
                  label={t('contracts.startDate')}
                  required
                />
                <DatePicker
                  value={form.endDate}
                  onChange={(value) => change('endDate', value || null)}
                  label={t('contracts.endDate')}
                  minDate={form.startDate || undefined}
                  disabled={openEnded}
                />
                <div className="bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-4 sm:col-span-2">
                  <div>
                    <p className="text-sm font-medium">{t('contracts.openEnded')}</p>
                    <p className="text-muted-foreground mt-1 text-xs">{t('contracts.openEndedDescription')}</p>
                  </div>
                  <Switch
                    checked={openEnded}
                    disabled={form.isAutoRenewal}
                    onCheckedChange={(checked) => {
                      setOpenEnded(checked)
                      if (checked) change('endDate', null)
                    }}
                  />
                </div>
                <div className="bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-4 sm:col-span-2">
                  <div>
                    <p className="text-sm font-medium">{t('contracts.automaticRenewal')}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('contracts.automaticRenewalDescription')}
                    </p>
                  </div>
                  <Switch checked={form.isAutoRenewal} onCheckedChange={setAutoRenewal} />
                </div>
                {form.isAutoRenewal ? (
                  <>
                    <Field label={t('contracts.renewalTermMonths')} required>
                      <Input
                        type="number"
                        min={1}
                        value={form.renewalTermMonths ?? ''}
                        onChange={(event) =>
                          change(
                            'renewalTermMonths',
                            event.target.value ? Number(event.target.value) : null,
                          )
                        }
                      />
                    </Field>
                    <Field label={t('contracts.noticePeriodDays')} required>
                      <Input
                        type="number"
                        min={1}
                        value={form.noticePeriodDays ?? ''}
                        onChange={(event) =>
                          change(
                            'noticePeriodDays',
                            event.target.value ? Number(event.target.value) : null,
                          )
                        }
                      />
                    </Field>
                    <div className="bg-primary/5 rounded-lg border border-primary/15 p-4 sm:col-span-2">
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                        {t('contracts.noticeDeadline')}
                      </p>
                      <p className="mt-1 font-semibold">
                        {noticeDeadline
                          ? displayDate(noticeDeadline, i18n.language)
                          : t('contracts.calculatedWhenComplete')}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t('contracts.noticeDeadlineDescription')}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
            </FormSection>

            <FormSection title={t('contracts.sections.financial')}>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t('contracts.valueType')} required>
                  <Select
                    value={form.valueType}
                    onValueChange={(value) => setValueType(value as ContractValueType)}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        <ValueTypeIndicator value={form.valueType} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {valueTypes.map((value) => (
                        <SelectItem key={value} value={value}>
                          <ValueTypeIndicator value={value} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {form.valueType === 'FIXED' ? (
                  <Field label={t('contracts.contractValue')} required>
                    <CurrencyInput
                      value={form.contractValueSar}
                      ariaLabel={t('contracts.contractValue')}
                      onChange={(value) => change('contractValueSar', value)}
                    />
                  </Field>
                ) : (
                  <div className="bg-muted/50 rounded-lg border p-4 text-sm">
                    {t('contracts.variableValueDescription')}
                  </div>
                )}
              </div>
            </FormSection>

            <FormSection title={t('contracts.sections.payment')}>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t('contracts.paymentFrequency')}>
                  <Select
                    value={form.paymentFrequency ?? 'NONE'}
                    onValueChange={(value) =>
                      change(
                        'paymentFrequency',
                        value === 'NONE' ? null : (value as ContractPaymentFrequency),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>
                        <PaymentFrequencyIndicator value={form.paymentFrequency ?? 'NONE'} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">
                        <PaymentFrequencyIndicator value="NONE" />
                      </SelectItem>
                      {paymentFrequencies.map((value) => (
                        <SelectItem key={value} value={value}>
                          <PaymentFrequencyIndicator value={value} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('contracts.paymentTiming')}>
                  <Select
                    value={form.paymentTiming ?? 'NONE'}
                    onValueChange={(value) =>
                      change(
                        'paymentTiming',
                        value === 'NONE' ? null : (value as ContractPaymentTiming),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>
                        <PaymentTimingIndicator value={form.paymentTiming ?? 'NONE'} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">
                        <PaymentTimingIndicator value="NONE" />
                      </SelectItem>
                      {paymentTimings.map((value) => (
                        <SelectItem key={value} value={value}>
                          <PaymentTimingIndicator value={value} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </FormSection>

            {!contract ? (
              <FormSection title={t('contracts.files.primaryTitle')}>
                <div className="rounded-xl border border-dashed p-4">
                  {primaryFile ? (
                    <div className="flex items-center gap-3">
                      <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                        <FileUp aria-hidden="true" className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{primaryFile.name}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {t('contracts.files.primaryQueued')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setPrimaryFile(null)}
                        aria-label={t('contracts.files.remove')}
                      >
                        <X aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-3">
                      <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                        <FileUp aria-hidden="true" className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{t('contracts.files.choosePrimary')}</span>
                        <span className="text-muted-foreground mt-1 block text-xs">
                          {t('contracts.files.rules')}
                        </span>
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                        onChange={(event) => {
                          const file = event.target.files?.item(0) ?? null
                          if (!file) return
                          const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
                          if (!['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) {
                            toast.error(t('contracts.files.errors.type'))
                            event.target.value = ''
                            return
                          }
                          if (file.size > 10 * 1024 * 1024) {
                            toast.error(t('contracts.files.errors.tooLarge'))
                            event.target.value = ''
                            return
                          }
                          setPrimaryFile(file)
                        }}
                      />
                    </label>
                  )}
                </div>
              </FormSection>
            ) : null}

            <FormSection title={t('contracts.notes')}>
              <Textarea value={form.notes ?? ''} onChange={(event) => change('notes', event.target.value)} />
            </FormSection>
          </div>

          <div className="bg-background sticky bottom-0 mt-7 flex items-center justify-between gap-3 border-t pt-4">
            <span className="text-muted-foreground text-xs">
              {dirty ? t('contracts.unsavedChanges') : ''}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={pending} onClick={requestClose}>
                {t('common.cancel')}
              </Button>
              <Button disabled={pending || (contract ? changes.length === 0 : false)} onClick={requestSave}>
                {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                {t(contract ? 'contracts.saveChanges' : 'contracts.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmOpen}
        title={t('contracts.confirmTitle')}
        message={t('contracts.confirmDescription', { count: changes.length })}
        confirmText={t('contracts.confirmChanges')}
        cancelText={t('contracts.keepEditing')}
        loading={pending}
        onConfirm={() => void persist()}
        onCancel={() => setConfirmOpen(false)}
      >
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border p-3">
          {changes.map((change) => (
            <div key={change.key} className="text-sm">
              <p className="font-medium">{change.label}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <ReviewValue
                  label={t('contracts.changeFrom')}
                  value={change.from}
                  currency={change.key === 'contractValue'}
                />
                <ReviewValue
                  label={t('contracts.changeTo')}
                  value={change.to}
                  currency={change.key === 'contractValue'}
                  emphasized
                />
              </div>
            </div>
          ))}
        </div>
      </ConfirmModal>

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
          setOpenEnded(contract ? contract.endDate === null : false)
          setSelectedSupplierName(contract?.supplierName ?? '')
          setPrimaryFile(null)
          onOpenChange(false)
        }}
        onCancel={() => setDiscardOpen(false)}
      />
    </>
  )
}

function buildChanges(
  contract: Contract,
  input: ContractInput,
  supplierName: string,
  locale: string,
  labels: {
    supplier: string
    contractNumber: string
    title: string
    startDate: string
    endDate: string
    automaticRenewal: string
    renewalTerm: string
    noticePeriod: string
    valueType: string
    contractValue: string
    paymentFrequency: string
    paymentTiming: string
    notes: string
    yes: string
    no: string
  },
) {
  const rows: Array<{ key: string; label: string; from: string; to: string }> = []
  const push = (
    key: string,
    label: string,
    from: unknown,
    to: unknown,
    format: (value: unknown) => string = String,
  ) => {
    if (from === to) return
    rows.push({
      key,
      label,
      from: displayValue(from, format, labels.yes, labels.no),
      to: displayValue(to, format, labels.yes, labels.no),
    })
  }

  push('supplier', labels.supplier, contract.supplierName, supplierName)
  push('contractNumber', labels.contractNumber, contract.contractNumber, input.contractNumber)
  push('title', labels.title, contract.title, input.title)
  push('startDate', labels.startDate, contract.startDate, input.startDate, (value) =>
    displayDate(String(value), locale),
  )
  push('endDate', labels.endDate, contract.endDate, input.endDate, (value) =>
    displayDate(String(value), locale),
  )
  push(
    'autoRenewal',
    labels.automaticRenewal,
    contract.isAutoRenewal,
    input.isAutoRenewal,
  )
  push('renewalTerm', labels.renewalTerm, contract.renewalTermMonths, input.renewalTermMonths)
  push('noticePeriod', labels.noticePeriod, contract.noticePeriodDays, input.noticePeriodDays)
  push('valueType', labels.valueType, contract.valueType, input.valueType)
  push(
    'contractValue',
    labels.contractValue,
    contract.contractValueSar,
    input.contractValueSar,
    (value) => formatSar(Number(value)),
  )
  push(
    'paymentFrequency',
    labels.paymentFrequency,
    contract.paymentFrequency,
    input.paymentFrequency,
  )
  push('paymentTiming', labels.paymentTiming, contract.paymentTiming, input.paymentTiming)
  push('notes', labels.notes, contract.notes, input.notes)
  return rows
}

function displayValue(
  value: unknown,
  formatter: (value: unknown) => string,
  yes: string,
  no: string,
): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? yes : no
  return formatter(value)
}

function ReviewValue({
  label,
  value,
  currency,
  emphasized = false,
}: {
  label: string
  value: string
  currency?: boolean
  emphasized?: boolean
}) {
  const amount =
    currency && value !== '—' ? Number(value.replace(/SAR/g, '').replace(/,/g, '').trim()) : null

  return (
    <div className="bg-muted/35 rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-[11px] font-semibold">{label}</p>
      <div className={emphasized ? 'text-foreground mt-1 font-medium' : 'text-muted-foreground mt-1'}>
        {currency && Number.isFinite(amount) ? (
          <CurrencyAmount value={amount} mutedCurrency={!emphasized} />
        ) : (
          <span className="break-words">{value}</span>
        )}
      </div>
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide">{title}</h3>
      {children}
    </section>
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
