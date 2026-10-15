import { useTranslation } from 'react-i18next'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AnnualLowestPurchase } from '../types/item.types'
import { formatDateOnly, formatPercent, formatUnitCost } from './item-price-format'

const WIDTH = 150
const HEIGHT = 64
const X_POSITIONS = [14, 75, 136] as const
const LABEL_Y = 11
const TOP = 20
const BOTTOM = 52

export type AnnualTrendPoint = {
  year: number
  unitCost: number | null
  x: number
  y: number | null
}

/**
 * Plot the three annual minima on a per-item scale. Empty/invalid years are
 * missing points, never zeroes. X positions remain oldest-to-newest even in RTL.
 */
export function annualTrendPoints(prices: readonly AnnualLowestPurchase[]): AnnualTrendPoint[] {
  const validCosts = prices
    .map((price) => price.unitCost)
    .filter((cost): cost is number => cost !== null && Number.isFinite(cost) && cost > 0)
  const minimum = validCosts.length ? Math.min(...validCosts) : 0
  const maximum = validCosts.length ? Math.max(...validCosts) : 0

  return prices.map((price, index) => {
    const cost = price.unitCost !== null && Number.isFinite(price.unitCost) && price.unitCost > 0
      ? price.unitCost
      : null
    const y = cost === null ? null : maximum === minimum
      ? (TOP + BOTTOM) / 2
      : BOTTOM - ((cost - minimum) / (maximum - minimum)) * (BOTTOM - TOP)
    return { year: price.year, unitCost: cost, x: X_POSITIONS[index] ?? X_POSITIONS[2], y }
  })
}

type Tone = 'decrease' | 'increase' | 'unchanged'

function movement(previous: number, current: number): Tone {
  return current < previous ? 'decrease' : current > previous ? 'increase' : 'unchanged'
}

function toneColor(tone: Tone): string {
  return tone === 'decrease' ? 'var(--success)' : tone === 'increase' ? 'var(--destructive)' : 'var(--muted-foreground)'
}

export function AnnualPriceSparkline({
  prices,
  currencyCode,
  unitName,
  previousChangePercent,
  latestChangePercent,
}: {
  prices: [AnnualLowestPurchase, AnnualLowestPurchase, AnnualLowestPurchase]
  currencyCode: string | null
  unitName: string | null
  previousChangePercent: number | null
  latestChangePercent: number | null
}) {
  const { i18n, t } = useTranslation()
  const points = annualTrendPoints(prices)
  const hasPrices = points.some((point) => point.y !== null)
  const comparableScope = Boolean(currencyCode?.trim() && unitName?.trim())
  const changes = [null, previousChangePercent, latestChangePercent]

  if (!hasPrices) {
    return <span className="text-muted-foreground text-xs" aria-label={t('items.annual.noPurchase')}>—</span>
  }
  if (!comparableScope) {
    return <span className="text-muted-foreground text-xs">{t('items.annual.notComparable')}</span>
  }

  return (
    <div dir="ltr" className="relative mx-auto h-[64px] w-[150px] shrink-0" role="group" aria-label={t('items.annual.priceTrend')}>
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block"
        aria-hidden="true"
      >
        {points.map((point) => (
          <text
            key={`label-${point.year}`}
            x={point.x}
            y={LABEL_Y}
            textAnchor="middle"
            className="fill-muted-foreground text-[8px] font-medium"
          >
            {point.year}
          </text>
        ))}
        {points.slice(1).map((current, index) => {
          const previous = points[index]
          if (!previous || previous.unitCost === null || current.unitCost === null || previous.y === null || current.y === null) return null
          return (
            <line
              key={`${previous.year}-${current.year}`}
              x1={previous.x}
              y1={previous.y}
              x2={current.x}
              y2={current.y}
              stroke={toneColor(movement(previous.unitCost, current.unitCost))}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )
        })}
      </svg>
      {points.map((point, index) => {
        const purchase = prices[index]
        if (!purchase || point.y === null || point.unitCost === null) return null
        const previous = points[index - 1]
        const tone = previous && previous.unitCost !== null
          ? movement(previous.unitCost, point.unitCost)
          : 'unchanged'
        const previousYear = points[index - 1]?.year
        const comparison = changes[index]
        return (
          <Tooltip key={point.year}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring"
                style={{ left: point.x, top: point.y }}
                aria-label={`${point.year}: ${formatUnitCost(point.unitCost, i18n.language, currencyCode, unitName)}`}
              >
                <span
                  aria-hidden="true"
                  className="block size-2.5 rounded-full border border-background"
                  style={{ backgroundColor: toneColor(tone) }}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="max-w-[18rem] space-y-1 px-3 py-2 text-start">
              <p className="font-semibold">{point.year}</p>
              <p dir="ltr" className="font-semibold tabular-nums">
                {formatUnitCost(point.unitCost, i18n.language, currencyCode, unitName)}
              </p>
              <p>{t('items.annual.trendSupplier')}: {purchase.supplierName || '—'}</p>
              <p>{t('items.annual.trendDate')}: {formatDateOnly(purchase.transactionDate, i18n.language)}</p>
              {index > 0 && previousYear !== undefined ? (
                <p>{t('items.annual.changeFrom', { year: previousYear })}: {comparison == null ? t('items.annual.notComparable') : formatPercent(comparison, i18n.language)}</p>
              ) : null}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
