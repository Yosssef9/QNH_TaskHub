import { Check, ChevronsUpDown, CircleAlert, Loader2, RotateCcw, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  selectedSummaryText?: string
  pinSelectedOptions?: boolean
  selectedSectionLabel?: string
  optionsSectionLabel?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  onOpenChange?: (open: boolean) => void
  onLoadMore?: () => void
  hasMore?: boolean
  loading?: boolean
  loadingMore?: boolean
  loadErrorText?: string
  onRetry?: () => void
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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const errorId = `${useId()}-error`
  const selectedValues = props.multiple ? props.values : props.value === null ? [] : [props.value]
  const actualSearch = props.searchValue ?? localSearch
  const serverDriven = Boolean(props.onSearchChange)
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
  const selectedKeys = new Set(selectedValues.map(valueKey))
  const pinSelected = Boolean(props.multiple && props.pinSelectedOptions)
  const remainingOptions = pinSelected
    ? props.options.filter((option) => !selectedKeys.has(valueKey(option.value)))
    : props.options

  function resetSearch() {
    setLocalSearch('')
    props.onSearchChange?.('')
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    props.onOpenChange?.(nextOpen)
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
  const triggerText = selectedValues.length > 0 && props.selectedSummaryText
    ? props.selectedSummaryText
    : visibleLabels.length > 0
      ? `${visibleLabels.join(', ')}${hiddenCount > 0 ? ` +${hiddenCount}` : ''}`
      : selectedValues.length > 0
        ? t('common.selectedCount', { count: selectedValues.length })
        : (props.placeholder ?? 'Select option')

  function renderOption(option: SearchableSelectOption) {
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
  }

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
                if (nearBottom && props.hasMore && !props.loading && !props.loadingMore) props.onLoadMore?.()
              }}
            >
              {props.loading && props.options.length === 0 ? (
                <CommandLoading className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-sm">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  {t('common.loading')}
                </CommandLoading>
              ) : null}
              {!serverDriven && !props.loading ? (
                <CommandEmpty>{props.noResultsText ?? 'No results found'}</CommandEmpty>
              ) : null}
              {serverDriven && props.loadErrorText ? (
                <div className="mx-2 my-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CircleAlert aria-hidden="true" className="text-destructive mt-0.5 size-4 shrink-0" />
                    <p className="text-muted-foreground min-w-0 flex-1 leading-5">{props.loadErrorText}</p>
                  </div>
                  {props.onRetry ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-8"
                      onClick={() => props.onRetry?.()}
                    >
                      <RotateCcw aria-hidden="true" className="size-3.5" />
                      {t('common.retry')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {serverDriven && !props.loading && !props.loadErrorText && props.options.length === 0 && selectedOptions.length === 0 ? (
                <p className="text-muted-foreground px-3 py-4 text-center text-sm">
                  {props.noResultsText ?? 'No results found'}
                </p>
              ) : null}
              {pinSelected && selectedOptions.length > 0 ? (
                <>
                  {props.selectedSectionLabel ? (
                    <div className="text-muted-foreground sticky top-0 z-10 bg-popover px-3 py-2 text-[11px] font-semibold uppercase tracking-wide">
                      {props.selectedSectionLabel} · {selectedOptions.length}
                    </div>
                  ) : null}
                  {selectedOptions.map(renderOption)}
                  {props.optionsSectionLabel ? (
                    <div className="text-muted-foreground sticky top-0 z-10 border-t bg-popover px-3 py-2 text-[11px] font-semibold uppercase tracking-wide">
                      {props.optionsSectionLabel}
                    </div>
                  ) : null}
                  {remainingOptions.map(renderOption)}
                  {!props.loading && !props.loadErrorText && remainingOptions.length === 0 && actualSearch.trim() ? (
                    <p className="text-muted-foreground px-3 py-4 text-center text-sm">
                      {props.noResultsText ?? 'No results found'}
                    </p>
                  ) : null}
                </>
              ) : (
                props.options.map(renderOption)
              )}
              {props.loadingMore ? (
                <div className="text-muted-foreground flex items-center justify-center gap-2 px-3 py-3 text-xs">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : null}
            </CommandList>
            {selectedValues.length > 0 && !props.disableClear ? (
              <div className="border-t p-2">
                <Button variant="ghost" size="sm" className="w-full" onClick={clearSelection}>
                  <X aria-hidden="true" className="size-3.5" />
                  {t('common.clearSelection')}
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
