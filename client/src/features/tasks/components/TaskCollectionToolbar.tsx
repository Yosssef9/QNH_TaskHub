import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ListFilter,
  ListTree,
  X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { SearchInput } from '@/components/shared/SearchInput'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/cn'

export interface TaskCollectionToolbarOption {
  value: string
  label: ReactNode
  triggerLabel?: ReactNode
}

export interface TaskCollectionToolbarFilterChip {
  key: string
  label: string
  onRemove: () => void
  removeLabel: string
}

interface TaskCollectionToolbarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchAriaLabel: string
  searchPlaceholder: string

  filterButtonLabel: string
  filterTitle: string
  filterDescription?: string
  filterCount: number
  filterContent: ReactNode
  clearFiltersLabel: string
  onClearFilters: () => void
  closeLabel: string

  groupValue: string
  groupLabel: string
  groupOptions: TaskCollectionToolbarOption[]
  onGroupChange: (value: string) => void

  sortValue: string
  sortLabel: string
  sortOptions: TaskCollectionToolbarOption[]
  onSortChange: (value: string) => void
  sortDirection: 'asc' | 'desc'
  onSortDirectionChange: (direction: 'asc' | 'desc') => void
  sortDirectionLabel: string
  ascendingLabel: string
  descendingLabel: string

  activeFilters?: TaskCollectionToolbarFilterChip[]
  activeFiltersLabel?: string
  trailingAction?: ReactNode
  className?: string
}

function FilterChip({ filter }: { filter: TaskCollectionToolbarFilterChip }) {
  return (
    <button
      type="button"
      title={filter.label}
      aria-label={filter.removeLabel}
      onClick={filter.onRemove}
      className="bg-primary/[0.06] text-primary hover:bg-primary/10 focus-visible:ring-ring inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-primary/15 px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="max-w-56 truncate">{filter.label}</span>
      <X aria-hidden="true" className="size-3.5 shrink-0" />
    </button>
  )
}

