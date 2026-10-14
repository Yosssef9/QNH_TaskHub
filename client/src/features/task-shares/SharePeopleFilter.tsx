import { Check, ChevronsUpDown, Search, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SharePerson } from './task-shares.api'

/** Single-person filter scoped to actual task-sharing relationships, never all Portal users. */
export function SharePeopleFilter({
  people,
  value,
  onChange,
  disabled = false,
}: {
  people: SharePerson[]
  value: number | null
  onChange: (next: number | null) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = people.find(person => person.userId === value)
  const normalized = search.trim().toLocaleLowerCase()
  const filtered = people.filter(person =>
    [person.userName, person.userCode, person.email ?? ''].some(field => field.toLocaleLowerCase().includes(normalized)),
  )

  function choose(next: number | null) {
    onChange(next)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setSearch('') }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} aria-label={t('taskSharing.filterPeople')}
          aria-expanded={open} className="h-10 w-full min-w-0 justify-between gap-2 px-3 font-normal">
          <span className="flex min-w-0 items-center gap-2">
            <UsersRound className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">{selected?.userName ?? t('taskSharing.allPeople')}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] space-y-2 p-2">
        <div className="relative">
          <Search aria-hidden="true" className="text-muted-foreground absolute top-2.5 start-2.5 size-4" />
          <Input className="ps-8" autoFocus value={search} onChange={event => setSearch(event.target.value)}
            placeholder={t('taskSharing.searchPeople')} aria-label={t('taskSharing.searchPeople')} />
        </div>
        <div role="group" aria-label={t('taskSharing.filterPeople')} className="max-h-64 space-y-1 overflow-y-auto">
          <button type="button" aria-pressed={value === null} onClick={() => choose(null)}
            className="hover:bg-muted focus-visible:bg-muted flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-sm outline-none">
            {t('taskSharing.allPeople')}
            {value === null ? <Check className="size-4 shrink-0" /> : null}
          </button>
          {filtered.map(person => (
            <button type="button" key={person.userId} aria-pressed={person.userId === value}
              className="hover:bg-muted focus-visible:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start outline-none"
              onClick={() => choose(person.userId)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{person.userName}</span>
                <span className="text-muted-foreground block truncate text-xs">{t('tasks.assignment.userCodeLabel', { code: person.userCode })}</span>
                {person.email ? <span dir="ltr" className="text-muted-foreground block truncate text-start text-xs">{person.email}</span> : null}
              </span>
              {value === person.userId ? <Check className="size-4 shrink-0" /> : null}
            </button>
          ))}
          {!filtered.length ? <p className="text-muted-foreground p-3 text-center text-xs">{t('taskSharing.noPeople')}</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
