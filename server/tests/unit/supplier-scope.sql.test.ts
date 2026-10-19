import { describe, expect, it } from 'vitest';
import { resolveSupplierSelectionMode, supplierScopeSql } from '../../src/modules/procurement-transactions/supplier-scope.sql.js';
import { annualPriceQuerySchema, itemListQuerySchema, itemPriceSummariesQuerySchema } from '../../src/modules/items/items.schemas.js';
import { priceQuoteSummaryBodySchema } from '../../src/modules/price-quotes/price-quotes.schemas.js';

describe('Supplier inclusion and exclusion modes', () => {
  it('preserves legacy supplierId-only inclusion requests', () => {
    expect(resolveSupplierSelectionMode(undefined, [11, 21])).toBe('INCLUDE');
    expect(resolveSupplierSelectionMode(undefined, [])).toBe('EXCLUDE');
  });
  it('excludes selected vendors without requiring the full supplier list', () => {
    expect(resolveSupplierSelectionMode('exclude', [11, 21])).toBe('EXCLUDE');
    const sql = supplierScopeSql('tx.SUPPLIER_ID');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('tx.SUPPLIER_ID');
    expect(sql).toContain('@supplierMode');
  });
  it('can represent an explicitly empty include-only selection', () => {
    expect(resolveSupplierSelectionMode('include', [])).toBe('INCLUDE');
    expect(supplierScopeSql('supplierId')).toContain('@supplierIdsJson IS NOT NULL');
  });
  it('validates the filter across item and quote endpoints', () => {
    expect(itemListQuerySchema.parse({ supplierMode: 'exclude', supplierIds: '11,21' }).supplierIds).toEqual([11,21]);
    expect(annualPriceQuerySchema.parse({ supplierMode: 'exclude', supplierIds: '11,21' }).supplierMode).toBe('exclude');
    expect(itemPriceSummariesQuerySchema.parse({ supplierMode: 'exclude', supplierIds: '11,21', itemIds: '101' }).supplierMode).toBe('exclude');
    expect(priceQuoteSummaryBodySchema.parse({ supplierMode: 'exclude', supplierIds: [11,21] }).supplierMode).toBe('exclude');
    expect(itemListQuerySchema.safeParse({ supplierMode: 'wrong' }).success).toBe(false);
  });
});
