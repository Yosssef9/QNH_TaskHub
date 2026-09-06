export type ItemSource = 'ORACLE' | 'MANUAL'
export type ProcurementPricePeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL'
export type ItemSortBy =
  | 'code'
  | 'name'
  | 'category'
  | 'unit'
  | 'status'
  | 'source'
  | 'latest'
  | 'lowest'
  | 'highest'
  | 'change'
  | 'suppliers'
  | 'lastPurchase'
export type SortDirection = 'asc' | 'desc'
export type ProcurementActivityType = 'CREATED' | 'UPDATED' | 'DEACTIVATED' | 'REACTIVATED'

export interface Item {
  id: number
  code: string
  name: string
  parentName: string | null
  categoryName: string | null
  unit: string | null
  pieceUnit: string | null
  factor: number | null
  isStockItem: boolean
  statusCode: number | null
  isAsset: boolean
  source: ItemSource
}


export interface ItemOption {
  id: number
  code: string
  name: string
  unit: string | null
}

export interface ItemOptionList {
  items: ItemOption[]
  page: number
  pageSize: number
  total: number
}

export interface ItemInput {
  name: string
  parentName: string | null
  categoryName: string | null
  unit: string | null
  pieceUnit: string | null
  factor: number | null
  isStockItem: boolean
  statusCode: number | null
  isAsset: boolean
}

export interface ItemListQuery {
  search?: string | undefined
  page: number
  pageSize: number
  source?: ItemSource | undefined
  category?: string | undefined
  statusCode?: number | undefined
  itemIds?: number[] | undefined
  period?: ProcurementPricePeriod | undefined
  supplierIds?: number[] | undefined
  currencyCode?: string | undefined
  unitName?: string | undefined
  sortBy: ItemSortBy
  sortDirection: SortDirection
}


export interface ItemOptionQuery {
  search?: string | undefined
  source?: ItemSource | undefined
  page: number
  pageSize: number
}

export interface ItemPriceSummaryQuery {
  itemIds: number[]
  period: ProcurementPricePeriod
  supplierIds?: number[] | undefined
  currencyCode?: string | undefined
  unitName?: string | undefined
}

export type ItemSupplierMatrixMetric = 'latest' | 'previous' | 'lowest' | 'highest' | 'average'
export type ItemSupplierMatrixPriceSource = 'actual' | 'quote' | 'compare'

export interface ItemSupplierMatrixQuery {
  itemIds: number[]
  supplierIds: number[]
  period: ProcurementPricePeriod
}

export interface ItemSupplierMatrixCell {
  itemId: number
  supplierId: number
  supplierCode: string | null
  supplierName: string
  currencyCode: string | null
  unitName: string | null
  latestUnitCost: number | null
  latestTransactionDate: string | null
  previousUnitCost: number | null
  previousTransactionDate: string | null
  lowestUnitCost: number | null
  lowestTransactionDate: string | null
  highestUnitCost: number | null
  highestTransactionDate: string | null
  averageUnitCost: number | null
  transactionCount: number
  lastPurchaseDate: string | null
  changeAmount: number | null
  changePercent: number | null
  latestQuoteUnitCost: number | null
  latestQuoteDate: string | null
  previousQuoteUnitCost: number | null
  previousQuoteDate: string | null
  lowestQuoteUnitCost: number | null
  lowestQuoteDate: string | null
  highestQuoteUnitCost: number | null
  highestQuoteDate: string | null
  averageQuoteUnitCost: number | null
  quoteCount: number
  lastQuoteDate: string | null
  quoteChangeAmount: number | null
  quoteChangePercent: number | null
  quoteCurrencyCode: string | null
  quoteUnitName: string | null
}

export interface ItemSupplierMatrixItem {
  itemId: number
  suppliers: ItemSupplierMatrixCell[]
}

export interface ItemSupplierMatrixBatch {
  items: ItemSupplierMatrixItem[]
}

export type ItemOverviewQuery = Omit<ItemListQuery, 'page' | 'pageSize' | 'sortBy' | 'sortDirection'>

export interface ItemListPriceSummary {
  currencyCode: string | null
  unitName: string | null
  latestUnitCost: number
  previousUnitCost: number | null
  lowestUnitCost: number
  highestUnitCost: number
  averageUnitCost: number
  changeAmount: number | null
  changePercent: number | null
  supplierCount: number
  transactionCount: number
  lastPurchaseDate: string
  latestSupplierId: number
  latestSupplierCode: string | null
  latestSupplierName: string
  lowestTransactionDate: string
  lowestSupplierId: number
  lowestSupplierCode: string | null
  lowestSupplierName: string
  highestTransactionDate: string
  highestSupplierId: number
  highestSupplierCode: string | null
  highestSupplierName: string
}

