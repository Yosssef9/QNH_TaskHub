export const SEARCH_RESULT_TYPES = [
  "TASK",
  "SUBTASK",
  "WORK_CYCLE",
  "KPI_INSTANCE",
  "KPI_TEMPLATE",
  "LIST",
  "MEETING",
  "MEETING_SERIES",
  "CONTRACT",
  "SUPPLIER",
  "ITEM",
  "PRICE_QUOTE",
] as const;

export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export interface SearchAccessScope {
  includeKpiWorkCycles: boolean;
  canCoordinateMeetings: boolean;
  includeContracts: boolean;
  includeSuppliers: boolean;
  includeItems: boolean;
  includePriceQuotes: boolean;
}

export interface GlobalSearchResult {
  type: SearchResultType;
  id: number;
  title: string;
  subtitle: string | null;
  href: string;
  isCurrentContext: boolean;
}

export interface GlobalSearchData {
  query: string;
  results: GlobalSearchResult[];
}
