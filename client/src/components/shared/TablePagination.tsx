import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export interface TablePaginationProps {
  page: number
  totalPages: number
  pageSize: number
  startRow: number
  endRow: number
  totalRows: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  pageSizes?: readonly number[]
  className?: string
}

export function TablePagination({
  page,
  totalPages,
  pageSize,
  startRow,
  endRow,
  totalRows,
  onPageChange,
  onPageSizeChange,
  pageSizes = [25, 50, 100],
  className,
}: TablePaginationProps) {
  const { i18n, t } = useTranslation()
  const isRtl = i18n.dir() === 'rtl'
  const PreviousIcon = isRtl ? ChevronRight : ChevronLeft
  const NextIcon = isRtl ? ChevronLeft : ChevronRight
  const safeTotalPages = Math.max(1, totalPages)
  const safePage = Math.min(Math.max(1, page), safeTotalPages)

  return (
    <nav
      aria-label={t('pagination.label')}
      className={cn(
        'flex flex-col gap-4 border-t p-4 lg:flex-row lg:items-center lg:justify-between',
        className,
      )}
    >
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {t('pagination.summary', {
          start: startRow,
          end: endRow,
          total: Math.max(0, totalRows),
        })}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground me-1 text-xs font-medium">
          {t('pagination.rowsPerPage')}
        </span>
        {pageSizes.map((size) => (
          <Button
            key={size}
            size="sm"
            variant={pageSize === size ? 'default' : 'outline'}
            aria-pressed={pageSize === size}
            onClick={() => onPageSizeChange(size)}
          >
            {size}
          </Button>
        ))}

        <Button
          size="icon"
          variant="outline"
          aria-label={t('pagination.previous')}
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          <PreviousIcon aria-hidden="true" className="size-4" />
        </Button>

        <span className="min-w-24 text-center text-sm font-medium">
          {t('pagination.pageOf', { page: safePage, totalPages: safeTotalPages })}
        </span>

        <Button
          size="icon"
          variant="outline"
          aria-label={t('pagination.next')}
          disabled={safePage >= safeTotalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          <NextIcon aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </nav>
  )
}
