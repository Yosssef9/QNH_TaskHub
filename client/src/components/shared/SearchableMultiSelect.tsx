import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'

export type SelectValue = string | number

export interface SearchableSelectOption {
  value: SelectValue
  label: string
  description?: string
  disabled?: boolean
}

interface CommonSearchableSelectProps {
  options: readonly SearchableSelectOption[]
  selectedOptions?: readonly SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  noResultsText?: string
  error?: string
  disabled?: boolean
  disableClear?: boolean
  maxVisibleBadges?: number
  searchValue?: string
  onSearchChange?: (value: string) => void
  onLoadMore?: () => void
  hasMore?: boolean
  loading?: boolean
  className?: string
  ariaLabel?: string
}

interface SingleSelectProps extends CommonSearchableSelectProps {
  multiple?: false
  value: SelectValue | null
  onChange: (value: SelectValue | null) => void
}

interface MultiSelectProps extends CommonSearchableSelectProps {
  multiple: true
  values: readonly SelectValue[]
  onChange: (values: SelectValue[]) => void
}

export type SearchableMultiSelectProps = SingleSelectProps | MultiSelectProps

function valueKey(value: SelectValue): string {
  return `${typeof value}:${String(value)}`
}

export function SearchableMultiSelect(props: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const errorId = `${useId()}-error`
  const selectedValues = props.multiple ? props.values : props.value === null ? [] : [props.value]
  const actualSearch = props.searchValue ?? localSearch
  const maxVisibleBadges = Math.max(1, props.maxVisibleBadges ?? 2)

  const optionsByKey = useMemo(
    () =>
      new Map(
        [...(props.selectedOptions ?? []), ...props.options].map((option) => [
          valueKey(option.value),
          option,
        ]),
      ),
    [props.options, props.selectedOptions],
  )
  const selectedOptions = selectedValues
    .map((selectedValue) => optionsByKey.get(valueKey(selectedValue)))
    .filter((option): option is SearchableSelectOption => Boolean(option))

  function resetSearch() {
    setLocalSearch('')
    props.onSearchChange?.('')
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) resetSearch()
  }

  function updateSearch(nextSearch: string) {
    if (props.onSearchChange) props.onSearchChange(nextSearch)
    else setLocalSearch(nextSearch)
  }

  function toggleOption(option: SearchableSelectOption) {
    if (props.multiple) {
      const optionKey = valueKey(option.value)
      const exists = props.values.some((selectedValue) => valueKey(selectedValue) === optionKey)
      props.onChange(
        exists
          ? props.values.filter((selectedValue) => valueKey(selectedValue) !== optionKey)
          : [...props.values, option.value],
      )
      return
    }

    props.onChange(option.value)
    changeOpen(false)
  }

  function clearSelection() {
    if (props.multiple) props.onChange([])
    else props.onChange(null)
  }

  const visibleLabels = selectedOptions.slice(0, maxVisibleBadges).map((option) => option.label)
  const hiddenCount = Math.max(0, selectedOptions.length - visibleLabels.length)
  const triggerText =
    visibleLabels.length === 0
      ? (props.placeholder ?? 'Select option')
      : `${visibleLabels.join(', ')}${hiddenCount > 0 ? ` +${hiddenCount}` : ''}`

  return (
    <div className={props.className}>
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-label={props.ariaLabel ?? props.placeholder ?? 'Select option'}
            aria-expanded={open}
            aria-invalid={Boolean(props.error)}
            aria-describedby={props.error ? errorId : undefined}
            disabled={props.disabled}
            className={cn(
              'w-full justify-between overflow-hidden font-normal',
              selectedOptions.length === 0 && 'text-muted-foreground',
              props.error && 'border-destructive',
            )}
          >
            <span className="truncate">{triggerText}</span>
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command
            label={props.ariaLabel ?? props.placeholder ?? 'Select option'}
            shouldFilter={!props.onSearchChange}
          >
            <CommandInput
              value={actualSearch}
              placeholder={props.searchPlaceholder ?? 'Search…'}
              onValueChange={updateSearch}
            />
            <CommandList
              label="Options"
              onScroll={(event) => {
                const element = event.currentTarget
                const nearBottom =
                  element.scrollHeight - element.scrollTop - element.clientHeight < 64
                if (nearBottom && props.hasMore && !props.loading) props.onLoadMore?.()
              }}
            >
              {props.loading ? (
                <CommandLoading className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-sm">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  Loading…
                </CommandLoading>
              ) : null}
              {!props.loading ? (
                <CommandEmpty>{props.noResultsText ?? 'No results found'}</CommandEmpty>
              ) : null}
              {props.options.map((option) => {
                const selected = selectedValues.some(
                  (selectedValue) => valueKey(selectedValue) === valueKey(option.value),
                )

                return (
                  <CommandItem
                    key={valueKey(option.value)}
                    value={valueKey(option.value)}
                    keywords={[option.label, option.description ?? '']}
                    {...(option.disabled === undefined ? {} : { disabled: option.disabled })}
                    onSelect={() => toggleOption(option)}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                        selected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-input',
                      )}
                    >
                      {selected ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.description ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                )
              })}
              {props.hasMore && !props.loading ? (
                <p className="text-muted-foreground px-3 py-2 text-center text-xs">
                  Scroll to load more
                </p>
              ) : null}
            </CommandList>
            {selectedValues.length > 0 && !props.disableClear ? (
              <div className="border-t p-2">
                <Button variant="ghost" size="sm" className="w-full" onClick={clearSelection}>
                  <X aria-hidden="true" className="size-3.5" />
                  Clear selection
                </Button>
              </div>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>
      {props.error ? (
        <p id={errorId} role="alert" className="text-destructive mt-1.5 text-xs font-medium">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}
