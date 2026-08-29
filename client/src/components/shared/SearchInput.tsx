import { Search, X } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  debounceMs?: number
  className?: string
  autoFocus?: boolean
  disabled?: boolean
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  ariaLabel = 'Search',
  debounceMs = 300,
  className,
  autoFocus = false,
  disabled = false,
}: SearchInputProps) {
  const { t } = useTranslation()
  const [localValue, setLocalValue] = useState(value)
  const [previousValue, setPreviousValue] = useState(value)
  const emitChange = useEffectEvent(onChange)

  if (value !== previousValue) {
    setPreviousValue(value)
    setLocalValue(value)
  }

  useEffect(() => {
    if (localValue === value) return

    const timer = setTimeout(() => emitChange(localValue), Math.max(0, debounceMs))
    return () => clearTimeout(timer)
  }, [debounceMs, localValue, value])

  function updateValue(nextValue: string) {
    setLocalValue(nextValue)
  }

  function clearSearch() {
    setLocalValue('')
    onChange('')
  }

  return (
    <div className={cn('relative w-full', className)}>
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        disabled={disabled}
        value={localValue}
        placeholder={placeholder}
        className="ps-9 pe-10 [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => updateValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && localValue) clearSearch()
        }}
      />
      {localValue ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('common.clearSearch')}
          className="absolute end-0.5 top-1/2 size-9 -translate-y-1/2"
          onClick={clearSearch}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}
