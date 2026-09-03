import {
  Check,
  ChevronDown,
  Loader2,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'

interface MeetingParticipantPickerProps {
  values: readonly number[]
  options: readonly SearchableSelectOption[]
  selectedOptions: readonly SearchableSelectOption[]
  searchValue: string
  participantCount: number
  roomCapacity?: number | null
  loading?: boolean
  loadingMore?: boolean
  hasMore?: boolean
  disabled?: boolean
  onSearchChange: (value: string) => void
  onLoadMore: () => void
  onChange: (values: number[]) => void
}

function valueKey(value: string | number): string {
  return `${typeof value}:${String(value)}`
}

function initials(option: SearchableSelectOption): string {
  const parts = option.label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return String(option.description ?? option.value).slice(0, 2).toUpperCase()
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

const avatarClasses = [
  'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  'bg-amber-500/10 text-amber-700 dark:text-amber-300',
] as const

function avatarClass(option: SearchableSelectOption): string {
  const text = String(option.value)
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return avatarClasses[hash % avatarClasses.length] ?? avatarClasses[0]
}

export function MeetingParticipantPicker({
  values,
  options,
  selectedOptions: suppliedSelectedOptions,
  searchValue,
  participantCount,
  roomCapacity = null,
  loading = false,
  loadingMore = false,
  hasMore = false,
  disabled = false,
  onSearchChange,
  onLoadMore,
  onChange,
}: MeetingParticipantPickerProps) {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const listId = `${useId()}-participant-list`
  const optionsByKey = useMemo(
    () =>
      new Map(
        [...suppliedSelectedOptions, ...options].map((option) => [
          valueKey(option.value),
          option,
        ]),
      ),
    [options, suppliedSelectedOptions],
  )

  const selectedOptions = useMemo(
    () =>
      values
        .map((value) => optionsByKey.get(valueKey(value)))
        .filter((option): option is SearchableSelectOption => Boolean(option)),
    [optionsByKey, values],
  )

  const selectedKeys = useMemo(
    () => new Set(values.map((value) => valueKey(value))),
    [values],
  )
  const visibleSelected = selectedOptions.slice(0, 3)
  const hiddenSelectedCount = Math.max(0, selectedOptions.length - visibleSelected.length)
  const overCapacity = roomCapacity !== null && participantCount > roomCapacity

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen && searchValue) onSearchChange('')
  }

  function toggleOption(option: SearchableSelectOption) {
    const numericValue = Number(option.value)
    if (!Number.isFinite(numericValue)) return
    const key = valueKey(option.value)
    onChange(
      selectedKeys.has(key)
        ? values.filter((value) => valueKey(value) !== key)
        : [...values, numericValue],
    )
  }

  function removeOption(option: SearchableSelectOption) {
    const key = valueKey(option.value)
    onChange(values.filter((value) => valueKey(value) !== key))
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border bg-background shadow-xs',
          open ? 'border-primary ring-2 ring-primary/10' : 'border-input',
          disabled && 'opacity-60',
        )}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-label={t('meetings.fields.attendees')}
            aria-expanded={open}
            aria-controls={listId}
            disabled={disabled}
            className="focus-visible:ring-ring absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2"
          />
        </PopoverTrigger>

        <div className="pointer-events-none relative z-10 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              {selectedOptions.length === 0 ? (
                <span className="text-muted-foreground truncate text-sm">
                  {t('meetings.fields.attendeesPlaceholder')}
                </span>
              ) : (
                <>
                  {visibleSelected.map((option) => (
                    <span
                      key={valueKey(option.value)}
                      className="bg-muted/70 inline-flex min-w-0 max-w-36 shrink items-center gap-1.5 rounded-full border border-border/60 px-2 py-1 text-xs sm:max-w-40"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                          avatarClass(option),
                        )}
                      >
                        {initials(option)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{option.label}</span>
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={t('meetings.create.removeAttendee', { name: option.label })}
                        className="hover:bg-background focus-visible:ring-ring pointer-events-auto grid size-5 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
                        onClick={() => removeOption(option)}
                      >
                        <X aria-hidden="true" className="size-3" />
                      </button>
                    </span>
                  ))}
                  {hiddenSelectedCount > 0 ? (
                    <span className="bg-primary/8 text-primary grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold">
                      +{hiddenSelectedCount}
                    </span>
                  ) : null}
                </>
              )}
            </div>

            <span className="border-s ps-3">
              <ChevronDown
                aria-hidden="true"
                className={cn('text-muted-foreground size-4', open && 'rotate-180')}
              />
            </span>
          </div>

          <div
            className={cn(
              'text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs',
              overCapacity && 'text-destructive',
            )}
          >
            <UsersRound aria-hidden="true" className="size-3.5 shrink-0" />
            <span>
              {t('meetings.participantPicker.selectedCount', { count: selectedOptions.length })}
            </span>
            {roomCapacity !== null ? (
              <>
                <span aria-hidden="true">•</span>
                <span>{t('meetings.participantPicker.roomCapacity', { capacity: roomCapacity })}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <PopoverContent
        dir={i18n.dir()}
        align="start"
        sideOffset={8}
        className="max-h-[78vh] w-[min(56rem,calc(100vw-2rem))] overflow-y-auto p-0 lg:overflow-hidden"
      >
        <Command
          label={t('meetings.fields.attendees')}
          shouldFilter={false}
          className="min-h-0"
        >
          <CommandInput
            value={searchValue}
            placeholder={t('meetings.fields.attendeesSearch')}
            onValueChange={onSearchChange}
          />

          <div className="grid min-h-0 lg:grid-cols-2">
            <section className="min-w-0">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <p className="text-sm font-semibold">
                  {t('meetings.participantPicker.allActivePortalUsers')}
                </p>
                <span className="text-muted-foreground text-xs">
                  {t('meetings.participantPicker.selectedCount', { count: selectedOptions.length })}
                </span>
              </div>

              <CommandList
                id={listId}
                label={t('meetings.participantPicker.allActivePortalUsers')}
                className="max-h-64 p-2 lg:max-h-[24rem]"
                onScroll={(event) => {
                  const element = event.currentTarget
                  const nearBottom =
                    element.scrollHeight - element.scrollTop - element.clientHeight < 72
                  if (nearBottom && hasMore && !loadingMore && !loading) onLoadMore()
                }}
              >
                {loading && options.length === 0 ? (
                  <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    {t('meetings.participantPicker.loadingUsers')}
                  </div>
                ) : null}

                {!loading && options.length === 0 ? (
                  <div className="text-muted-foreground py-10 text-center text-sm">
                    {t('meetings.fields.noAttendees')}
                  </div>
                ) : null}

                {options.map((option) => {
                  const selected = selectedKeys.has(valueKey(option.value))
                  return (
                    <CommandItem
                      key={valueKey(option.value)}
                      value={valueKey(option.value)}
                      keywords={[option.label, option.description ?? '']}
                      className={cn(
                        'items-center rounded-lg px-3 py-2.5',
                        selected && 'bg-primary/[0.055]',
                      )}
                      onSelect={() => toggleOption(option)}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded border',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input',
                        )}
                      >
                        {selected ? <Check className="size-3.5" /> : null}
                      </span>

                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold',
                          avatarClass(option),
                        )}
                      >
                        {initials(option)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{option.label}</span>
                        {option.description ? (
                          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  )
                })}

                {loadingMore ? (
                  <div className="text-muted-foreground flex items-center justify-center gap-2 px-3 py-3 text-xs">
                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                    {t('meetings.participantPicker.loadingMore')}
                  </div>
                ) : null}

                {hasMore && !loadingMore && !loading ? (
                  <p className="text-muted-foreground px-3 py-2 text-center text-xs">
                    {t('meetings.participantPicker.scrollForMore')}
                  </p>
                ) : null}
              </CommandList>
            </section>

            <section className="min-w-0 border-t lg:border-t-0 lg:border-s">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <p className="text-sm font-semibold">
                  {t('meetings.participantPicker.selectedParticipants', {
                    count: selectedOptions.length,
                  })}
                </p>
              </div>

              <div className="max-h-52 overflow-y-auto p-2 lg:max-h-[24rem]">
                {selectedOptions.length === 0 ? (
                  <div className="text-muted-foreground px-4 py-10 text-center text-sm">
                    {t('meetings.participantPicker.noSelected')}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {selectedOptions.map((option) => (
                      <div
                        key={valueKey(option.value)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold',
                            avatarClass(option),
                          )}
                        >
                          {initials(option)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{option.label}</span>
                          {option.description ? (
                            <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={disabled}
                          aria-label={t('meetings.create.removeAttendee', { name: option.label })}
                          className="text-muted-foreground hover:text-destructive size-8 shrink-0"
                          onClick={() => removeOption(option)}
                        >
                          <X aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={disabled || selectedOptions.length === 0}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onChange([])}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {t('meetings.participantPicker.clearAll')}
            </Button>
            <Button type="button" disabled={disabled} onClick={() => changeOpen(false)}>
              {t('meetings.participantPicker.done')}
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
