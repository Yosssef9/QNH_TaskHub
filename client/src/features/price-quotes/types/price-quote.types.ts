export type ProcurementPricePeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL'
export type QuoteSortBy = 'quoteDate' | 'item' | 'supplier' | 'quotedUnitCost' | 'difference' | 'status'
export type SortDirection = 'asc' | 'desc'
export type QuoteStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

export interface PriceQuoteInput {
  itemId: number
  supplierId: number
  quoteDate: string
  quotedUnitCost: number
  currencyCode: string
  unitName: string
  quoteNumber: string | null
  notes: string | null
}

export interface PriceQuote extends PriceQuoteInput {
  id: number
  itemCode: string | null
  itemName: string
  supplierCode: string | null
  supplierName: string
  isActive: boolean
  latestActualUnitCost: number | null
  latestActualDate: string | null
  differenceAmount: number | null
  differencePercent: number | null
  createdAtUtc: string
  updatedAtUtc: string
  rowVersion: string
}

export interface PriceQuoteListQuery {
  search?: string | undefined
  itemId?: number | undefined
  supplierId?: number | undefined
  supplierIds?: number[] | undefined
  period: ProcurementPricePeriod
  status: QuoteStatusFilter
  page: number
  pageSize: number
  sortBy: QuoteSortBy
  sortDirection: SortDirection
}

export interface PriceQuoteList {
  items: PriceQuote[]
  page: number
  pageSize: number
  total: number
}

export interface PriceQuoteActivity {
  id: number
  type: 'CREATED' | 'UPDATED' | 'DEACTIVATED' | 'REACTIVATED'
  changes: Record<string, { from: unknown; to: unknown }> | null
  actorUserId: number
  actorName: string
  createdAtUtc: string
}

export interface PriceQuoteAnalyticsQuery {
  itemId?: number | undefined
  supplierId?: number | undefined
  supplierIds?: number[] | undefined
  period: ProcurementPricePeriod
}

export interface PriceQuotePoint {
  id: number
  quoteDate: string
  quotedUnitCost: number
  supplierId: number
  supplierCode: string | null
  supplierName: string
  currencyCode: string
  unitName: string
  isActive: boolean
}

export interface PriceQuoteSupplierSummary {
  supplierId: number
  supplierCode: string | null
  supplierName: string
  currencyCode: string
  unitName: string
  latestQuote: number
  latestQuoteDate: string
  previousQuote: number | null
  lowestQuote: number
  highestQuote: number
  averageQuote: number
  quoteCount: number
  latestActualUnitCost: number | null
  latestActualDate: string | null
  differenceAmount: number | null
  differencePercent: number | null
}

export interface PriceQuoteAnalytics {
  quoteCount: number
  activeQuoteCount: number
  latest: PriceQuotePoint | null
  previous: PriceQuotePoint | null
  lowest: PriceQuotePoint | null
  highest: PriceQuotePoint | null
  averageQuote: number | null
  supplierCount: number
  points: PriceQuotePoint[]
  supplierSummaries: PriceQuoteSupplierSummary[]
}

export interface PriceQuoteSummaryInput {
  itemIds: number[]
  supplierIds: number[]
  period: ProcurementPricePeriod
}
export interface PriceQuoteSummary {
  activeQuoteCount: number
  quotedItemCount: number
  quotesBelowLatestActualCount: number
}
