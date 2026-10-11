import { Check, ChevronsUpDown, Search, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useEligibleTaskUsers, useEligibleTaskUser } from './use-general-assignment'

/** Single-user picker: selected identity stays visible even when search pagination changes. */
export function TaskAssigneePicker({ value, onChange, disabled = false, inherit = false }: {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  inherit?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedName, setSelectedName] = useState<{id:number; name:string} | null>(null)
  const query = useEligibleTaskUsers(search, open, page)
  const selected = query.data?.items.find(user => user.userId === value)
  const byId = useEligibleTaskUser(value)
  const display = value === null
    ? t(inherit ? 'tasks.assignment.inherit' : 'tasks.assignment.unassigned')
    : (selectedName?.id === value ? selectedName.name : null) ?? selected?.userName ?? byId.data?.userName ?? t('tasks.assignment.userCode', { code: value })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}
          className="w-full min-w-0 justify-between gap-2 font-normal" aria-label={t('tasks.assignment.assignTo')}>
          <span className="flex min-w-0 items-center gap-2 truncate"><UserRound className="size-4 shrink-0" /> <span className="truncate">{display}</span></span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-2 p-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 start-2.5 size-4" />
          <Input autoFocus value={search} onChange={event => { setSearch(event.target.value); setPage(1) }}
            className="ps-8" placeholder={t('tasks.assignment.searchUsers')} aria-label={t('tasks.assignment.searchUsers')}/>
        </div>
        <div className="max-h-60 space-y-1 overflow-y-auto" role="listbox" aria-label={t('tasks.assignment.assignTo')}>
          <button type="button" role="option" aria-selected={value === null}
            className="hover:bg-muted focus-visible:bg-muted flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-sm"
            onClick={() => { onChange(null); setSelectedName(null); setOpen(false) }}>
            <span className="flex items-center gap-2"><X className="size-4" /> {t(inherit ? 'tasks.assignment.inherit' : 'tasks.assignment.unassigned')}</span>
            {value === null ? <Check className="size-4" /> : null}
          </button>
          {query.data?.items.map(user => (
            <button type="button" key={user.userId} role="option" aria-selected={value === user.userId}
              className="hover:bg-muted focus-visible:bg-muted flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-sm"
              onClick={() => { onChange(user.userId); setSelectedName({id:user.userId,name:user.userName}); setOpen(false) }}>
              <span className="min-w-0"><span className="block truncate">{user.userName}</span>
                <span className="text-muted-foreground text-xs">{user.userCode}</span></span>
              {value === user.userId ? <Check className="size-4 shrink-0" /> : null}
            </button>
          ))}
          {query.isLoading ? <p className="text-muted-foreground p-2 text-xs">{t('common.loading')}</p> : null}
          {!query.isLoading && !query.data?.items.length ? <p className="text-muted-foreground p-2 text-xs">{t('tasks.assignment.noUsers')}</p> : null}
          {query.isError ? <p className="text-destructive p-2 text-xs">{t('tasks.assignment.searchError')}</p> : null}
        </div>
        <div className="flex items-center justify-between border-t pt-2">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1}
            onClick={() => setPage(current => current-1)}>{t('pagination.previous')}</Button>
          <span className="text-muted-foreground text-xs">{page}</span>
          <Button type="button" size="sm" variant="outline"
            disabled={(query.data?.items.length ?? 0) < 50 || query.isFetching}
            onClick={() => setPage(current => current+1)}>{t('pagination.next')}</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
