import { describe, expect, it } from 'vitest'

import type { ItemSupplierMatrixCell } from '../types/item.types'
import {
  effectiveComparisonGroups,
  effectiveComparisonPrice,
  singleEffectiveComparisonWinners,
} from './supplier-comparison'

function cell(
  supplierId: number,
  overrides: Partial<ItemSupplierMatrixCell> = {},
): ItemSupplierMatrixCell {
  return {
    itemId: 10,
    supplierId,
    supplierCode: String(supplierId),
    supplierName: `Supplier ${supplierId}`,
    currencyCode: 'SAR',
    unitName: 'EACH',
    latestUnitCost: 2_000,
    latestTransactionDate: '2026-09-01',
    previousUnitCost: 2_100,
    previousTransactionDate: '2026-08-01',
    lowestUnitCost: 1_900,
    lowestTransactionDate: '2026-07-01',
    highestUnitCost: 2_200,
    highestTransactionDate: '2026-06-01',
    averageUnitCost: 2_050,
    transactionCount: 4,
    lastPurchaseDate: '2026-09-01',
    changeAmount: -100,
    changePercent: -4.7619,
    latestQuoteUnitCost: null,
    latestQuoteDate: null,
    previousQuoteUnitCost: null,
    previousQuoteDate: null,
    lowestQuoteUnitCost: null,
    lowestQuoteDate: null,
    highestQuoteUnitCost: null,
    highestQuoteDate: null,
    averageQuoteUnitCost: null,
    quoteCount: 0,
    lastQuoteDate: null,
    quoteChangeAmount: null,
    quoteChangePercent: null,
    quoteCurrencyCode: null,
    quoteUnitName: null,
    ...overrides,
  }
}

describe('Supplier Compare effective price', () => {
  it('prefers the selected compatible Quote metric over Actual Purchase', () => {
    const result = effectiveComparisonPrice(
      cell(1, {
        latestQuoteUnitCost: 1_850,
        latestQuoteDate: '2026-09-08',
        quoteCount: 1,
        quoteCurrencyCode: 'SAR',
        quoteUnitName: 'EACH',
      }),
      'latest',
    )

    expect(result).toMatchObject({ value: 1_850, source: 'quote', currencyCode: 'SAR', unitName: 'EACH' })
  })

  it('falls back to Actual Purchase when the selected Quote metric is unavailable', () => {
    const result = effectiveComparisonPrice(
      cell(2, {
        latestQuoteUnitCost: 1_850,
        latestQuoteDate: '2026-09-08',
        quoteCount: 1,
        quoteCurrencyCode: 'SAR',
        quoteUnitName: 'EACH',
      }),
      'previous',
    )

    expect(result).toMatchObject({ value: 2_100, source: 'actual' })
  })

  it('falls back to Actual Purchase when the Quote Currency/UOM scope is incompatible', () => {
    const result = effectiveComparisonPrice(
      cell(3, {
        latestQuoteUnitCost: 1_500,
        latestQuoteDate: '2026-09-08',
        quoteCount: 1,
        quoteCurrencyCode: 'SAR',
        quoteUnitName: 'BOX',
      }),
      'latest',
    )

    expect(result).toMatchObject({ value: 2_000, source: 'actual', unitName: 'EACH' })
  })

  it('uses a Quote when no Actual Purchase history exists for that Supplier', () => {
    const result = effectiveComparisonPrice(
      cell(4, {
        currencyCode: null,
        unitName: null,
        latestUnitCost: null,
        latestTransactionDate: null,
        previousUnitCost: null,
        previousTransactionDate: null,
        lowestUnitCost: null,
        lowestTransactionDate: null,
        highestUnitCost: null,
        highestTransactionDate: null,
        averageUnitCost: null,
        transactionCount: 0,
        lastPurchaseDate: null,
        changeAmount: null,
        changePercent: null,
        latestQuoteUnitCost: 1_725,
        latestQuoteDate: '2026-09-08',
        quoteCount: 1,
        quoteCurrencyCode: 'SAR',
        quoteUnitName: 'EACH',
      }),
      'latest',
    )

    expect(result).toMatchObject({ value: 1_725, source: 'quote' })
  })

  it('chooses the lowest effective price and keeps ties', () => {
    const cells = [
      cell(1, { latestUnitCost: 2_000, latestQuoteUnitCost: 1_850, quoteCount: 1, quoteCurrencyCode: 'SAR', quoteUnitName: 'EACH' }),
      cell(2, { latestUnitCost: 1_900 }),
      cell(3, { latestUnitCost: 3_000, latestQuoteUnitCost: 2_750, quoteCount: 1, quoteCurrencyCode: 'SAR', quoteUnitName: 'EACH' }),
      cell(4, { latestUnitCost: 1_800 }),
      cell(5, { latestUnitCost: 2_200, latestQuoteUnitCost: 1_800, quoteCount: 1, quoteCurrencyCode: 'SAR', quoteUnitName: 'EACH' }),
    ]

    const winners = singleEffectiveComparisonWinners(cells, 'latest')

    expect(winners?.map((entry) => entry.cell.supplierId)).toEqual([4, 5])
    expect(winners?.map((entry) => entry.price.source)).toEqual(['actual', 'quote'])
  })

  it('does not declare one winner across different Currency/UOM scopes', () => {
    const groups = effectiveComparisonGroups([
      cell(1, { latestUnitCost: 1_800, currencyCode: 'SAR', unitName: 'EACH' }),
      cell(2, { latestUnitCost: 1_700, currencyCode: 'SAR', unitName: 'BOX' }),
    ], 'latest')

    expect(groups).toHaveLength(2)
    expect(singleEffectiveComparisonWinners(groups.flatMap((group) => group.entries.map((entry) => entry.cell)), 'latest')).toBeNull()
  })
})
