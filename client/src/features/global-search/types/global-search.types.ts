export type GlobalSearchResultType =
  | 'TASK'
  | 'SUBTASK'
  | 'WORK_CYCLE'
  | 'KPI_INSTANCE'
  | 'KPI_TEMPLATE'
  | 'LIST'
  | 'MEETING'
  | 'MEETING_SERIES'
  | 'CONTRACT'
  | 'SUPPLIER'
  | 'ITEM'
  | 'PRICE_QUOTE'

export interface GlobalSearchResult {
  type: GlobalSearchResultType
  id: number
  title: string
  subtitle: string | null
  href: string
  isCurrentContext: boolean
}

export interface GlobalSearchData {
  query: string
  results: GlobalSearchResult[]
}
