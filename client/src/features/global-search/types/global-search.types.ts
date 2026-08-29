export type GlobalSearchResultType =
  | 'TASK'
  | 'SUBTASK'
  | 'WORK_CYCLE'
  | 'KPI_INSTANCE'
  | 'KPI_TEMPLATE'
  | 'LIST'

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
