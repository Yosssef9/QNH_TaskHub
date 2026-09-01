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
  tone?: 'default' | 'soft-primary'
}

export function SortableHeader<TColumn extends string>({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
  className,
  tone = 'default',
  ...props
}: SortableHeaderProps<TColumn>) {
  const active = sortColumn === column
  const ariaSort = active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
  const primaryTone = tone === 'soft-primary'

  return (
    <th
      aria-sort={ariaSort}
      className={cn(
        'border-b px-4 py-3 text-start',
        primaryTone && 'border-primary/20 bg-primary/[0.09] border-b-2 py-4',
        className,
      )}
      {...props}
    >
      <button
        type="button"
        className={cn(
          'focus-visible:ring-ring inline-flex w-full items-center justify-between gap-2 rounded-md outline-none focus-visible:ring-2',
          primaryTone
            ? 'text-foreground/80 hover:bg-primary/10 hover:text-primary px-1.5 py-1 text-xs font-semibold'
            : 'hover:text-foreground text-muted-foreground text-xs font-semibold uppercase tracking-wide',
          active && primaryTone && 'text-primary',
        )}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        {active ? (
          sortDirection === 'asc' ? (
            <ArrowUp aria-hidden="true" className="text-primary size-3.5" />
          ) : (
            <ArrowDown aria-hidden="true" className="text-primary size-3.5" />
          )
        ) : (
          <ArrowUpDown
            aria-hidden="true"
            className={cn('size-3.5', primaryTone && 'text-muted-foreground/55')}
          />
        )}
      </button>
    </th>
  )
}
