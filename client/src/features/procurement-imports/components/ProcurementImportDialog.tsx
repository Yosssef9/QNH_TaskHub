import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiClientError } from '@/lib/api-error'
import { useProcurementSavedView, useProcurementSavedViews } from '@/features/procurement-saved-views/hooks/use-procurement-saved-views'
import { useApplyProcurementImport, usePreviewProcurementImport } from '../hooks/use-procurement-imports'
import type {
  ProcurementImportApplyResult,
  ProcurementImportPreview,
  ProcurementImportQuoteStatus,
  ProcurementImportTargetMode,
} from '../types/procurement-import.types'

const MAX_IMPORT_BYTES = 5 * 1024 * 1024
const MAX_VISIBLE_QUOTES = 250

interface ProcurementImportDialogProps {
  open: boolean
  activeViewId: number | null
  onOpenChange: (open: boolean) => void
  onApplied: (savedViewId: number) => void
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback
}

function statusTone(status: ProcurementImportQuoteStatus): string {
  if (status === 'NEW_QUOTE' || status === 'REPEATED_PRICE_NEW_DATE') {
    return 'bg-success/10 text-success'
  }
  if (status === 'PRICE_CHANGED') {
    return 'bg-primary/10 text-primary'
  }
  if (status === 'DUPLICATE_TODAY') {
    return 'bg-muted text-muted-foreground'
  }
  return 'bg-destructive/10 text-destructive'
}

function countUnique(values: Array<number | null>): number[] {
  return [...new Set(values.flatMap((value) => value === null ? [] : [value]))]
}

