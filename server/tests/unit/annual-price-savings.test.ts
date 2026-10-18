import { describe, expect, it } from 'vitest';
import { mapAnnualRecord } from '../../src/modules/items/items.annual-prices.service.js';
import type { AnnualPriceRecord } from '../../src/modules/items/items.annual-prices.repository.js';

const sample: AnnualPriceRecord = {
  itemId: 42, itemCode: 'TEST-42', itemName: 'Surgical gloves', categoryName: null,
  currencyCode: 'SAR', unitName: 'BOX',
  year0Cost: 120, year1Cost: 100, year2Cost: 80,
  year0SupplierId: 1, year1SupplierId: 2, year2SupplierId: 3,
  year0SupplierCode: 'S1', year1SupplierCode: 'S2', year2SupplierCode: 'S3',
  year0SupplierName: 'A', year1SupplierName: 'B', year2SupplierName: 'C',
  year0Date: new Date('2024-06-01T00:00:00.000Z'),
  year1Date: new Date('2025-06-01T00:00:00.000Z'),
  year2Date: new Date('2026-06-01T00:00:00.000Z'),
  year0Invoice: 'A1', year1Invoice: 'B1', year2Invoice: 'C1',
  previousChangePercent: -16.6667, latestChangePercent: -20,
  year0Benchmark: 130, year1Benchmark: 120, year2Benchmark: 100,
  year0Quantity: 60, year1Quantity: 50, year2Quantity: 80,
  year0ActualCost: 7200, year1ActualCost: 5200, year2ActualCost: 7300,
  year0Savings: '600.0000', year1Savings: '800.0000', year2Savings: '700.0000',
  purchaseYearCount: 3,
  totalSavings: '2100.0000', summarySavings: '2100.0000', summaryIncluded: 1, summaryExcluded: 0, summaryPartial: 0,
};

describe('annual price savings API mapping', () => {
  it('includes the prior-year benchmark and transaction-based financial breakdown', () => {
    const result = mapAnnualRecord(sample, 2026);
    expect(result.prices.map(p => p.unitCost)).toEqual([120, 100, 80]);
    expect(result.savingsByYear).toEqual([
      { year: 2024, benchmarkPrice: 130, quantity: 60, actualSpending: 7200, savings: 600 },
      { year: 2025, benchmarkPrice: 120, quantity: 50, actualSpending: 5200, savings: 800 },
      { year: 2026, benchmarkPrice: 100, quantity: 80, actualSpending: 7300, savings: 700 },
    ]);
    expect(result.totalSavings).toBe(2100);
  });

  it('maps a partial 2-of-3-year net saving when the first benchmark is missing', () => {
    const result = mapAnnualRecord({
      ...sample,
      year0Benchmark: null, year0Savings: null,
      year1Savings: '-3000', year2Savings: '1500', totalSavings: '-1500',
      summarySavings: '-1500', summaryIncluded: 1, summaryExcluded: 0, summaryPartial: 1,
    }, 2026);
    expect(result.savingsByYear[0].benchmarkPrice).toBeNull();
    expect(result.savingsByYear.map(year => year.savings)).toEqual([null, -3000, 1500]);
    expect(result.totalSavings).toBe(-1500);
  });

  it('keeps N/A when none of the three purchase years is comparable', () => {
    const result = mapAnnualRecord({ ...sample, year0Savings: null, year1Savings: null, year2Savings: null, totalSavings: null }, 2026);
    expect(result.savingsByYear.every(year => year.savings === null)).toBe(true);
    expect(result.totalSavings).toBeNull();
  });

  it('keeps extra costs negative and shifts the displayed years for 2027', () => {
    const result = mapAnnualRecord({ ...sample, year2Savings: '-450', totalSavings: '-300' }, 2027);
    expect(result.savingsByYear.map(year => year.year)).toEqual([2025, 2026, 2027]);
    expect(result.savingsByYear[2].savings).toBe(-450);
    expect(result.totalSavings).toBe(-300);
  });

  it('excludes a single 2024 purchase year even with a valid 2023 benchmark', () => {
    const result = mapAnnualRecord({
      ...sample,
      year1Cost: null, year2Cost: null,
      year1Quantity: null, year2Quantity: null,
      year1ActualCost: null, year2ActualCost: null,
      year1Savings: null, year2Savings: null,
      purchaseYearCount: 1,
      totalSavings: null, summarySavings: '0',
      summaryIncluded: 0, summaryExcluded: 1, summaryPartial: 0,
    }, 2026);
    expect(result.purchaseYearCount).toBe(1);
    expect(result.prices.map(year => year.unitCost)).toEqual([120, null, null]);
    // The legitimate 2024 vs 2023 calculation remains inspectable in details.
    expect(result.savingsByYear[0].savings).toBe(600);
    expect(result.totalSavings).toBeNull();
  });

  it('allows an incomplete total when purchases exist in two selected years', () => {
    const result = mapAnnualRecord({
      ...sample,
      year0Benchmark: null, year0Savings: null,
      year2Cost: null, year2Quantity: null, year2ActualCost: null,
      year2Savings: null,
      purchaseYearCount: 2,
      totalSavings: '800', summaryPartial: 1,
    }, 2026);
    expect(result.purchaseYearCount).toBe(2);
    expect(result.savingsByYear.map(year => year.savings)).toEqual([null, 800, null]);
    expect(result.totalSavings).toBe(800);
  });

});