export function TaskCollectionToolbar({
  searchValue,
  onSearchChange,
  searchAriaLabel,
  searchPlaceholder,
  filterButtonLabel,
  filterTitle,
  filterDescription,
  filterCount,
  filterContent,
  clearFiltersLabel,
  onClearFilters,
  closeLabel,
  groupValue,
  groupLabel,
  groupOptions,
  onGroupChange,
  sortValue,
  sortLabel,
  sortOptions,
  onSortChange,
  sortDirection,
  onSortDirectionChange,
  sortDirectionLabel,
  ascendingLabel,
  descendingLabel,
  activeFilters = [],
  activeFiltersLabel,
  trailingAction,
  className,
}: TaskCollectionToolbarProps) {
  const isDesktopFilters = useMediaQuery('(min-width: 768px)')
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const selectedGroup = groupOptions.find((option) => option.value === groupValue)
  const selectedSort = sortOptions.find((option) => option.value === sortValue)

  const filterTrigger = (
    <Button
      variant="outline"
      className={cn(
        'h-10 whitespace-nowrap',
        filterCount > 0 && 'border-primary/30 bg-primary/[0.04]',
      )}
      aria-label={filterButtonLabel}
      onClick={!isDesktopFilters ? () => setFilterDrawerOpen(true) : undefined}
    >
      <ListFilter className="size-4 shrink-0" />
      <span>{filterButtonLabel}</span>
      {filterCount > 0 ? (
        <span className="bg-primary text-primary-foreground grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums">
          {filterCount}
        </span>
      ) : null}
    </Button>
  )

  return (
    <>
      <div className={cn('bg-muted/20 rounded-xl border p-3', className)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={searchValue}
            onChange={onSearchChange}
            ariaLabel={searchAriaLabel}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 lg:min-w-72"
          />

          <div className="flex flex-wrap items-center gap-2">
            {isDesktopFilters ? (
              <Popover>
                <PopoverTrigger asChild>{filterTrigger}</PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={8}
                  className="w-[min(36rem,calc(100vw-2rem))] p-4"
                >
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{filterTitle}</h3>
                      {filterDescription ? (
                        <p className="text-muted-foreground mt-1 text-xs leading-5">
                          {filterDescription}
                        </p>
                      ) : null}
                    </div>
                    {filterCount > 0 ? (
                      <Button size="sm" variant="ghost" onClick={onClearFilters}>
                        {clearFiltersLabel}
                      </Button>
                    ) : null}
                  </div>
                  {filterContent}
                </PopoverContent>
              </Popover>
            ) : (
              filterTrigger
            )}

            <Select value={groupValue} onValueChange={onGroupChange}>
              <SelectTrigger
                className="h-10 w-auto min-w-[9.5rem] max-w-[13rem]"
                aria-label={groupLabel}
              >
                <SelectValue>
                  <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                    <ListTree className="text-muted-foreground size-4 shrink-0" />
                    <span className="truncate">
                      {selectedGroup?.triggerLabel ?? selectedGroup?.label ?? groupLabel}
                    </span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 min-w-0 max-w-[13rem] whitespace-nowrap"
                  aria-label={sortLabel}
                >
                  <ArrowUpDown className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate">
                    {selectedSort?.triggerLabel ?? selectedSort?.label ?? sortLabel}
                  </span>
                  {sortDirection === 'asc' ? (
                    <ArrowUp className="size-3.5 shrink-0" />
                  ) : (
                    <ArrowDown className="size-3.5 shrink-0" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} className="w-64 p-2">
                <p className="text-muted-foreground px-2 pb-1.5 pt-1 text-xs font-medium">
                  {sortLabel}
                </p>
                <div className="space-y-0.5">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        'hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-sm outline-none',
                        sortValue === option.value && 'bg-primary/[0.06] text-primary',
                      )}
                      onClick={() => onSortChange(option.value)}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {sortValue === option.value ? <Check className="size-4 shrink-0" /> : null}
                    </button>
                  ))}
                </div>

                <div className="mt-2 border-t px-2 pt-3">
                  <p className="text-muted-foreground mb-2 text-xs font-medium">
                    {sortDirectionLabel}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant={sortDirection === 'asc' ? 'outline' : 'ghost'}
                      onClick={() => onSortDirectionChange('asc')}
                    >
                      <ArrowUp className="size-3.5" />
                      {ascendingLabel}
                    </Button>
                    <Button
                      size="sm"
                      variant={sortDirection === 'desc' ? 'outline' : 'ghost'}
                      onClick={() => onSortDirectionChange('desc')}
                    >
                      <ArrowDown className="size-3.5" />
                      {descendingLabel}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {trailingAction}
          </div>
        </div>

        {activeFilters.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            {activeFiltersLabel ? (
              <span className="text-muted-foreground me-1 text-xs font-medium">
                {activeFiltersLabel}
              </span>
            ) : null}
            {activeFilters.map((filter) => (
              <FilterChip key={filter.key} filter={filter} />
            ))}
            <Button size="sm" variant="ghost" className="ms-auto" onClick={onClearFilters}>
              {clearFiltersLabel}
            </Button>
          </div>
        ) : null}
      </div>

      {!isDesktopFilters ? (
        <Dialog open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
          <DialogContent
            variant="drawer"
            closeLabel={closeLabel}
            className="w-[min(23rem,92vw)]"
          >
            <div className="p-5 pe-12">
              <DialogTitle>{filterTitle}</DialogTitle>
              {filterDescription ? (
                <DialogDescription className="text-muted-foreground mt-1 text-sm leading-6">
                  {filterDescription}
                </DialogDescription>
              ) : null}

              <div className="mt-6">{filterContent}</div>

              <div className="mt-6 flex items-center justify-between gap-2 border-t pt-4">
                <Button
                  variant="ghost"
                  disabled={filterCount === 0}
                  onClick={onClearFilters}
                >
                  {clearFiltersLabel}
                </Button>
                <Button onClick={() => setFilterDrawerOpen(false)}>{closeLabel}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
