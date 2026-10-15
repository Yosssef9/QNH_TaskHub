import { describe, expect, it } from 'vitest'

import type { AnnualLowestPurchase } from '../types/item.types'
import { annualTrendPoints } from './AnnualPriceSparkline'

function purchases(costs: [number | null, number | null, number | null]): [AnnualLowestPurchase, AnnualLowestPurchase, AnnualLowestPurchase] {
  return costs.map((unitCost, index) => ({
    year: 2024 + index,
    unitCost,
    supplierId: null,
    supplierCode: null,
    supplierName: null,
    transactionDate: null,
    invoiceNo: null,
  })) as [AnnualLowestPurchase, AnnualLowestPurchase, AnnualLowestPurchase]
}

describe('annual price sparkline geometry', () => {
  it('always plots chronological years left-to-right for both language directions', () => {
    const points = annualTrendPoints(purchases([3500, 2500, 1000]))
    expect(points.map((point) => point.x)).toEqual([14, 75, 136])
    expect(points.map((point) => point.year)).toEqual([2024, 2025, 2026])
    expect(points[0]?.y).toBeLessThan(points[1]?.y ?? 0)
    expect(points[1]?.y).toBeLessThan(points[2]?.y ?? 0)
  })

  it('plots unchanged prices on a horizontal midline', () => {
    expect(annualTrendPoints(purchases([15, 15, 15])).map((point) => point.y)).toEqual([36, 36, 36])
  })

  it('keeps missing years as gaps rather than zero-price points', () => {
    const points = annualTrendPoints(purchases([15, null, 12]))
    expect(points.map((point) => point.y)).toEqual([20, null, 52])
  })

  it('handles missing history without creating false trend coordinates', () => {
    expect(annualTrendPoints(purchases([null, null, null])).map((point) => point.y)).toEqual([null, null, null])
    expect(annualTrendPoints(purchases([null, 23, null])).map((point) => point.y)).toEqual([null, 36, null])
  })
})
