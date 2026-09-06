export type SupplierSource = "ORACLE" | "MANUAL";
export type SupplierSortBy = "code" | "name" | "country" | "city" | "currency" | "contracts" | "purchasedItems" | "transactions" | "lastPurchase";
export type SortDirection = "asc" | "desc";
export type ProcurementActivityType = "CREATED" | "UPDATED" | "DEACTIVATED" | "REACTIVATED";

export interface Supplier {
  id: number;
  code: string;
  manualFileNo: string | null;
  name: string;
  nameSecondary: string | null;
  taxRegistrationNo: string | null;
  countryName: string | null;
  cityName: string | null;
  currency: string | null;
  contactJobTel: string | null;
  extensionNo: string | null;
  mobileNo: string | null;
  homePhone: string | null;
  email: string | null;
  source: SupplierSource;
  currentContractCount: number;
  expiringSoonContractCount: number;
  purchasedItemCount: number;
  transactionCount: number;
  lastPurchaseDate: string | null;
}

export interface SupplierInput {
  manualFileNo: string | null;
  name: string;
  nameSecondary: string | null;
  taxRegistrationNo: string | null;
  countryName: string | null;
  cityName: string | null;
  currency: string | null;
  contactJobTel: string | null;
  extensionNo: string | null;
  mobileNo: string | null;
  homePhone: string | null;
  email: string | null;
}

export interface SupplierListQuery {
  search?: string | undefined;
  page: number;
  pageSize: number;
  source?: SupplierSource | undefined;
  sortBy: SupplierSortBy;
  sortDirection: SortDirection;
}

export interface SupplierList {
  items: Supplier[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SupplierOption {
  id: number;
  code: string;
  name: string;
}

export interface SupplierOptionQuery {
  search?: string | undefined;
  page: number;
  pageSize: number;
  source?: SupplierSource | undefined;
}

export interface SupplierOptionList {
  items: SupplierOption[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SupplierActivity {
  id: number;
  type: ProcurementActivityType;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  actorUserId: number;
  actorName: string;
  createdAtUtc: string;
}

