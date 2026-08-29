import { ChevronLeft, ChevronRight, Lock, Save, Target } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TaskList } from '@/features/tasks/components/TaskList'
import type { KpiInstance } from '@/features/work-cycles/types/work-cycle.types'

import { useKpiSummary, useSaveKpiMeasurement } from '../hooks/use-kpis'
import type { KpiPeriodSummary, PersonalKpi } from '../types/kpi.types'

function dateOnly(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function periodBounds(anchor: Date, type: PersonalKpi['periodType']) {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const startMonth =
    type === 'YEARLY' ? 0 : type === 'QUARTERLY' ? Math.floor(month / 3) * 3 : month
  const endMonth = type === 'YEARLY' ? 11 : type === 'QUARTERLY' ? startMonth + 2 : startMonth
  return {
    start: dateOnly(new Date(year, startMonth, 1)),
    end: dateOnly(new Date(year, endMonth + 1, 0)),
  }
}

function movePeriod(anchor: Date, type: PersonalKpi['periodType'], offset: -1 | 1) {
  const months = type === 'MONTHLY' ? 1 : type === 'QUARTERLY' ? 3 : 12
  return new Date(anchor.getFullYear(), anchor.getMonth() + months * offset, 1)
}

function metric(value: number | null, unit: PersonalKpi['measurementUnit']) {
  if (value === null) return '—'
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)
  return unit === 'PERCENT' ? `${formatted}%` : formatted
}

function MeasurementForm({
  instance,
  summary,
  periodStart,
  periodEnd,
}: {
  instance: KpiInstance
  summary: KpiPeriodSummary
  periodStart: string
  periodEnd: string
}) {
  const { t } = useTranslation()
  const save = useSaveKpiMeasurement()
  const [numerator, setNumerator] = useState(summary.manualNumerator?.toString() ?? '')
  const [denominator, setDenominator] = useState(summary.manualDenominator?.toString() ?? '')
  const [value, setValue] = useState(summary.manualValue?.toString() ?? '')
  const isRatio = instance.calculationMethod === 'MANUAL_RATIO'
  const readOnly = Boolean(instance.cycleClosedAtUtc)

  function numberOrNull(input: string) {
    return input.trim() === '' ? null : Number(input)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('kpis.measurement.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('kpis.measurement.description')}</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {isRatio ? (
          <>
            <label className="space-y-1.5 text-sm font-medium">
              <span>{instance.numeratorLabel ?? t('kpis.measurement.achieved')}</span>
              <Input
                type="number"
                min="0"
                step="any"
                value={numerator}
                disabled={readOnly}
                onChange={(event) => setNumerator(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>{instance.denominatorLabel ?? t('kpis.measurement.total')}</span>
              <Input
                type="number"
                min="0.0001"
                step="any"
                value={denominator}
                disabled={readOnly}
                onChange={(event) => setDenominator(event.target.value)}
              />
            </label>
          </>
        ) : (
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            <span>{instance.valueLabel ?? t('kpis.measurement.value')}</span>
            <Input
              type="number"
              min="0"
              step="any"
              value={value}
              disabled={readOnly}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        )}
        <div className="flex justify-end sm:col-span-2">
          <Button
            disabled={
              readOnly || save.isPending || (isRatio ? !numerator || !denominator : !value)
            }
            onClick={() =>
              save.mutate(
                {
                  kpiInstanceId: instance.id,
                  periodStart,
                  periodEnd,
                  numeratorValue: isRatio ? numberOrNull(numerator) : null,
                  denominatorValue: isRatio ? numberOrNull(denominator) : null,
                  manualValue: isRatio ? null : numberOrNull(value),
                },
                {
                  onSuccess: () => toast.success(t('kpis.measurement.saved')),
                  onError: () => toast.error(t('kpis.measurement.saveError')),
                },
              )
            }
          >
            {readOnly ? <Lock className="size-4" /> : <Save className="size-4" />}
            {t('common.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function KpiWorkspace({ instance }: { instance: KpiInstance }) {
  const { i18n, t } = useTranslation()
  const [anchor, setAnchor] = useState(() => new Date())
  const period = periodBounds(anchor, instance.periodType)
  const summary = useKpiSummary(instance.id, period.start, period.end)
  const BackIcon = i18n.dir() === 'rtl' ? ChevronRight : ChevronLeft
  const NextIcon = i18n.dir() === 'rtl' ? ChevronLeft : ChevronRight
  const periodLabel = `${new Date(`${period.start}T00:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(`${period.end}T00:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-3 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs">{t('kpis.method')}</p>
            <p className="mt-1 font-medium">{t(`kpis.methods.${instance.calculationMethod}`)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t('kpis.period')}</p>
            <p className="mt-1 font-medium">{t(`kpis.periods.${instance.periodType}`)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t('kpis.target')}</p>
            <p className="mt-1 font-medium">{metric(instance.targetValue, instance.measurementUnit)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t('workCycles.snapshotSource')}</p>
            <p className="mt-1 font-medium">#{instance.templateId}</p>
          </div>
        </CardContent>
      </Card>

      <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('kpis.previousPeriod')}
          onClick={() => setAnchor((value) => movePeriod(value, instance.periodType, -1))}
        >
          <BackIcon className="size-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold">{periodLabel}</p>
          <p className="text-muted-foreground text-xs">{t(`kpis.periods.${instance.periodType}`)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('kpis.nextPeriod')}
          onClick={() => setAnchor((value) => movePeriod(value, instance.periodType, 1))}
        >
          <NextIcon className="size-4" />
        </Button>
      </div>

      {summary.isError ? (
        <Card>
          <CardContent className="text-destructive py-6 text-center">
            {t('kpis.summaryError')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              t('kpis.actual'),
              summary.data ? metric(summary.data.actualValue, instance.measurementUnit) : '—',
            ],
            [t('kpis.target'), metric(instance.targetValue, instance.measurementUnit)],
            [
              t('kpis.targetAchievement'),
              summary.data ? metric(summary.data.targetAchievement, 'PERCENT') : '—',
            ],
            [t('kpis.result'), summary.data ? t(`kpis.results.${summary.data.status}`) : '—'],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent className="py-5">
                <p className="text-muted-foreground text-sm">{label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {summary.data &&
      (instance.calculationMethod === 'MANUAL_RATIO' ||
        instance.calculationMethod === 'MANUAL_NUMBER') ? (
        <MeasurementForm
          key={`${period.start}-${summary.data.manualNumerator}-${summary.data.manualDenominator}-${summary.data.manualValue}`}
          instance={instance}
          summary={summary.data}
          periodStart={period.start}
          periodEnd={period.end}
        />
      ) : null}

      {instance.taskPolicy.allowsTasks ? (
        <section className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Target className="text-primary size-5" />
              {t('kpis.periodTasks')}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">{t('kpis.periodTasksDescription')}</p>
          </div>
          <TaskList instance={instance} />
        </section>
      ) : null}
    </div>
  )
}
