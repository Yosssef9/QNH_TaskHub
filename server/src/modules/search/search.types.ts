export const SEARCH_RESULT_TYPES = [
  "TASK",
  "SUBTASK",
  "WORK_CYCLE",
  "KPI_INSTANCE",
  "KPI_TEMPLATE",
  "LIST",
] as const;

export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

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
