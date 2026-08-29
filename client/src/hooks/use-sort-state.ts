import { useCallback, useState } from 'react'

export type SortDirection = 'asc' | 'desc'

export interface SortState<TColumn extends string> {
  sortColumn: TColumn | null
  sortDirection: SortDirection
  handleSort: (column: TColumn) => void
  clearSort: () => void
}

export function useSortState<TColumn extends string>(
  defaultColumn: TColumn | null = null,
  defaultDirection: SortDirection = 'asc',
): SortState<TColumn> {
  const [sortColumn, setSortColumn] = useState<TColumn | null>(defaultColumn)
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection)

  const handleSort = useCallback(
    (column: TColumn) => {
      if (sortColumn === column) {
        setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
        return
      }

      setSortColumn(column)
      setSortDirection('asc')
    },
    [sortColumn],
  )

  const clearSort = useCallback(() => {
    setSortColumn(null)
    setSortDirection(defaultDirection)
  }, [defaultDirection])

  return { sortColumn, sortDirection, handleSort, clearSort }
}
