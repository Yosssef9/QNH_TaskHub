import type { ProcurementPricePeriod } from "../procurement-transactions/procurement-transactions.types.js";

export type ItemSource = "ORACLE" | "MANUAL";
export type ItemSortBy =
  | "code"
  | "name"
  | "category"
  | "unit"
  | "status"
  | "source"
  | "latest"
  | "lowest"
  | "highest"
  | "change"
  | "suppliers"
  | "lastPurchase";
export type SortDirection = "asc" | "desc";
export type ProcurementActivityType = "CREATED" | "UPDATED" | "DEACTIVATED" | "REACTIVATED";

export interface Item {
  id: number;
  code: string;
  name: string;
  parentName: string | null;
  categoryName: string | null;
  unit: string | null;
  pieceUnit: string | null;
  factor: number | null;
  isStockItem: boolean;
  statusCode: number | null;
  isAsset: boolean;
  source: ItemSource;
}

export interface ItemOption {
  id: number;
  code: string;
  name: string;
  unit: string | null;
}

export interface ItemOptionList {
  items: ItemOption[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ItemInput {
  name: string;
  parentName: string | null;
  categoryName: string | null;
  unit: string | null;
  pieceUnit: string | null;
  factor: number | null;
  isStockItem: boolean;
  statusCode: number | null;
  isAsset: boolean;
}

export interface ItemListQuery {
  search?: string | undefined;
  page: number;
  pageSize: number;
  source?: ItemSource | undefined;
  category?: string | undefined;
  statusCode?: number | undefined;
  itemIds?: number[] | undefined;
  period: ProcurementPricePeriod;
  supplierIds?: number[] | undefined;
  currencyCode?: string | undefined;
  unitName?: string | undefined;
  sortBy: ItemSortBy;
  sortDirection: SortDirection;
}

export interface ItemOptionQuery {
  search?: string | undefined;
  source?: ItemSource | undefined;
  page: number;
  pageSize: number;
}

export interface ItemPriceSummaryQuery {
  itemIds: number[];
  period: ProcurementPricePeriod;
  supplierIds?: number[] | undefined;
  currencyCode?: string | undefined;
  unitName?: string | undefined;
}

export type ItemOverviewQuery = Omit<ItemListQuery, "page" | "pageSize" | "sortBy" | "sortDirection">;

export type ItemSupplierMatrixMetric = "latest" | "previous" | "lowest" | "highest" | "average";

export interface ItemSupplierMatrixQuery {
  itemIds: number[];
  supplierIds: number[];
  period: ProcurementPricePeriod;
}

export interface ItemSupplierMatrixCell {
  itemId: number;
  supplierId: number;
  supplierCode: string | null;
  supplierName: string;
  currencyCode: string | null;
  unitName: string | null;
  latestUnitCost: number | null;
  latestTransactionDate: string | null;
  previousUnitCost: number | null;
  previousTransactionDate: string | null;
  lowestUnitCost: number | null;
  lowestTransactionDate: string | null;
  highestUnitCost: number | null;
  highestTransactionDate: string | null;
  averageUnitCost: number | null;
  transactionCount: number;
  lastPurchaseDate: string | null;
  changeAmount: number | null;
  changePercent: number | null;
  latestQuoteUnitCost: number | null;
  latestQuoteDate: string | null;
  quoteCurrencyCode: string | null;
  quoteUnitName: string | null;
}

export interface ItemSupplierMatrixItem {
  itemId: number;
  suppliers: ItemSupplierMatrixCell[];
}

export interface ItemSupplierMatrixBatch {
  items: ItemSupplierMatrixItem[];
}

export interface ItemListPriceSummary {
  currencyCode: string | null;
  unitName: string | null;
  latestUnitCost: number;
  previousUnitCost: number | null;
  lowestUnitCost: number;
  highestUnitCost: number;
  averageUnitCost: number;
  changeAmount: number | null;
  changePercent: number | null;
  supplierCount: number;
  transactionCount: number;
  lastPurchaseDate: string;
  latestSupplierId: number;
  latestSupplierCode: string | null;
  latestSupplierName: string;
}

export interface ItemListItem extends Item {
  price: ItemListPriceSummary | null;
}

export interface ItemList {
  items: ItemListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ItemPriceSummaryBatchItem {
  itemId: number;
  price: ItemListPriceSummary | null;
}

export interface ItemPriceSummaryBatch {
  items: ItemPriceSummaryBatchItem[];
}

export interface ItemsOverview {
  totalItems: number;
  purchasedItems: number;
  supplierCount: number;
  transactionCount: number;
  priceIncreases: number;
  priceDecreases: number;
  latestAtHistoricalHigh: number;
}

export interface ItemActivity {
  id: number;
  type: ProcurementActivityType;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  actorUserId: number;
  actorName: string;
  createdAtUtc: string;
}

