export type ProcurementPricePeriod = "1M" | "3M" | "6M" | "1Y" | "ALL";
export type SortDirection = "asc" | "desc";
export type ItemTransactionSortBy = "transactionDate" | "unitCost" | "supplier" | "quantity" | "invoiceNo";
export type ItemSupplierSortBy = "supplier" | "latest" | "lowest" | "highest" | "average" | "transactions" | "lastPurchase";

export interface ProcurementPriceFilter {
  period: ProcurementPricePeriod;
  supplierIds?: number[] | undefined;
  currencyCode?: string | undefined;
  unitName?: string | undefined;
}

export interface ItemTransactionListQuery extends ProcurementPriceFilter {
  page: number;
  pageSize: number;
  sortBy: ItemTransactionSortBy;
  sortDirection: SortDirection;
}

export interface ItemSupplierListQuery extends ProcurementPriceFilter {
  page: number;
  pageSize: number;
  sortBy: ItemSupplierSortBy;
  sortDirection: SortDirection;
}

export interface ItemPriceHistoryQuery extends ProcurementPriceFilter {
  maxPoints: number;
}

export interface ProcurementPriceScope {
  currencyCode: string | null;
  unitName: string | null;
}

export interface ProcurementPricePoint extends ProcurementPriceScope {
  transactionDate: string;
  unitCost: number;
  supplierId: number;
  supplierCode: string | null;
  supplierName: string;
  invoiceNo: string | null;
  orderId: string | null;
}

export interface ProcurementTransaction extends ProcurementPriceScope {
  transactionDate: string;
  confirmDate: string | null;
  invoiceNo: string | null;
  vendorInvoiceNo: string | null;
  vendorInvoiceDate: string | null;
  orderId: string | null;
  billNo: string | null;
  billDate: string | null;
  supplierId: number;
  supplierCode: string | null;
  supplierName: string;
  itemId: number;
  itemCode: string | null;
  itemDescription: string | null;
  quantity: number | null;
  bonusQuantity: number | null;
  unitCost: number;
  lotNo: string | null;
  expiryDate: string | null;
  statusCode: string | null;
  statusName: string | null;
  invoiceStatus: string | null;
}

export interface ItemTransactionList {
  transactions: ProcurementTransaction[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ItemPriceHistory {
  points: ProcurementPricePoint[];
  scope: ProcurementPriceScope | null;
  total: number;
  truncated: boolean;
}

export interface ItemPriceAnalytics {
  itemId: number;
  scope: ProcurementPriceScope | null;
  scopeCount: number;
  latest: ProcurementPricePoint | null;
  previous: ProcurementPricePoint | null;
  lowest: ProcurementPricePoint | null;
  highest: ProcurementPricePoint | null;
  averageUnitCost: number | null;
  transactionCount: number;
  supplierCount: number;
  lastPurchaseDate: string | null;
  changeAmount: number | null;
  changePercent: number | null;
}

export interface ItemSupplierPriceSummary extends ProcurementPriceScope {
  supplierId: number;
  supplierCode: string | null;
  supplierName: string;
  latestUnitCost: number;
  latestTransactionDate: string;
  previousUnitCost: number | null;
  previousTransactionDate: string | null;
  lowestUnitCost: number;
  highestUnitCost: number;
  averageUnitCost: number;
  transactionCount: number;
  lastPurchaseDate: string;
  changeAmount: number | null;
  changePercent: number | null;
  isCurrentLowest: boolean;
  isCurrentHighest: boolean;
}

export interface ItemSupplierPriceList {
  suppliers: ItemSupplierPriceSummary[];
  scope: ProcurementPriceScope | null;
  page: number;
  pageSize: number;
  total: number;
}

export type SupplierItemPriceSortBy =
  | "item"
  | "latest"
  | "lowest"
  | "highest"
  | "average"
  | "difference"
  | "transactions"
  | "lastPurchase";

export interface SupplierPriceFilter {
  period: ProcurementPricePeriod;
}

export interface SupplierItemPriceListQuery extends SupplierPriceFilter {
  page: number;
  pageSize: number;
  sortBy: SupplierItemPriceSortBy;
  sortDirection: SortDirection;
}

export interface SupplierItemPriceSummary extends ProcurementPriceScope {
  itemId: number;
  itemCode: string | null;
  itemName: string;
  categoryName: string | null;
  latestUnitCost: number;
  latestTransactionDate: string;
  previousUnitCost: number | null;
  previousTransactionDate: string | null;
  lowestUnitCost: number;
  highestUnitCost: number;
  averageUnitCost: number;
  transactionCount: number;
  lastPurchaseDate: string;
  marketSupplierCount: number;
  currentLowestUnitCost: number;
  currentHighestUnitCost: number;
  differenceFromLowestAmount: number;
  differenceFromLowestPercent: number | null;
  isCurrentLowest: boolean;
  isCurrentHighest: boolean;
}

export interface SupplierItemPriceList {
  items: SupplierItemPriceSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SupplierPriceAnalytics {
  supplierId: number;
  period: ProcurementPricePeriod;
  itemCount: number;
  transactionCount: number;
  lastPurchaseDate: string | null;
  comparableItemCount: number;
  currentLowestItemCount: number;
  currentHighestItemCount: number;
  singleSupplierItemCount: number;
  averageDifferenceFromLowestPercent: number | null;
}

