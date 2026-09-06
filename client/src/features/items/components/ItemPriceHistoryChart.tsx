import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ItemPriceHistory, ProcurementPricePoint } from '../types/item.types'
import { formatDateOnly, formatProcurementNumber } from './item-price-format'

const WIDTH = 960
const HEIGHT = 320
const PADDING = { top: 24, right: 24, bottom: 48, left: 72 }

const seriesStyles = [
  { className: 'text-primary', dash: undefined },
  { className: 'text-foreground', dash: '10 6' },
  { className: 'text-muted-foreground', dash: '4 5' },
  { className: 'text-accent-foreground', dash: '14 5 3 5' },
] as const

function dateValue(point: ProcurementPricePoint): number {
  const value = Date.parse(`${point.transactionDate}T00:00:00`)
  return Number.isFinite(value) ? value : 0
}

export function ItemPriceHistoryChart({ history }: { history: ItemPriceHistory }) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const model = useMemo(() => {
    if (history.points.length === 0) return null

    const costs = history.points.map((point) => point.unitCost)
    const dates = history.points.map(dateValue)
    const rawMin = Math.min(...costs)
    const rawMax = Math.max(...costs)
    const padding = rawMin === rawMax ? Math.max(Math.abs(rawMin) * 0.05, 1) : (rawMax - rawMin) * 0.08
    const minCost = rawMin - padding
    const maxCost = rawMax + padding
    const minDate = Math.min(...dates)
    const maxDate = Math.max(...dates)
    const plotWidth = WIDTH - PADDING.left - PADDING.right
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom

    const x = (point: ProcurementPricePoint, index: number) => {
      if (maxDate === minDate) {
        const denominator = Math.max(1, history.points.length - 1)
        return PADDING.left + (index / denominator) * plotWidth
      }
      return PADDING.left + ((dateValue(point) - minDate) / (maxDate - minDate)) * plotWidth
    }
    const y = (cost: number) => PADDING.top + ((maxCost - cost) / (maxCost - minCost)) * plotHeight

    const indexed = history.points.map((point, index) => ({ point, index }))
    const bySupplier = new Map<number, { name: string; points: { point: ProcurementPricePoint; index: number }[] }>()
    for (const entry of indexed) {
      const current = bySupplier.get(entry.point.supplierId)
      if (current) current.points.push(entry)
      else bySupplier.set(entry.point.supplierId, { name: entry.point.supplierName, points: [entry] })
    }

    return {
      minCost,
      maxCost,
      minDate,
      maxDate,
      x,
      y,
      series: [...bySupplier.entries()],
    }
  }, [history.points])

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t('items.analytics.priceHistory')}</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">{t('items.analytics.priceHistoryDescription')}</p>
          </div>
          {history.scope ? (
            <span className="bg-muted rounded-full px-3 py-1 text-xs font-medium">
              {[history.scope.currencyCode, history.scope.unitName].filter(Boolean).join(' / ') || t('items.analytics.defaultScope')}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {!model ? (
          <p className="text-muted-foreground py-12 text-center text-sm">{t('items.analytics.noHistory')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="min-w-[46rem] w-full"
                role="img"
                aria-label={t('items.analytics.priceHistoryAria')}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = PADDING.top + ratio * (HEIGHT - PADDING.top - PADDING.bottom)
                  const cost = model.maxCost - ratio * (model.maxCost - model.minCost)
                  return (
                    <g key={ratio}>
                      <line
                        x1={PADDING.left}
                        x2={WIDTH - PADDING.right}
                        y1={y}
                        y2={y}
                        className="text-border"
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                      <text
                        x={PADDING.left - 10}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-muted-foreground text-[11px]"
                      >
                        {formatProcurementNumber(cost, locale, 4)}
                      </text>
                    </g>
                  )
                })}

                <text
                  x={PADDING.left}
                  y={HEIGHT - 16}
                  textAnchor="start"
                  className="fill-muted-foreground text-[11px]"
                >
                  {formatDateOnly(new Date(model.minDate).toISOString().slice(0, 10), locale)}
                </text>
                <text
                  x={WIDTH - PADDING.right}
                  y={HEIGHT - 16}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px]"
                >
                  {formatDateOnly(new Date(model.maxDate).toISOString().slice(0, 10), locale)}
                </text>

                {model.series.map(([supplierId, supplier], seriesIndex) => {
                  const style = seriesStyles[seriesIndex % seriesStyles.length]
                  const coordinates = supplier.points
                    .map(({ point, index }) => `${model.x(point, index)},${model.y(point.unitCost)}`)
                    .join(' ')
                  return (
                    <g key={supplierId} className={style.className}>
                      {supplier.points.length > 1 ? (
                        <polyline
                          points={coordinates}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={style.dash}
                        />
                      ) : null}
                      {supplier.points.map(({ point, index }, pointIndex) => (
                        <circle
                          key={`${point.transactionDate}-${point.invoiceNo ?? 'no-invoice'}-${pointIndex}`}
                          cx={model.x(point, index)}
                          cy={model.y(point.unitCost)}
                          r="4"
                          fill="currentColor"
                        >
                          <title>{`${supplier.name} · ${point.transactionDate} · ${formatProcurementNumber(point.unitCost, locale, 4)}`}</title>
                        </circle>
                      ))}
                    </g>
                  )
                })}
              </svg>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {model.series.map(([supplierId, supplier], index) => {
                const style = seriesStyles[index % seriesStyles.length]
                return (
                  <span key={supplierId} className="inline-flex items-center gap-2 text-xs">
                    <svg width="28" height="8" aria-hidden="true" className={style.className}>
                      <line x1="0" x2="28" y1="4" y2="4" stroke="currentColor" strokeWidth="2.5" strokeDasharray={style.dash} />
                    </svg>
                    {supplier.name}
                  </span>
                )
              })}
            </div>

            {history.truncated ? (
              <p className="text-warning-foreground mt-3 text-xs">
                {t('items.analytics.historyTruncated', { shown: history.points.length, total: history.total })}
              </p>
            ) : (
              <p className="text-muted-foreground mt-3 text-xs">
                {t('items.analytics.historyCount', { count: history.total })}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
