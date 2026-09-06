import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTheme } from '@/hooks/use-theme'
import type { ItemPriceHistory, ProcurementPricePoint } from '../types/item.types'
import { formatDateOnly, formatProcurementNumber, formatUnitCost } from './item-price-format'

const WIDTH = 1120
const HEIGHT = 420
const PADDING = { top: 28, right: 210, bottom: 62, left: 88 }
const LABEL_X = WIDTH - PADDING.right + 22
const LABEL_GAP = 42

type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'pentagon'

interface IndexedPoint {
  point: ProcurementPricePoint
  sourceIndex: number
  key: string
}

interface SupplierSeries {
  supplierId: number
  name: string
  code: string | null
  points: IndexedPoint[]
}

interface PositionedPoint extends IndexedPoint {
  x: number
  y: number
  supplierId: number
  supplierName: string
  supplierCode: string | null
  seriesIndex: number
}

interface ActivePoint extends PositionedPoint {
  color: string
  marker: MarkerShape
}

const LIGHT_SERIES_COLORS = [
  '#2563eb',
  '#c2410c',
  '#0f766e',
  '#7c3aed',
  '#be123c',
  '#0369a1',
  '#4d7c0f',
  '#a21caf',
] as const

const DARK_SERIES_COLORS = [
  '#60a5fa',
  '#fb923c',
  '#2dd4bf',
  '#c084fc',
  '#fb7185',
  '#38bdf8',
  '#a3e635',
  '#e879f9',
] as const

const SERIES_DASHES = [
  undefined,
  '10 5',
  '3 4',
  '12 4 2 4',
  '2 6',
  '14 5',
  '8 3 2 3',
  '1 5',
] as const

const MARKERS: MarkerShape[] = ['circle', 'square', 'triangle', 'diamond', 'pentagon']

function dateValue(point: ProcurementPricePoint): number {
  const value = Date.parse(`${point.transactionDate}T00:00:00`)
  return Number.isFinite(value) ? value : 0
}

function pointKey(point: ProcurementPricePoint, sourceIndex: number): string {
  return [
    point.supplierId,
    point.transactionDate,
    point.invoiceNo ?? '',
    point.orderId ?? '',
    sourceIndex,
  ].join(':')
}

function niceNumber(value: number, round: boolean): number {
  if (!Number.isFinite(value) || value <= 0) return 1

  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent
  let niceFraction: number

  if (round) {
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 3) niceFraction = 2
    else if (fraction < 7) niceFraction = 5
    else niceFraction = 10
  } else if (fraction <= 1) niceFraction = 1
  else if (fraction <= 2) niceFraction = 2
  else if (fraction <= 5) niceFraction = 5
  else niceFraction = 10

  return niceFraction * 10 ** exponent
}

function makePriceAxis(costs: number[]) {
  const rawMin = Math.min(...costs)
  const rawMax = Math.max(...costs)

  if (rawMin === rawMax) {
    const padding = Math.max(Math.abs(rawMin) * 0.1, 1)
    const paddedMin = rawMin >= 0 ? Math.max(0, rawMin - padding) : rawMin - padding
    const paddedMax = rawMax + padding
    const step = niceNumber((paddedMax - paddedMin) / 4, true)
    const min =
      rawMin >= 0
        ? Math.max(0, Math.floor(paddedMin / step) * step)
        : Math.floor(paddedMin / step) * step
    const max = Math.max(min + step, Math.ceil(paddedMax / step) * step)
    return { min, max, step }
  }

  const range = rawMax - rawMin
  const paddedMin = rawMin >= 0 ? Math.max(0, rawMin - range * 0.1) : rawMin - range * 0.1
  const paddedMax = rawMax + range * 0.1
  const step = niceNumber((paddedMax - paddedMin) / 4, true)
  const min =
    rawMin >= 0 && paddedMin <= step
      ? 0
      : Math.floor(paddedMin / step) * step
  const max = Math.max(min + step, Math.ceil(paddedMax / step) * step)

  return { min, max, step }
}

