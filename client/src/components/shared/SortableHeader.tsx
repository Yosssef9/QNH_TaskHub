import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { ThHTMLAttributes } from 'react'

import type { SortDirection } from '@/hooks/use-sort-state'
import { cn } from '@/lib/cn'

export interface SortableHeaderProps<TColumn extends string> extends Omit<
  ThHTMLAttributes<HTMLTableCellElement>,
  'onClick'
> {
  label: string
  column: TColumn
  sortColumn: TColumn | null
  sortDirection: SortDirection
  onSort: (column: TColumn) => void
}

export function SortableHeader<TColumn extends string>({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
  className,
  ...props
}: SortableHeaderProps<TColumn>) {
  const active = sortColumn === column
  const ariaSort = active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'

  return (
    <th aria-sort={ariaSort} className={cn('border-b px-4 py-3 text-start', className)} {...props}>
      <button
        type="button"
        className="hover:text-foreground focus-visible:ring-ring text-muted-foreground inline-flex w-full items-center justify-between gap-2 rounded-sm text-xs font-semibold tracking-wide uppercase outline-none focus-visible:ring-2"
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        {active ? (
          sortDirection === 'asc' ? (
            <ArrowUp aria-hidden="true" className="size-3.5" />
          ) : (
            <ArrowDown aria-hidden="true" className="size-3.5" />
          )
        ) : (
          <ArrowUpDown aria-hidden="true" className="size-3.5" />
        )}
      </button>
    </th>
  )
}
