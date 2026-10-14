import { Check, ChevronsUpDown, Search, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMeetingActionItemAssignees } from '@/features/meetings/action-items/use-meeting-action-items'

import type { EligibleTaskUser } from './general-assignment.api'
import { matchesTaskAssigneeSearch } from './task-assignee-search'
import { useEligibleTaskUsers, useEligibleTaskUser } from './use-general-assignment'

type DisplayUser = Pick<EligibleTaskUser, 'userId' | 'userName' | 'userCode' | 'email'>

/** Shared task assignee picker. Eligibility remains enforced by each existing API. */
export function TaskAssigneePicker({
  value,
  onChange,
  disabled = false,
  inherit = false,
  meetingId = null,
  allowClear = true,
}: {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  inherit?: boolean
  meetingId?: number | null
  allowClear?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedUser, setSelectedUser] = useState<DisplayUser | null>(null)
  const isMeeting = meetingId !== null
  const generalQuery = useEligibleTaskUsers(search.trim(), open && !isMeeting, page)
  const meetingQuery = useMeetingActionItemAssignees(meetingId, open && isMeeting)
  const available: DisplayUser[] = isMeeting
    ? (meetingQuery.data ?? []).filter(
        (user) => user.eligible && matchesTaskAssigneeSearch(user, search),
      )
    : (generalQuery.data?.items ?? [])
  const byId = useEligibleTaskUser(value)
  const selected = (selectedUser?.userId === value ? selectedUser : null)
    ?? available.find((user) => user.userId === value)
    ?? (byId.data?.userId === value ? byId.data : null)
  const isFetching = isMeeting ? meetingQuery.isFetching : generalQuery.isFetching
  const isLoading = isMeeting ? meetingQuery.isLoading : generalQuery.isLoading
  const isError = isMeeting ? meetingQuery.isError : generalQuery.isError

  const noSelectionLabel = t(inherit ? 'tasks.assignment.inherit' : 'tasks.assignment.unassigned')

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen)
      if (nextOpen) { setSearch(''); setPage(1) }
    }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}
          className="h-auto min-h-10 w-full min-w-0 justify-between gap-2 py-2 font-normal"
          aria-label={t('tasks.assignment.assignTo')}>
          <span className="flex min-w-0 items-center gap-2 text-start">
            <UserRound className="size-4 shrink-0" />
            {value === null ? <span className="truncate">{noSelectionLabel}</span> : (
              <span className="flex min-w-0 flex-col text-start leading-tight">
                <span className="truncate">{selected?.userName ?? t('tasks.assignment.userCode', { code: value })}</span>
                {selected ? (
                  <span className="text-muted-foreground max-w-full truncate text-xs">
                    {t('tasks.assignment.userCodeLabel', { code: selected.userCode })}
                    {selected.email ? <span dir="ltr" className="ms-1 inline-block"> · {selected.email}</span> : null}
                  </span>
                ) : null}
              </span>
            )}
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(27rem,calc(100vw-2rem))] space-y-2 p-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 start-2.5 size-4" />
          <Input autoFocus value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }}
            className="ps-8" placeholder={t('tasks.assignment.searchUsers')}
            aria-label={t('tasks.assignment.searchUsers')} />
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto" role="listbox" aria-label={t('tasks.assignment.assignTo')}>
          {allowClear ? (
            <button type="button" role="option" aria-selected={value === null}
              className="hover:bg-muted focus-visible:bg-muted flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-sm"
              onClick={() => { onChange(null); setSelectedUser(null); setOpen(false) }}>
              <span className="flex items-center gap-2"><X className="size-4" /> {noSelectionLabel}</span>
              {value === null ? <Check className="size-4" /> : null}
            </button>
          ) : null}
          {available.map((user) => (
            <button type="button" key={user.userId} role="option" aria-selected={value === user.userId}
              className="hover:bg-muted focus-visible:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm"
              onClick={() => { onChange(user.userId); setSelectedUser(user); setOpen(false) }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user.userName}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {t('tasks.assignment.userCodeLabel', { code: user.userCode })}
                </span>
                {user.email ? (
                  <span dir="ltr" className="text-muted-foreground block truncate text-start text-xs">{user.email}</span>
                ) : null}
              </span>
              {value === user.userId ? <Check className="size-4 shrink-0" /> : null}
            </button>
          ))}
          {isLoading ? <p className="text-muted-foreground p-2 text-xs">{t('common.loading')}</p> : null}
          {!isLoading && !isError && !available.length ? (
            <p className="text-muted-foreground p-2 text-xs">{t('tasks.assignment.noUsers')}</p>
          ) : null}
          {isError ? <p className="text-destructive p-2 text-xs">{t('tasks.assignment.searchError')}</p> : null}
        </div>
        {!isMeeting ? (
          <div className="flex items-center justify-between border-t pt-2">
            <Button type="button" size="sm" variant="outline" disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}>{t('pagination.previous')}</Button>
            <span className="text-muted-foreground text-xs">{page}</span>
            <Button type="button" size="sm" variant="outline"
              disabled={available.length < 50 || isFetching}
              onClick={() => setPage((current) => current + 1)}>{t('pagination.next')}</Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