export interface ItemListItem extends Item {
  price: ItemListPriceSummary | null
}

export interface ItemList {
  items: ItemListItem[]
  page: number
  pageSize: number
  total: number
}


export interface ItemPriceSummaryBatchItem {
  itemId: number
  price: ItemListPriceSummary | null
}

export interface ItemPriceSummaryBatch {
  items: ItemPriceSummaryBatchItem[]
}

export interface ItemsOverview {
  totalItems: number
  purchasedItems: number
  supplierCount: number
  transactionCount: number
  priceIncreases: number
  priceDecreases: number
  latestAtHistoricalHigh: number
}

export interface ItemActivity {
  id: number
  type: ProcurementActivityType
  changes: Record<string, { from: unknown; to: unknown }> | null
  actorUserId: number
  actorName: string
  createdAtUtc: string
}

export type ItemTransactionSortBy = 'transactionDate' | 'unitCost' | 'supplier' | 'quantity' | 'invoiceNo'
export type ItemSupplierSortBy = 'supplier' | 'latest' | 'lowest' | 'highest' | 'average' | 'transactions' | 'lastPurchase'

export interface ProcurementPriceFilter {
  period: ProcurementPricePeriod
  supplierIds?: number[] | undefined
  currencyCode?: string | undefined
  unitName?: string | undefined
}

export interface ItemTransactionListQuery extends ProcurementPriceFilter {
  page: number
  pageSize: number
  sortBy: ItemTransactionSortBy
  sortDirection: SortDirection
}

export interface ItemSupplierListQuery extends ProcurementPriceFilter {
  page: number
  pageSize: number
  sortBy: ItemSupplierSortBy
  sortDirection: SortDirection
}

export interface ItemPriceHistoryQuery extends ProcurementPriceFilter {
  maxPoints?: number | undefined
}

export interface ProcurementPriceScope {
  currencyCode: string | null
  unitName: string | null
}

export interface ProcurementPricePoint extends ProcurementPriceScope {
  transactionDate: string
  unitCost: number
  supplierId: number
  supplierCode: string | null
  supplierName: string
  invoiceNo: string | null
  orderId: string | null
}

export interface ProcurementTransaction extends ProcurementPriceScope {
  transactionDate: string
  confirmDate: string | null
  invoiceNo: string | null
  vendorInvoiceNo: string | null
  vendorInvoiceDate: string | null
  orderId: string | null
  billNo: string | null
  billDate: string | null
  supplierId: number
  supplierCode: string | null
  supplierName: string
  itemId: number
  itemCode: string | null
  itemDescription: string | null
  quantity: number | null
  bonusQuantity: number | null
  unitCost: number
  lotNo: string | null
  expiryDate: string | null
  statusCode: string | null
  statusName: string | null
  invoiceStatus: string | null
}

export interface ItemTransactionList {
  transactions: ProcurementTransaction[]
  page: number
  pageSize: number
  total: number
}

export interface ItemPriceHistory {
  points: ProcurementPricePoint[]
  scope: ProcurementPriceScope | null
  total: number
  truncated: boolean
}

export interface ItemPriceAnalytics {
  itemId: number
  scope: ProcurementPriceScope | null
  scopeCount: number
  latest: ProcurementPricePoint | null
  previous: ProcurementPricePoint | null
  lowest: ProcurementPricePoint | null
  highest: ProcurementPricePoint | null
  averageUnitCost: number | null
  transactionCount: number
  supplierCount: number
  lastPurchaseDate: string | null
  changeAmount: number | null
  changePercent: number | null
}

export interface ItemSupplierPriceSummary extends ProcurementPriceScope {
  supplierId: number
  supplierCode: string | null
  supplierName: string
  latestUnitCost: number
  latestTransactionDate: string
  previousUnitCost: number | null
  previousTransactionDate: string | null
  lowestUnitCost: number
  highestUnitCost: number
  averageUnitCost: number
  transactionCount: number
  lastPurchaseDate: string
  changeAmount: number | null
  changePercent: number | null
  isCurrentLowest: boolean
  isCurrentHighest: boolean
}

export interface ItemSupplierPriceList {
  suppliers: ItemSupplierPriceSummary[]
  scope: ProcurementPriceScope | null
  page: number
  pageSize: number
  total: number
}


