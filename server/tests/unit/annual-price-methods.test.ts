import { describe, expect, it } from 'vitest';
import { annualPriceQuerySchema } from '../../src/modules/items/items.schemas.js';
import { mapAnnualRecord } from '../../src/modules/items/items.annual-prices.service.js';
import type { AnnualPriceRecord } from '../../src/modules/items/items.annual-prices.repository.js';

describe('annual comparison calculation methods', () => {
  it('keeps lowest as the backward-compatible default and validates all six methods', () => {
    expect(annualPriceQuerySchema.parse({}).priceMethod).toBe('lowest');
    for (const priceMethod of ['lowest','average','mode','median','weighted','latest']) {
      expect(annualPriceQuerySchema.parse({ priceMethod }).priceMethod).toBe(priceMethod);
    }
    expect(annualPriceQuerySchema.safeParse({ priceMethod: 'not-a-method' }).success).toBe(false);
  });

  it('maps the exact calculation aggregates into the same annual price cell', () => {
    const template = {
      itemId: 1, itemCode: 'A', itemName: 'Item A', categoryName: null,
      currencyCode: 'SAR', unitName: 'PIECE',
      year0Cost: null, year1Cost: '122.500000', year2Cost: null,
      year0SupplierId: null, year1SupplierId: null, year2SupplierId: null,
      year0SupplierCode: null, year1SupplierCode: null, year2SupplierCode: null,
      year0SupplierName: null, year1SupplierName: null, year2SupplierName: null,
      year0Date: null, year1Date: null, year2Date: null,
      year0Invoice: null, year1Invoice: null, year2Invoice: null,
      ...([0,1,2].reduce((acc, index) => ({
        ...acc,
        [`year${index}RecordCount`]: index === 1 ? 4 : null,
        [`year${index}UnitPriceSum`]: index === 1 ? '490.000000' : null,
        [`year${index}MinimumPrice`]: index === 1 ? 100 : null,
        [`year${index}MaximumPrice`]: index === 1 ? 150 : null,
        [`year${index}DistinctPriceCount`]: index === 1 ? 3 : null,
        [`year${index}ModeFrequency`]: index === 1 ? 2 : null,
        [`year${index}MedianLower`]: index === 1 ? 120 : null,
        [`year${index}MedianUpper`]: index === 1 ? 120 : null,
        [`year${index}PurchasedQuantity`]: index === 1 ? 105 : null,
        [`year${index}PurchaseValue`]: index === 1 ? 8600 : null,
        [`year${index}InvalidQuantityCount`]: index === 1 ? 0 : null,
      }), {}) as Pick<AnnualPriceRecord, never>),
      previousChangePercent: null, latestChangePercent: null,
      year0Benchmark: null, year1Benchmark: null, year2Benchmark: null,
      year0Quantity: null, year1Quantity: 105, year2Quantity: null,
      year0ActualCost: null, year1ActualCost: 8600, year2ActualCost: null,
      year0Savings: null, year1Savings: null, year2Savings: null,
      purchaseYearCount: 1, totalSavings: null,
      summarySavings: '0', summaryIncluded: 0, summaryExcluded: 1, summaryPartial: 0,
    } as AnnualPriceRecord;
    const mapped = mapAnnualRecord(template, 2026);
    expect(mapped.prices[0].breakdown).toBeNull();
    expect(mapped.prices[1].unitCost).toBe(122.5);
    expect(mapped.prices[1].supplierName).toBeNull();
    expect(mapped.prices[1].breakdown).toMatchObject({
      recordCount: 4, unitPriceSum: 490, minimumPrice: 100, maximumPrice: 150,
      distinctPriceCount: 3, modeFrequency: 2, purchasedQuantity: 105, purchaseValue: 8600,
    });
  });
});
