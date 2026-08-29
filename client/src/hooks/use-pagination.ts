import { useCallback, useMemo, useState } from 'react'

function positiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export interface PaginationState {
  page: number
  pageSize: number
  totalPages: number
  startRow: number
  endRow: number
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  resetPage: () => void
}

export function usePagination(totalRows: number, initialPageSize = 25): PaginationState {
  const safeTotalRows = Math.max(0, Math.trunc(totalRows))
  const [requestedPage, setRequestedPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(() => positiveInteger(initialPageSize, 25))
  const totalPages = Math.max(1, Math.ceil(safeTotalRows / pageSize))
  const page = Math.min(requestedPage, totalPages)

  const setPage = useCallback(
    (nextPage: number) => {
      setRequestedPage(Math.min(positiveInteger(nextPage, 1), totalPages))
    },
    [totalPages],
  )

  const setPageSize = useCallback((nextPageSize: number) => {
    setPageSizeState(positiveInteger(nextPageSize, 25))
    setRequestedPage(1)
  }, [])

  const resetPage = useCallback(() => setRequestedPage(1), [])

  return useMemo(
    () => ({
      page,
      pageSize,
      totalPages,
      startRow: safeTotalRows === 0 ? 0 : (page - 1) * pageSize + 1,
      endRow: Math.min(page * pageSize, safeTotalRows),
      setPage,
      setPageSize,
      resetPage,
    }),
    [page, pageSize, resetPage, safeTotalRows, setPage, setPageSize, totalPages],
  )
}
