import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

interface IconPickerProps<K extends string> {
  value: K
  options: readonly K[]
  icons: Record<K, LucideIcon>
  onChange: (value: K) => void
  getLabel: (value: K) => string
  searchLabel: string
  searchPlaceholder: string
  clearSearchLabel: string
  noResultsText: string
  selectedLabel: string
  accentColor?: string
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function IconPicker<K extends string>({
  value,
  options,
  icons,
  onChange,
  getLabel,
  searchLabel,
  searchPlaceholder,
  clearSearchLabel,
  noResultsText,
  selectedLabel,
  accentColor,
}: IconPickerProps<K>) {
  const [search, setSearch] = useState('')
  const SelectedIcon = icons[value]

  const filteredOptions = useMemo(() => {
    const query = normalizeSearchValue(search)
    if (!query) return options

    return options.filter((option) => {
      const label = normalizeSearchValue(getLabel(option))
      const key = normalizeSearchValue(option.replaceAll('-', ' '))
      return label.includes(query) || key.includes(query)
    })
  }, [getLabel, options, search])

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <div
          className="bg-muted grid size-10 shrink-0 place-items-center rounded-xl border"
          style={accentColor ? { color: accentColor } : undefined}
        >
          <SelectedIcon aria-hidden="true" className="size-5" />
        </div>

        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />

          <Input
            type="search"
            value={search}
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            className="h-9 ps-9 pe-9"
            onChange={(event) => setSearch(event.target.value)}
          />

          {search ? (
            <button
              type="button"
              aria-label={clearSearchLabel}
              className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring absolute end-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => setSearch('')}
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
        <span>{selectedLabel}</span>
        <span className="truncate font-medium">{getLabel(value)}</span>
      </div>

      <div className="bg-muted/20 max-h-52 overflow-y-auto overscroll-contain rounded-xl border p-2">
        {filteredOptions.length > 0 ? (
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {filteredOptions.map((option) => {
              const Icon = icons[option]
              const label = getLabel(option)
              const selected = option === value

              return (
                <Tooltip key={option}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={label}
                      aria-pressed={selected}
                      className={cn(
                        'focus-visible:ring-ring grid aspect-square min-w-0 place-items-center rounded-lg border transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:outline-none',
                        selected
                          ? 'border-primary bg-primary/10 text-primary ring-primary/20 ring-2'
                          : 'bg-background/70 text-muted-foreground hover:bg-accent hover:text-foreground hover:-translate-y-0.5',
                      )}
                      onClick={() => onChange(option)}
                    >
                      <Icon aria-hidden="true" className="size-5" />
                    </button>
                  </TooltipTrigger>

                  <TooltipContent side="top">{label}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        ) : (
          <div className="text-muted-foreground flex min-h-24 items-center justify-center px-4 text-center text-sm">
            {noResultsText}
          </div>
        )}
      </div>
    </div>
  )
}
