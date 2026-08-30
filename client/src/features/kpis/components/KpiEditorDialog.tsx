import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { IconPicker } from '@/components/shared/IconPicker'
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
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-error'
import { cn } from '@/lib/cn'
import { useCreateKpi, useUpdateKpi } from '../hooks/use-kpis'
import {
  KPI_COLORS,
  KPI_DEADLINE_DIRECTIONS,
  KPI_DEADLINE_SOURCES,
  KPI_DIRECTIONS,
  KPI_ICON_KEYS,
  KPI_METHODS,
  KPI_PERIODS,
} from '../types/kpi.types'
import type { KpiMethod, PersonalKpi, SaveKpiInput } from '../types/kpi.types'
import { kpiIcons } from './kpi-icons'

const blank: SaveKpiInput = {
  name: '',
  description: null,
  iconKey: 'gauge',
  color: '#0F766E',
  calculationMethod: 'TASK_COMPLETION_RATE',
  periodType: 'MONTHLY',
  targetValue: null,
  targetDirection: null,
  deadlineSource: null,
  businessDayOffset: null,
  deadlineDirection: null,
  referenceDateLabel: null,
  numeratorLabel: null,
  denominatorLabel: null,
  valueLabel: null,
}
function fromKpi(kpi?: PersonalKpi | null): SaveKpiInput {
  return kpi
    ? {
        name: kpi.name,
        description: kpi.description,
        iconKey: kpi.iconKey,
        color: kpi.color,
        calculationMethod: kpi.calculationMethod,
        periodType: kpi.periodType,
        targetValue: kpi.targetValue,
        targetDirection: kpi.targetDirection,
        deadlineSource: kpi.deadlineSource,
        businessDayOffset: kpi.businessDayOffset,
        deadlineDirection: kpi.deadlineDirection,
        referenceDateLabel: kpi.referenceDateLabel,
        numeratorLabel: kpi.numeratorLabel,
        denominatorLabel: kpi.denominatorLabel,
        valueLabel: kpi.valueLabel,
      }
    : { ...blank }
}
function normalizeMethod(values: SaveKpiInput, method: KpiMethod): SaveKpiInput {
  const deadlineSource =
    method === 'ON_TIME_RATE' ? (values.deadlineSource ?? 'REFERENCE_DATE') : null
  const usesReferenceDate = method === 'ON_TIME_RATE' && deadlineSource === 'REFERENCE_DATE'

  return {
    ...values,
    calculationMethod: method,
    deadlineSource,
    businessDayOffset: usesReferenceDate ? (values.businessDayOffset ?? 0) : null,
    deadlineDirection: usesReferenceDate ? (values.deadlineDirection ?? 'BEFORE') : null,
    referenceDateLabel: usesReferenceDate ? (values.referenceDateLabel ?? '') : null,
    numeratorLabel: method === 'MANUAL_RATIO' ? (values.numeratorLabel ?? '') : null,
    denominatorLabel: method === 'MANUAL_RATIO' ? (values.denominatorLabel ?? '') : null,
    valueLabel: method === 'MANUAL_NUMBER' ? (values.valueLabel ?? '') : null,
  }
}