function priceTicks(min: number, max: number, step: number): number[] {
  const ticks: number[] = []
  const safeStep = step > 0 ? step : 1
  const maxTicks = 8

  for (let value = min, count = 0; value <= max + safeStep * 0.001 && count < maxTicks; value += safeStep, count += 1) {
    ticks.push(Number(value.toPrecision(12)))
  }

  if (ticks.length < 2) return [min, max]
  return ticks
}

function dateTicks(minDate: number, maxDate: number): number[] {
  if (minDate === maxDate) return [minDate]

  const span = maxDate - minDate
  const day = 24 * 60 * 60 * 1000
  const target =
    span <= 45 * day
      ? 5
      : span <= 180 * day
        ? 6
        : span <= 550 * day
          ? 7
          : 6

  return Array.from({ length: target }, (_, index) => minDate + (span * index) / (target - 1))
}

function formatAxisDate(value: number, locale: string, span: number): string {
  const day = 24 * 60 * 60 * 1000
  const date = new Date(value)

  if (span <= 90 * day) {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date)
  }

  if (span <= 730 * day) {
    return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(date)
  }

  return new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(date)
}

function shortenLabel(value: string, maxLength = 24): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1)}…`
}

function markerPolygon(shape: MarkerShape, cx: number, cy: number, size: number): string | null {
  if (shape === 'triangle') {
    return [
      `${cx},${cy - size}`,
      `${cx + size * 0.9},${cy + size * 0.75}`,
      `${cx - size * 0.9},${cy + size * 0.75}`,
    ].join(' ')
  }

  if (shape === 'diamond') {
    return [
      `${cx},${cy - size}`,
      `${cx + size},${cy}`,
      `${cx},${cy + size}`,
      `${cx - size},${cy}`,
    ].join(' ')
  }

  if (shape === 'pentagon') {
    return Array.from({ length: 5 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5
      return `${cx + Math.cos(angle) * size},${cy + Math.sin(angle) * size}`
    }).join(' ')
  }

  return null
}

function Marker({
  shape,
  cx,
  cy,
  size,
  color,
  active = false,
}: {
  shape: MarkerShape
  cx: number
  cy: number
  size: number
  color: string
  active?: boolean
}) {
  const strokeWidth = active ? 2.5 : 2
  const outline = 'var(--card)'

  return (
    <>
      {active ? (
        <circle
          cx={cx}
          cy={cy}
          r={size + 4}
          fill="none"
          stroke={color}
          strokeWidth="2"
          opacity="0.35"
        />
      ) : null}
      {shape === 'circle' ? (
        <circle cx={cx} cy={cy} r={size} fill={color} stroke={outline} strokeWidth={strokeWidth} />
      ) : shape === 'square' ? (
        <rect
          x={cx - size}
          y={cy - size}
          width={size * 2}
          height={size * 2}
          rx="1.5"
          fill={color}
          stroke={outline}
          strokeWidth={strokeWidth}
        />
      ) : (
        <polygon
          points={markerPolygon(shape, cx, cy, size) ?? ''}
          fill={color}
          stroke={outline}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      )}
    </>
  )
}

function LegendMarker({
  shape,
  color,
  dash,
}: {
  shape: MarkerShape
  color: string
  dash: string | undefined
}) {
  return (
    <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden="true" className="shrink-0">
      <line
        x1="1"
        x2="33"
        y1="8"
        y2="8"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      <Marker shape={shape} cx={17} cy={8} size={4} color={color} />
    </svg>
  )
}

function distributeLabelYs(
  entries: Array<{ supplierId: number; desiredY: number }>,
  minY: number,
  maxY: number,
): Map<number, number> {
  const sorted = [...entries].sort((left, right) => left.desiredY - right.desiredY)
  const positioned = sorted.map((entry) => ({
    ...entry,
    y: Math.max(entry.desiredY, minY),
  }))

  for (let index = 0; index < positioned.length; index += 1) {
    const previous = positioned[index - 1]
    positioned[index].y = Math.max(
      positioned[index].desiredY,
      index === 0 ? minY : previous.y + LABEL_GAP,
    )
  }

  const overflow = positioned.length ? positioned[positioned.length - 1].y - maxY : 0
  if (overflow > 0) {
    for (const entry of positioned) entry.y -= overflow

    for (let index = positioned.length - 2; index >= 0; index -= 1) {
      positioned[index].y = Math.min(positioned[index].y, positioned[index + 1].y - LABEL_GAP)
    }

    const underflow = positioned.length ? minY - positioned[0].y : 0
    if (underflow > 0) {
      for (const entry of positioned) entry.y += underflow
    }
  }

  return new Map(positioned.map((entry) => [entry.supplierId, entry.y]))
}

export function ItemPriceHistoryChart({ history }: { history: ItemPriceHistory }) {
  const { i18n, t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const locale = i18n.language
  const [focusedSupplierId, setFocusedSupplierId] = useState<number | null>(null)
  const [pointerPointKey, setPointerPointKey] = useState<string | null>(null)
  const [keyboardPointKey, setKeyboardPointKey] = useState<string | null>(null)

  const colors = resolvedTheme === 'dark' ? DARK_SERIES_COLORS : LIGHT_SERIES_COLORS

  const model = useMemo(() => {
    if (history.points.length === 0) return null

    const costs = history.points.map((point) => point.unitCost)
    const dates = history.points.map(dateValue)
    const axis = makePriceAxis(costs)
    const ticks = priceTicks(axis.min, axis.max, axis.step)
    const minDate = Math.min(...dates)
    const maxDate = Math.max(...dates)
    const plotWidth = WIDTH - PADDING.left - PADDING.right
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom

    const x = (point: ProcurementPricePoint) => {
      if (maxDate === minDate) return PADDING.left + plotWidth / 2
      return PADDING.left + ((dateValue(point) - minDate) / (maxDate - minDate)) * plotWidth
    }

    const y = (cost: number) =>
      PADDING.top + ((axis.max - cost) / Math.max(axis.max - axis.min, 1)) * plotHeight

    const bySupplier = new Map<number, SupplierSeries>()
    history.points.forEach((point, sourceIndex) => {
      const indexedPoint: IndexedPoint = {
        point,
        sourceIndex,
        key: pointKey(point, sourceIndex),
      }
      const current = bySupplier.get(point.supplierId)
      if (current) {
        current.points.push(indexedPoint)
      } else {
        bySupplier.set(point.supplierId, {
          supplierId: point.supplierId,
          name: point.supplierName,
          code: point.supplierCode,
          points: [indexedPoint],
        })
      }
    })

    const series = [...bySupplier.values()]
      .map((supplier) => ({
        ...supplier,
        points: supplier.points
          .slice()
          .sort(
            (left, right) =>
              dateValue(left.point) - dateValue(right.point) || left.sourceIndex - right.sourceIndex,
          ),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, locale))

    const flatPoints: PositionedPoint[] = series
      .flatMap((supplier, seriesIndex) =>
        supplier.points.map((entry) => ({
          ...entry,
          x: x(entry.point),
          y: y(entry.point.unitCost),
          supplierId: supplier.supplierId,
          supplierName: supplier.name,
          supplierCode: supplier.code,
          seriesIndex,
        })),
      )
      .sort(
        (left, right) =>
          dateValue(left.point) - dateValue(right.point)
          || left.sourceIndex - right.sourceIndex,
      )

    return {
      axis,
      ticks,
      minDate,
      maxDate,
      dateTicks: dateTicks(minDate, maxDate),
      x,
      y,
      series,
      flatPoints,
      pointByKey: new Map(flatPoints.map((entry) => [entry.key, entry])),
    }
  }, [history.points, locale])

  useEffect(() => {
    if (focusedSupplierId !== null && !model?.series.some((series) => series.supplierId === focusedSupplierId)) {
      setFocusedSupplierId(null)
    }
    setPointerPointKey(null)
    setKeyboardPointKey(null)
  }, [history.points, focusedSupplierId, model?.series])

  const activeKey = pointerPointKey ?? keyboardPointKey
  const activeBase = activeKey ? model?.pointByKey.get(activeKey) ?? null : null
  const activePoint: ActivePoint | null = activeBase
    ? {
        ...activeBase,
        color: colors[activeBase.seriesIndex % colors.length],
        marker: MARKERS[activeBase.seriesIndex % MARKERS.length],
      }
    : null

  const emphasizedSupplierId = activePoint?.supplierId ?? focusedSupplierId
  const displayLabelSeries =
    model?.series.filter((series) =>
      focusedSupplierId !== null
        ? series.supplierId === focusedSupplierId
        : (model?.series.length ?? 0) <= 6,
    ) ?? []

  const latestLabelYs = model
    ? distributeLabelYs(
        displayLabelSeries.map((series) => ({
          supplierId: series.supplierId,
          desiredY: model.y(series.points[series.points.length - 1].point.unitCost),
        })),
        PADDING.top + 14,
        HEIGHT - PADDING.bottom - 14,
      )
    : new Map<number, number>()

  function getSeriesStyle(seriesIndex: number) {
    return {
      color: colors[seriesIndex % colors.length],
      dash: SERIES_DASHES[seriesIndex % SERIES_DASHES.length],
      marker: MARKERS[seriesIndex % MARKERS.length],
    }
  }

  function setPointerPoint(point: PositionedPoint | null) {
    setPointerPointKey(point?.key ?? null)
  }

  function keyboardPoints() {
    if (!model) return []
    return focusedSupplierId === null
      ? model.flatPoints
      : model.flatPoints.filter((point) => point.supplierId === focusedSupplierId)
  }

  function moveKeyboardPoint(direction: 'next' | 'previous' | 'first' | 'last') {
    const points = keyboardPoints()
    if (points.length === 0) return

    const currentIndex = keyboardPointKey
      ? points.findIndex((point) => point.key === keyboardPointKey)
      : -1

    if (direction === 'first') {
      setKeyboardPointKey(points[0].key)
      return
    }

    if (direction === 'last') {
      setKeyboardPointKey(points[points.length - 1].key)
      return
    }

    if (direction === 'next') {
      const nextIndex = currentIndex < 0 ? points.length - 1 : Math.min(points.length - 1, currentIndex + 1)
      setKeyboardPointKey(points[nextIndex].key)
      return
    }

    const previousIndex = currentIndex < 0 ? points.length - 1 : Math.max(0, currentIndex - 1)
    setKeyboardPointKey(points[previousIndex].key)
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t('items.analytics.priceHistory')}</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('items.analytics.priceHistoryDescription')}
            </p>
            {model ? (
              <p className="text-muted-foreground mt-2 text-xs">
                {t('items.analytics.historySummary', {
                  transactions: history.total,
                  suppliers: model.series.length,
                })}
              </p>
            ) : null}
          </div>
          {history.scope ? (
            <span className="bg-muted rounded-full px-3 py-1 text-xs font-medium">
              {[history.scope.currencyCode, history.scope.unitName].filter(Boolean).join(' / ')
                || t('items.analytics.defaultScope')}
            </span>
          ) : null}
        </div>

        {model ? (
          <div className="flex flex-wrap items-center gap-2" aria-label={t('items.analytics.historySupplierLegend')}>
            {model.series.map((series, seriesIndex) => {
              const style = getSeriesStyle(seriesIndex)
              const focused = focusedSupplierId === series.supplierId
              const muted = focusedSupplierId !== null && !focused

              return (
                <Button
                  key={series.supplierId}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={focused}
                  className={`h-8 max-w-full gap-2 px-2.5 ${muted ? 'opacity-45' : ''}`}
                  style={focused ? { borderColor: style.color } : undefined}
                  onClick={() => setFocusedSupplierId(focused ? null : series.supplierId)}
                >
                  <LegendMarker shape={style.marker} color={style.color} dash={style.dash} />
                  <span className="max-w-48 truncate">{series.name}</span>
                </Button>
              )
            })}
            {focusedSupplierId !== null ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setFocusedSupplierId(null)}
              >
                {t('items.analytics.showAllSuppliers')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {!model ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            {t('items.analytics.noHistory')}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="relative min-w-[54rem]">
                <svg
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  className="w-full outline-none"
                  role="img"
                  tabIndex={0}
                  aria-label={`${t('items.analytics.priceHistoryAria')}. ${t('items.analytics.historyKeyboardHint')}`}
                  onFocus={() => {
                    if (!keyboardPointKey) moveKeyboardPoint('last')
                  }}
                  onBlur={() => setKeyboardPointKey(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                      event.preventDefault()
                      moveKeyboardPoint('next')
                    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                      event.preventDefault()
                      moveKeyboardPoint('previous')
                    } else if (event.key === 'Home') {
                      event.preventDefault()
                      moveKeyboardPoint('first')
                    } else if (event.key === 'End') {
                      event.preventDefault()
                      moveKeyboardPoint('last')
                    }
                  }}
                >
                  <rect
                    x={PADDING.left}
                    y={PADDING.top}
                    width={WIDTH - PADDING.left - PADDING.right}
                    height={HEIGHT - PADDING.top - PADDING.bottom}
                    rx="10"
                    fill="var(--muted)"
                    opacity="0.14"
                  />

                  {model.ticks.map((cost) => {
                    const y = model.y(cost)
                    return (
                      <g key={`y-${cost}`}>
                        <line
                          x1={PADDING.left}
                          x2={WIDTH - PADDING.right}
                          y1={y}
                          y2={y}
                          stroke="var(--border)"
                          strokeWidth="1"
                        />
                        <text
                          x={PADDING.left - 12}
                          y={y + 4}
                          textAnchor="end"
                          fill="var(--muted-foreground)"
                          fontSize="11"
                        >
                          {formatProcurementNumber(cost, locale, 2)}
                        </text>
                      </g>
                    )
                  })}

                  {model.dateTicks.map((tick, index) => {
                    const x =
                      model.maxDate === model.minDate
                        ? PADDING.left + (WIDTH - PADDING.left - PADDING.right) / 2
                        : PADDING.left
                          + ((tick - model.minDate) / (model.maxDate - model.minDate))
                            * (WIDTH - PADDING.left - PADDING.right)
                    return (
                      <g key={`x-${index}-${tick}`}>
                        <line
                          x1={x}
                          x2={x}
                          y1={PADDING.top}
                          y2={HEIGHT - PADDING.bottom}
                          stroke="var(--border)"
                          strokeWidth="1"
                          strokeDasharray="3 6"
                          opacity="0.7"
                        />
                        <text
                          x={x}
                          y={HEIGHT - 28}
                          textAnchor="middle"
                          fill="var(--muted-foreground)"
                          fontSize="11"
                        >
                          {formatAxisDate(tick, locale, model.maxDate - model.minDate)}
                        </text>
                      </g>
                    )
                  })}

                  {activePoint ? (
                    <line
                      x1={activePoint.x}
                      x2={activePoint.x}
                      y1={PADDING.top}
                      y2={HEIGHT - PADDING.bottom}
                      stroke={activePoint.color}
                      strokeWidth="1.5"
                      strokeDasharray="4 5"
                      opacity="0.7"
                    />
                  ) : null}

                  {model.series.map((series, seriesIndex) => {
                    const style = getSeriesStyle(seriesIndex)
                    const muted =
                      emphasizedSupplierId !== null
                      && emphasizedSupplierId !== series.supplierId
                    const coordinates = series.points
                      .map((entry) => `${model.x(entry.point)},${model.y(entry.point.unitCost)}`)
                      .join(' ')

                    return (
                      <g
                        key={series.supplierId}
                        opacity={muted ? 0.14 : 1}
                        style={{ transition: 'opacity 140ms ease' }}
                      >
                        {series.points.length > 1 ? (
                          <polyline
                            points={coordinates}
                            fill="none"
                            stroke={style.color}
                            strokeWidth={
                              emphasizedSupplierId === series.supplierId ? 3.5 : 2.75
                            }
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray={style.dash}
                          />
                        ) : null}

                        {series.points.map((entry) => {
                          const x = model.x(entry.point)
                          const y = model.y(entry.point.unitCost)
                          const active = activePoint?.key === entry.key
                          const positioned: PositionedPoint = {
                            ...entry,
                            x,
                            y,
                            supplierId: series.supplierId,
                            supplierName: series.name,
                            supplierCode: series.code,
                            seriesIndex,
                          }

                          return (
                            <g
                              key={entry.key}
                              onMouseEnter={() => setPointerPoint(positioned)}
                              onMouseLeave={() => setPointerPoint(null)}
                            >
                              <circle
                                cx={x}
                                cy={y}
                                r="11"
                                fill="transparent"
                                pointerEvents="all"
                              />
                              <Marker
                                shape={style.marker}
                                cx={x}
                                cy={y}
                                size={active ? 6.5 : 5}
                                color={style.color}
                                active={active}
                              />
                            </g>
                          )
                        })}
                      </g>
                    )
                  })}

                  {displayLabelSeries.map((series) => {
                    const seriesIndex = Math.max(
                      0,
                      model.series.findIndex(
                        (candidate) => candidate.supplierId === series.supplierId,
                      ),
                    )
                    const style = getSeriesStyle(seriesIndex)
                    const latest = series.points[series.points.length - 1]
                    const pointX = model.x(latest.point)
                    const pointY = model.y(latest.point.unitCost)
                    const labelY = latestLabelYs.get(series.supplierId) ?? pointY
                    const muted =
                      emphasizedSupplierId !== null
                      && emphasizedSupplierId !== series.supplierId

                    return (
                      <g key={`latest-label-${series.supplierId}`} opacity={muted ? 0.14 : 1}>
                        <path
                          d={`M ${pointX + 8} ${pointY} L ${LABEL_X - 10} ${labelY}`}
                          fill="none"
                          stroke={style.color}
                          strokeWidth="1.25"
                          opacity="0.65"
                        />
                        <Marker
                          shape={style.marker}
                          cx={LABEL_X - 13}
                          cy={labelY - 3}
                          size={3.5}
                          color={style.color}
                        />
                        <text
                          x={LABEL_X}
                          y={labelY}
                          fill={style.color}
                          fontSize="11"
                          fontWeight="600"
                        >
                          {shortenLabel(series.name)}
                        </text>
                        <text
                          x={LABEL_X}
                          y={labelY + 15}
                          fill="var(--muted-foreground)"
                          fontSize="10"
                        >
                          {formatUnitCost(
                            latest.point.unitCost,
                            locale,
                            latest.point.currencyCode,
                            latest.point.unitName,
                          )}
                        </text>
                      </g>
                    )
                  })}

                  <text
                    x={PADDING.left}
                    y={HEIGHT - 8}
                    fill="var(--muted-foreground)"
                    fontSize="10"
                  >
                    {t('items.analytics.historyKeyboardHint')}
                  </text>
                </svg>

                {activePoint ? (
                  <HistoryPointTooltip
                    active={activePoint}
                    locale={locale}
                    width={WIDTH}
                    height={HEIGHT}
                  />
                ) : null}
              </div>
            </div>

            {history.truncated ? (
              <p className="text-warning-foreground mt-3 text-xs">
                {t('items.analytics.historyTruncated', {
                  shown: history.points.length,
                  total: history.total,
                })}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function HistoryPointTooltip({
  active,
  locale,
  width,
  height,
}: {
  active: ActivePoint
  locale: string
  width: number
  height: number
}) {
  const { t } = useTranslation()
  const leftPercent = (active.x / width) * 100
  const topPercent = Math.min(88, Math.max(12, (active.y / height) * 100))
  const placeLeft = active.x > width * 0.66
  return (
    <div
      className="pointer-events-none absolute z-20 w-64 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        transform: placeLeft ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)',
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: active.color }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{active.supplierName}</p>
          {active.supplierCode ? (
            <p dir="ltr" className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
              {active.supplierCode}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t('items.analytics.unitCost')}</dt>
        <dd dir="ltr" className="text-end font-semibold tabular-nums">
          {formatUnitCost(
            active.point.unitCost,
            locale,
            active.point.currencyCode,
            active.point.unitName,
          )}
        </dd>

        <dt className="text-muted-foreground">{t('items.analytics.deliveryDate')}</dt>
        <dd className="text-end font-medium">{formatDateOnly(active.point.transactionDate, locale)}</dd>

        <dt className="text-muted-foreground">{t('items.analytics.invoiceNo')}</dt>
        <dd dir="ltr" className="text-end font-mono">
          {active.point.invoiceNo || '—'}
        </dd>

        <dt className="text-muted-foreground">{t('items.analytics.orderId')}</dt>
        <dd dir="ltr" className="text-end font-mono">
          {active.point.orderId || '—'}
        </dd>
      </dl>
    </div>
  )
}