export function ProcurementImportDialog({
  open,
  activeViewId,
  onOpenChange,
  onApplied,
}: ProcurementImportDialogProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const fileInputRef = useRef<HTMLInputElement>(null)
  const savedViews = useProcurementSavedViews()
  const previewMutation = usePreviewProcurementImport()
  const applyMutation = useApplyProcurementImport()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ProcurementImportPreview | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [targetMode, setTargetMode] = useState<ProcurementImportTargetMode>('EXISTING_VIEW')
  const [targetSavedViewId, setTargetSavedViewId] = useState<number | null>(activeViewId)
  const [newViewName, setNewViewName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [result, setResult] = useState<ProcurementImportApplyResult | null>(null)

  useEffect(() => {
    if (!open) return
    const views = savedViews.data ?? []
    const preferred = activeViewId && views.some((view) => view.id === activeViewId)
      ? activeViewId
      : views[0]?.id ?? null
    setTargetSavedViewId(preferred)
    setTargetMode(views.length > 0 ? 'EXISTING_VIEW' : 'NEW_VIEW')
  }, [activeViewId, open, savedViews.data])

  const selectedExistingView = useProcurementSavedView(
    targetMode === 'EXISTING_VIEW' ? targetSavedViewId : null,
  )

  const matchedItemIds = useMemo(
    () => preview
      ? countUnique(preview.items.filter((item) => item.status === 'MATCHED').map((item) => item.itemId))
      : [],
    [preview],
  )
  const matchedSupplierIds = useMemo(
    () => preview
      ? countUnique(preview.suppliers.filter((supplier) => supplier.status === 'MATCHED').map((supplier) => supplier.supplierId))
      : [],
    [preview],
  )

  const viewImpact = useMemo(() => {
    if (!preview) return null
    if (targetMode === 'NEW_VIEW') {
      return {
        addedItems: matchedItemIds.length,
        alreadyItems: 0,
        addedSuppliers: matchedSupplierIds.length,
        alreadySuppliers: 0,
      }
    }
    if (!selectedExistingView.data) return null

    const existingItems = new Set(selectedExistingView.data.config.itemIds)
    const existingSuppliers = new Set(selectedExistingView.data.config.supplierIds)
    const addedItems = matchedItemIds.filter((id) => !existingItems.has(id)).length
    const addedSuppliers = matchedSupplierIds.filter((id) => !existingSuppliers.has(id)).length
    return {
      addedItems,
      alreadyItems: matchedItemIds.length - addedItems,
      addedSuppliers,
      alreadySuppliers: matchedSupplierIds.length - addedSuppliers,
    }
  }, [matchedItemIds, matchedSupplierIds, preview, selectedExistingView.data, targetMode])

  const unmatchedItems = useMemo(
    () => preview?.items.filter((item) => item.status !== 'MATCHED' || item.duplicateInFile) ?? [],
    [preview],
  )
  const unmatchedSuppliers = useMemo(
    () => preview?.suppliers.filter((supplier) => supplier.status !== 'MATCHED' || supplier.duplicateInFile) ?? [],
    [preview],
  )
  const quoteCreateCount = preview
    ? preview.summary.newQuotes + preview.summary.repeatedPriceQuotes + preview.summary.changedPriceQuotes
    : 0

  function resetDialog() {
    setStep(1)
    setFile(null)
    setPreview(null)
    setSheetName('')
    setNewViewName('')
    setLocalError(null)
    setResult(null)
    previewMutation.reset()
    applyMutation.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && (previewMutation.isPending || applyMutation.isPending)) return
    onOpenChange(nextOpen)
    if (!nextOpen) resetDialog()
  }

  async function previewFile(nextFile: File, requestedSheet?: string) {
    setLocalError(null)
    try {
      const data = await previewMutation.mutateAsync({
        file: nextFile,
        ...(requestedSheet ? { sheetName: requestedSheet } : {}),
      })
      setPreview(data)
      setSheetName(data.selectedSheet)
    } catch (error) {
      setPreview(null)
      setLocalError(errorMessage(error, t('items.importExcel.errors.preview')))
    }
  }

  async function handleFile(nextFile: File) {
    const name = nextFile.name.toLowerCase()
    if (!name.endsWith('.xlsx')) {
      setLocalError(t('items.importExcel.errors.fileType'))
      return
    }
    if (nextFile.size > MAX_IMPORT_BYTES) {
      setLocalError(t('items.importExcel.errors.fileSize'))
      return
    }

    setFile(nextFile)
    await previewFile(nextFile)
  }

  async function changeSheet(value: string) {
    if (!file) return
    setSheetName(value)
    await previewFile(file, value)
  }

  async function applyImport() {
    if (!file || !preview) return
    if (targetMode === 'EXISTING_VIEW' && targetSavedViewId === null) {
      setLocalError(t('items.importExcel.errors.viewRequired'))
      return
    }
    if (targetMode === 'NEW_VIEW' && !newViewName.trim()) {
      setLocalError(t('items.importExcel.errors.viewNameRequired'))
      return
    }

    setLocalError(null)
    try {
      const applied = await applyMutation.mutateAsync({
        file,
        sheetName: preview.selectedSheet,
        targetMode,
        ...(targetSavedViewId !== null && targetMode === 'EXISTING_VIEW'
          ? { targetSavedViewId }
          : {}),
        ...(targetMode === 'NEW_VIEW' ? { newViewName: newViewName.trim() } : {}),
      })
      setResult(applied)
      setStep(4)
      onApplied(applied.savedViewId)
      toast.success(t('items.importExcel.successToast', { view: applied.savedViewName }))
    } catch (error) {
      setLocalError(errorMessage(error, t('items.importExcel.errors.apply')))
    }
  }

  const number = (value: number) => new Intl.NumberFormat(locale).format(value)
  const money = (value: number | null) => value === null
    ? '—'
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(value)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="w-[min(76rem,calc(100vw-2rem))] max-w-none p-0"
      >
        <div className="border-b px-6 py-5 pe-16">
          <DialogTitle className="text-xl font-semibold">{t('items.importExcel.title')}</DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            {t('items.importExcel.description')}
          </DialogDescription>
          {step < 4 ? (
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-medium">
              {[1, 2, 3].map((value) => (
                <div
                  key={value}
                  className={value <= step ? 'text-primary' : 'text-muted-foreground'}
                >
                  <div className={value <= step ? 'bg-primary h-1 rounded-full' : 'bg-muted h-1 rounded-full'} />
                  <span className="mt-1.5 block">
                    {t(`items.importExcel.steps.${value}`)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-[28rem] p-6">
          {localError ? (
            <div className="border-destructive/25 bg-destructive/5 text-destructive mb-5 flex items-start gap-3 rounded-lg border p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{localError}</span>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0]
                  if (nextFile) void handleFile(nextFile)
                }}
              />

              <button
                type="button"
                className="border-primary/20 bg-primary/[0.025] hover:bg-primary/[0.05] flex min-h-52 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center"
                onClick={() => fileInputRef.current?.click()}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? (
                  <Loader2 className="text-primary size-9" />
                ) : (
                  <span className="bg-primary/10 text-primary grid size-14 place-items-center rounded-2xl">
                    <Upload className="size-7" />
                  </span>
                )}
                <span className="mt-4 font-semibold">
                  {previewMutation.isPending
                    ? t('items.importExcel.analyzing')
                    : t('items.importExcel.chooseFile')}
                </span>
                <span className="text-muted-foreground mt-1 text-sm">
                  {t('items.importExcel.fileHint')}
                </span>
              </button>

              {file && preview ? (
                <div className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[1fr_22rem]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="bg-success/10 text-success grid size-11 shrink-0 place-items-center rounded-xl">
                      <FileSpreadsheet className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{file.name}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {t('items.importExcel.detectedSummary', {
                          items: preview.summary.uniqueItemCodes,
                          suppliers: preview.summary.supplierColumns,
                          quotes: preview.summary.quotePriceCells,
                        })}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium">{t('items.importExcel.sheet')}</label>
                    <Select value={sheetName} onValueChange={(value) => { void changeSheet(value) }}>
                      <SelectTrigger disabled={previewMutation.isPending}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {preview.availableSheets.map((sheet) => (
                          <SelectItem key={sheet.name} value={sheet.name} disabled={!sheet.importable}>
                            {sheet.name} · {sheet.dataRows} {t('items.importExcel.rows')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 && preview ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  label={t('items.importExcel.summary.itemsMatched')}
                  value={number(preview.summary.matchedItems)}
                  hint={preview.summary.unmatchedItems || preview.summary.ambiguousItems
                    ? t('items.importExcel.summary.itemsProblems', { count: preview.summary.unmatchedItems + preview.summary.ambiguousItems })
                    : t('items.importExcel.summary.allMatched')}
                  good={preview.summary.unmatchedItems + preview.summary.ambiguousItems === 0}
                />
                <SummaryCard
                  label={t('items.importExcel.summary.suppliersMatched')}
                  value={number(preview.summary.matchedSuppliers)}
                  hint={preview.summary.unmatchedSuppliers || preview.summary.ambiguousSuppliers
                    ? t('items.importExcel.summary.supplierProblems', { count: preview.summary.unmatchedSuppliers + preview.summary.ambiguousSuppliers })
                    : t('items.importExcel.summary.allMatched')}
                  good={preview.summary.unmatchedSuppliers + preview.summary.ambiguousSuppliers === 0}
                />
                <SummaryCard
                  label={t('items.importExcel.summary.quotesToCreate')}
                  value={number(quoteCreateCount)}
                  hint={t('items.importExcel.summary.changedBreakdown', {
                    changed: preview.summary.changedPriceQuotes,
                    repeated: preview.summary.repeatedPriceQuotes,
                  })}
                  good
                />
                <SummaryCard
                  label={t('items.importExcel.summary.skipped')}
                  value={number(preview.summary.duplicateTodayQuotes + preview.summary.invalidQuotes)}
                  hint={t('items.importExcel.summary.skippedBreakdown', {
                    duplicate: preview.summary.duplicateTodayQuotes,
                    invalid: preview.summary.invalidQuotes,
                  })}
                  good={preview.summary.invalidQuotes === 0}
                />
              </div>

              {(unmatchedItems.length > 0 || unmatchedSuppliers.length > 0) ? (
                <div className="rounded-xl border border-amber-300/50 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                  <p className="font-semibold">{t('items.importExcel.reviewProblems')}</p>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <ProblemCodes
                      label={t('items.importExcel.problemItems')}
                      values={unmatchedItems.map((item) => `${item.code} · ${item.duplicateInFile ? t('items.importExcel.duplicateInFile') : t(`items.importExcel.matchStatus.${item.status}`)}`)}
                    />
                    <ProblemCodes
                      label={t('items.importExcel.problemSuppliers')}
                      values={unmatchedSuppliers.map((supplier) => `${supplier.code} · ${supplier.duplicateInFile ? t('items.importExcel.duplicateInFile') : t(`items.importExcel.matchStatus.${supplier.status}`)}`)}
                    />
                  </div>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-xl border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                  <div>
                    <p className="font-semibold">{t('items.importExcel.quotePreview')}</p>
                    <p className="text-muted-foreground text-xs">
                      {t('items.importExcel.quotePreviewHint', {
                        shown: Math.min(preview.quotes.length, MAX_VISIBLE_QUOTES),
                        total: preview.quotes.length,
                      })}
                    </p>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {preview.quoteDate} · SAR
                  </div>
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full min-w-[56rem] text-sm">
                    <thead className="bg-accent sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-start">{t('items.importExcel.table.row')}</th>
                        <th className="px-3 py-2 text-start">{t('items.code')}</th>
                        <th className="px-3 py-2 text-start">{t('priceQuotes.supplier')}</th>
                        <th className="px-3 py-2 text-start">{t('items.unit')}</th>
                        <th className="px-3 py-2 text-end">{t('items.importExcel.table.excelPrice')}</th>
                        <th className="px-3 py-2 text-end">{t('items.importExcel.table.existingPrice')}</th>
                        <th className="px-3 py-2 text-start">{t('priceQuotes.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.quotes.slice(0, MAX_VISIBLE_QUOTES).map((quote, index) => (
                        <tr key={`${quote.rowNumber}-${quote.supplierCode}-${index}`} className="border-t">
                          <td className="px-3 py-2 tabular-nums">{quote.rowNumber}</td>
                          <td className="px-3 py-2 font-medium">{quote.itemCode}</td>
                          <td className="px-3 py-2">{quote.supplierCode}</td>
                          <td className="px-3 py-2">{quote.matchedUnitName ?? quote.unitName ?? '—'}</td>
                          <td className="px-3 py-2 text-end tabular-nums">{money(quote.excelPrice)}</td>
                          <td className="px-3 py-2 text-end tabular-nums">
                            {money(quote.existingQuotedUnitCost)}
                            {quote.existingQuoteDate ? (
                              <span className="text-muted-foreground ms-1 text-[11px]">({quote.existingQuoteDate})</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${statusTone(quote.status)}`}>
                              {t(`items.importExcel.quoteStatus.${quote.status}`)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 && preview ? (
            <div className="space-y-5">
              <div>
                <p className="font-semibold">{t('items.importExcel.destination')}</p>
                <p className="text-muted-foreground mt-1 text-sm">{t('items.importExcel.destinationHint')}</p>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={targetMode === 'EXISTING_VIEW'}
                  disabled={(savedViews.data?.length ?? 0) === 0}
                  onClick={() => setTargetMode('EXISTING_VIEW')}
                  className={`rounded-xl border p-4 text-start disabled:opacity-50 ${
                    targetMode === 'EXISTING_VIEW' ? 'border-primary bg-primary/[0.04]' : 'hover:bg-muted/40'
                  }`}
                >
                  <p className="font-semibold">{t('items.importExcel.existingView')}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{t('items.importExcel.existingViewHint')}</p>
                </button>
                <button
                  type="button"
                  aria-pressed={targetMode === 'NEW_VIEW'}
                  onClick={() => setTargetMode('NEW_VIEW')}
                  className={`rounded-xl border p-4 text-start ${
                    targetMode === 'NEW_VIEW' ? 'border-primary bg-primary/[0.04]' : 'hover:bg-muted/40'
                  }`}
                >
                  <p className="font-semibold">{t('items.importExcel.newView')}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{t('items.importExcel.newViewHint')}</p>
                </button>
              </div>

              {targetMode === 'EXISTING_VIEW' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('savedViews.selectorLabel')}</label>
                  <Select
                    value={targetSavedViewId === null ? '' : String(targetSavedViewId)}
                    onValueChange={(value) => setTargetSavedViewId(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('items.importExcel.chooseView')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(savedViews.data ?? []).map((view) => (
                        <SelectItem key={view.id} value={String(view.id)}>
                          {view.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('savedViews.name')}</label>
                  <Input
                    value={newViewName}
                    maxLength={120}
                    onChange={(event) => setNewViewName(event.target.value)}
                    placeholder={t('items.importExcel.newViewPlaceholder')}
                  />
                </div>
              )}

              <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                  <p className="font-semibold">{t('items.importExcel.confirmation')}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {t('items.importExcel.confirmationHint')}
                  </p>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
                  <ImpactStat
                    label={t('items.importExcel.impact.newItems')}
                    value={viewImpact ? number(viewImpact.addedItems) : '—'}
                    detail={viewImpact ? t('items.importExcel.impact.already', { count: viewImpact.alreadyItems }) : t('common.loading')}
                  />
                  <ImpactStat
                    label={t('items.importExcel.impact.newSuppliers')}
                    value={viewImpact ? number(viewImpact.addedSuppliers) : '—'}
                    detail={viewImpact ? t('items.importExcel.impact.already', { count: viewImpact.alreadySuppliers }) : t('common.loading')}
                  />
                  <ImpactStat
                    label={t('items.importExcel.impact.quotes')}
                    value={number(quoteCreateCount)}
                    detail={t('items.importExcel.impact.duplicates', { count: preview.summary.duplicateTodayQuotes })}
                  />
                  <ImpactStat
                    label={t('items.importExcel.impact.invalid')}
                    value={number(preview.summary.invalidQuotes)}
                    detail={t('items.importExcel.impact.skipped')}
                  />
                </div>
                <div className="text-muted-foreground border-t px-4 py-3 text-xs">
                  {t('items.importExcel.applyRule', { date: preview.quoteDate })}
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 && result ? (
            <div className="flex min-h-[28rem] flex-col items-center justify-center text-center">
              <span className="bg-success/10 text-success grid size-16 place-items-center rounded-full">
                <CheckCircle2 className="size-8" />
              </span>
              <h3 className="mt-4 text-xl font-semibold">{t('items.importExcel.completed')}</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('items.importExcel.completedView', { view: result.savedViewName })}
              </p>
              <div className="mt-6 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
                <ImpactStat label={t('items.importExcel.result.itemsAdded')} value={number(result.addedItems)} />
                <ImpactStat label={t('items.importExcel.result.suppliersAdded')} value={number(result.addedSuppliers)} />
                <ImpactStat label={t('items.importExcel.result.quotesCreated')} value={number(result.createdQuotes)} />
                <ImpactStat label={t('items.importExcel.result.skipped')} value={number(result.duplicateQuotesSkipped + result.invalidQuotesSkipped)} />
              </div>
              <p className="text-muted-foreground mt-5 text-xs">
                {t('items.importExcel.batchReference', { id: result.importBatchId })}
              </p>
              <Button className="mt-6" onClick={() => handleOpenChange(false)}>
                {t('items.importExcel.openView')}
              </Button>
            </div>
          ) : null}
        </div>

        {step < 4 ? (
          <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
            <Button
              variant="outline"
              onClick={() => {
                if (step === 1) handleOpenChange(false)
                else setStep((step - 1) as 1 | 2)
              }}
              disabled={previewMutation.isPending || applyMutation.isPending}
            >
              {step === 1 ? t('common.cancel') : (
                <>
                  <ArrowLeft className="size-4 rtl:rotate-180" />
                  {t('items.importExcel.back')}
                </>
              )}
            </Button>

            {step === 1 ? (
              <Button disabled={!preview || previewMutation.isPending} onClick={() => setStep(2)}>
                {t('items.importExcel.review')}
                <ArrowRight className="size-4 rtl:rotate-180" />
              </Button>
            ) : step === 2 ? (
              <Button onClick={() => setStep(3)}>
                {t('items.importExcel.chooseDestination')}
                <ArrowRight className="size-4 rtl:rotate-180" />
              </Button>
            ) : (
              <Button
                disabled={
                  applyMutation.isPending
                  || (targetMode === 'EXISTING_VIEW' && (targetSavedViewId === null || selectedExistingView.isPending))
                  || (targetMode === 'NEW_VIEW' && !newViewName.trim())
                }
                onClick={() => { void applyImport() }}
              >
                {applyMutation.isPending ? <Loader2 className="size-4" /> : null}
                {applyMutation.isPending ? t('items.importExcel.applying') : t('items.importExcel.apply')}
              </Button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  good,
}: {
  label: string
  value: string
  hint: string
  good: boolean
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        {good
          ? <CheckCircle2 className="text-success size-4" />
          : <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
    </div>
  )
}

function ImpactStat({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-lg bg-muted/35 p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {detail ? <p className="text-muted-foreground mt-1 text-[11px]">{detail}</p> : null}
    </div>
  )
}

function ProblemCodes({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{label}</p>
      {values.length === 0 ? (
        <p className="mt-2 text-sm">—</p>
      ) : (
        <ul className="mt-2 max-h-28 space-y-1 overflow-auto text-sm">
          {values.slice(0, 50).map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}
          {values.length > 50 ? <li className="text-muted-foreground">+{values.length - 50}</li> : null}
        </ul>
      )}
    </div>
  )
}
