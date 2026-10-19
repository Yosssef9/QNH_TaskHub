/**
 * Filtering is applied to source transactions, before the pricing, supplier count,
 * annual savings or quote aggregations. Only pass trusted SQL identifier fragments.
 * Missing mode keeps legacy calls compatible: a populated supplierIds list means
 * INCLUDE; an empty list means all suppliers (EXCLUDE with no exclusions).
 */
export type SupplierSelectionMode = 'include' | 'exclude';

export function resolveSupplierSelectionMode(
  mode: SupplierSelectionMode | undefined,
  supplierIds: readonly number[] | undefined,
): 'INCLUDE' | 'EXCLUDE' {
  return (mode ?? (supplierIds?.length ? 'include' : 'exclude')).toUpperCase() as 'INCLUDE' | 'EXCLUDE';
}

export function supplierScopeSql(supplierExpression: string): string {
  return `(
    (@supplierMode = 'EXCLUDE' AND (
      @supplierIdsJson IS NULL OR NOT EXISTS (
        SELECT 1 FROM OPENJSON(@supplierIdsJson) WITH (id BIGINT '$') AS ignored
        WHERE ignored.id = ${supplierExpression}
      )
    ))
    OR
    (@supplierMode = 'INCLUDE' AND @supplierIdsJson IS NOT NULL AND EXISTS (
      SELECT 1 FROM OPENJSON(@supplierIdsJson) WITH (id BIGINT '$') AS included
      WHERE included.id = ${supplierExpression}
    ))
  )`;
}