function normalizeDeadlineSource(
  values: SaveKpiInput,
  deadlineSource: NonNullable<SaveKpiInput['deadlineSource']>,
): SaveKpiInput {
  const usesReferenceDate = deadlineSource === 'REFERENCE_DATE'

  return {
    ...values,
    deadlineSource,
    businessDayOffset: usesReferenceDate ? (values.businessDayOffset ?? 0) : null,
    deadlineDirection: usesReferenceDate ? (values.deadlineDirection ?? 'BEFORE') : null,
    referenceDateLabel: usesReferenceDate ? (values.referenceDateLabel ?? '') : null,
  }
}
export function KpiEditorDialog({
  kpi,
  open,
  onOpenChange,
}: {
  kpi?: PersonalKpi | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState(1)
  const [values, setValues] = useState<SaveKpiInput>(() => fromKpi(kpi))
  const [error, setError] = useState('')
  const create = useCreateKpi()
  const update = useUpdateKpi()
  const pending = create.isPending || update.isPending
  function patch<K extends keyof SaveKpiInput>(key: K, value: SaveKpiInput[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setError('')
  }
  function next() {
    if (step === 1 && !values.name.trim()) {
      setError(t('kpis.errors.nameRequired'))
      return
    }
    if (step === 2) {
      if (values.calculationMethod === 'ON_TIME_RATE' && !values.deadlineSource) {
        setError(t('kpis.errors.configuration'))
        return
      }
      if (
        values.calculationMethod === 'ON_TIME_RATE' &&
        values.deadlineSource === 'REFERENCE_DATE' &&
        (!values.referenceDateLabel?.trim() ||
          values.businessDayOffset === null ||
          values.deadlineDirection === null)
      ) {
        setError(t('kpis.errors.configuration'))
        return
      }
      if (
        values.calculationMethod === 'MANUAL_RATIO' &&
        (!values.numeratorLabel?.trim() || !values.denominatorLabel?.trim())
      ) {
        setError(t('kpis.errors.configuration'))
        return
      }
      if (values.calculationMethod === 'MANUAL_NUMBER' && !values.valueLabel?.trim()) {
        setError(t('kpis.errors.configuration'))
        return
      }
    }
    setStep((current) => Math.min(3, current + 1))
  }
  function submit() {
    const action = kpi ? update : create
    const input = kpi ? { kpiId: kpi.id, values } : values
    action.mutate(input as never, {
      onSuccess: () => {
        toast.success(t(kpi ? 'kpis.updated' : 'kpis.created'))
        onOpenChange(false)
      },
      onError: (reason) =>
        toast.error(
          reason instanceof ApiClientError && reason.code === 'KPI_NAME_ALREADY_EXISTS'
            ? t('kpis.errors.duplicateName')
            : t('kpis.errors.save'),
        ),
    })
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        variant="modal"
        closeLabel={t('common.close')}
        className="w-[min(44rem,calc(100vw-2rem))]"
      >
        <DialogTitle>{t(kpi ? 'kpis.editTitle' : 'kpis.createTitle')}</DialogTitle>
        <DialogDescription>{t('kpis.formDescription')}</DialogDescription>
        <div className="mt-4 flex gap-2">
          {[1, 2, 3].map((number) => (
            <span
              key={number}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                number <= step ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>
        <div className="mt-6 min-h-80">
          {step === 1 ? (
            <div className="space-y-5">
              <Field label={t('kpis.name')}>
                <Input
                  autoFocus
                  value={values.name}
                  maxLength={1000}
                  onChange={(e) => patch('name', e.target.value)}
                />
              </Field>
              <Field label={t('kpis.descriptionLabel')}>
                <Textarea
                  value={values.description ?? ''}
                  maxLength={1500}
                  onChange={(e) => patch('description', e.target.value || null)}
                />
              </Field>
              <Field label={t('kpis.icon')}>
                <IconPicker
                  value={values.iconKey}
                  options={KPI_ICON_KEYS}
                  icons={kpiIcons}
                  getLabel={(iconKey) => t(`common.icons.${iconKey}`)}
                  searchLabel={t('common.iconPicker.searchLabel')}
                  searchPlaceholder={t('common.iconPicker.searchPlaceholder')}
                  clearSearchLabel={t('common.iconPicker.clearSearch')}
                  noResultsText={t('common.iconPicker.noResults')}
                  selectedLabel={t('common.iconPicker.selected')}
                  accentColor={values.color}
                  onChange={(iconKey) => patch('iconKey', iconKey)}
                />
              </Field>
              <Field label={t('kpis.color')}>
                <div className="flex flex-wrap gap-3">
                  {KPI_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      className={cn(
                        'size-8 rounded-full border-2 border-white',
                        values.color === color && 'ring-ring ring-2 ring-offset-2',
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => patch('color', color)}
                    />
                  ))}
                </div>
              </Field>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="space-y-5">
              <Field label={t('kpis.method')}>
                <AppSelect
                  value={values.calculationMethod}
                  options={KPI_METHODS}
                  label={(value) => t(`kpis.methods.${value}`)}
                  onChange={(value) =>
                    setValues((current) => normalizeMethod(current, value as KpiMethod))
                  }
                />
              </Field>
              {values.calculationMethod === 'ON_TIME_RATE' ? (
                <>
                  <Field label={t('kpis.deadlineSource')}>
                    <AppSelect
                      value={values.deadlineSource ?? 'REFERENCE_DATE'}
                      options={KPI_DEADLINE_SOURCES}
                      label={(value) => t(`kpis.deadlineSources.${value}`)}
                      onChange={(value) =>
                        setValues((current) =>
                          normalizeDeadlineSource(
                            current,
                            value as NonNullable<SaveKpiInput['deadlineSource']>,
                          ),
                        )
                      }
                    />
                  </Field>

                  {values.deadlineSource === 'REFERENCE_DATE' ? (
                    <>
                      <Field label={t('kpis.businessDays')}>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={values.businessDayOffset ?? 0}
                          onChange={(e) => patch('businessDayOffset', Number(e.target.value))}
                        />
                      </Field>
                      <Field label={t('kpis.deadlineDirection')}>
                        <AppSelect
                          value={values.deadlineDirection ?? 'BEFORE'}
                          options={KPI_DEADLINE_DIRECTIONS}
                          label={(value) => t(`kpis.deadlines.${value}`)}
                          onChange={(value) =>
                            patch('deadlineDirection', value as SaveKpiInput['deadlineDirection'])
                          }
                        />
                      </Field>
                      <Field label={t('kpis.referenceLabel')}>
                        <Input
                          value={values.referenceDateLabel ?? ''}
                          onChange={(e) => patch('referenceDateLabel', e.target.value)}
                        />
                      </Field>
                    </>
                  ) : (
                    <div className="bg-muted/60 rounded-xl p-4 text-sm">
                      <p className="font-medium">{t('kpis.taskDueDateModeTitle')}</p>
                      <p className="text-muted-foreground mt-1">
                        {t('kpis.taskDueDateModeDescription')}
                      </p>
                    </div>
                  )}
                </>
              ) : null}
              {values.calculationMethod === 'MANUAL_RATIO' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('kpis.numeratorLabel')}>
                    <Input
                      value={values.numeratorLabel ?? ''}
                      onChange={(e) => patch('numeratorLabel', e.target.value)}
                    />
                  </Field>
                  <Field label={t('kpis.denominatorLabel')}>
                    <Input
                      value={values.denominatorLabel ?? ''}
                      onChange={(e) => patch('denominatorLabel', e.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
              {values.calculationMethod === 'MANUAL_NUMBER' ? (
                <Field label={t('kpis.valueLabel')}>
                  <Input
                    value={values.valueLabel ?? ''}
                    onChange={(e) => patch('valueLabel', e.target.value)}
                  />
                </Field>
              ) : null}
              <div className="bg-muted/60 rounded-xl p-4">
                <p className="font-medium">{t('kpis.previewTitle')}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t(`kpis.previews.${values.calculationMethod}`)}
                </p>
              </div>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="space-y-5">
              <Field label={t('kpis.period')}>
                <AppSelect
                  value={values.periodType}
                  options={KPI_PERIODS}
                  label={(value) => t(`kpis.periods.${value}`)}
                  onChange={(value) => patch('periodType', value as SaveKpiInput['periodType'])}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('kpis.target')}>
                  <Input
                    type="number"
                    min={0}
                    value={values.targetValue ?? ''}
                    placeholder={t('kpis.optional')}
                    onChange={(e) => {
                      const targetValue = e.target.value === '' ? null : Number(e.target.value)
                      setValues((current) => ({
                        ...current,
                        targetValue,
                        targetDirection:
                          targetValue === null
                            ? null
                            : (current.targetDirection ?? 'HIGHER_IS_BETTER'),
                      }))
                    }}
                  />
                </Field>
                {values.targetValue !== null ? (
                  <Field label={t('kpis.targetDirection')}>
                    <AppSelect
                      value={values.targetDirection ?? 'HIGHER_IS_BETTER'}
                      options={KPI_DIRECTIONS}
                      label={(value) => t(`kpis.directions.${value}`)}
                      onChange={(value) =>
                        patch('targetDirection', value as SaveKpiInput['targetDirection'])
                      }
                    />
                  </Field>
                ) : null}
              </div>
              <div className="border-primary/20 bg-primary/5 rounded-xl border p-5">
                <p className="font-semibold">{values.name}</p>
                <p className="text-muted-foreground mt-2 text-sm">
                  {t(`kpis.previews.${values.calculationMethod}`)}
                </p>
                <p className="mt-3 text-sm">
                  {t('kpis.reviewTarget', { target: values.targetValue ?? t('kpis.noTarget') })}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        {error ? <p className="text-destructive mt-3 text-sm">{error}</p> : null}
        <div className="mt-6 flex justify-between">
          <Button
            variant="outline"
            onClick={() => (step === 1 ? onOpenChange(false) : setStep((current) => current - 1))}
          >
            {step === 1 ? t('common.cancel') : t('kpis.back')}
          </Button>
          {step < 3 ? (
            <Button onClick={next}>{t('kpis.next')}</Button>
          ) : (
            <Button disabled={pending} onClick={submit}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
function AppSelect({
  value,
  options,
  label,
  onChange,
}: {
  value: string
  options: readonly string[]
  label: (value: string) => string
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue>{label(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {label(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
