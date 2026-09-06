export type SavedViewPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL'
export type SavedViewSortDirection = 'asc' | 'desc'

export interface ProcurementSavedViewConfig {
  itemIds: number[]
  supplierIds: number[]
  period: SavedViewPeriod
  category: string | null
  source: 'ORACLE' | 'MANUAL' | null
  statusCode: number | null
  sortBy: string | null
  sortDirection: SavedViewSortDirection
  columns: string[]
}
export interface ProcurementSavedView {
  id: number
  name: string
  config: ProcurementSavedViewConfig
  isDefault: boolean
  createdAtUtc: string
  updatedAtUtc: string
  rowVersion: string
}
export interface ProcurementSavedViewSelection { id: number; code: string; name: string }
export interface ProcurementSavedViewDetail extends ProcurementSavedView {
  selectedItems: ProcurementSavedViewSelection[]
  selectedSuppliers: ProcurementSavedViewSelection[]
}
export interface ProcurementSavedViewInput {
  name: string
  config: ProcurementSavedViewConfig
  isDefault: boolean
}
