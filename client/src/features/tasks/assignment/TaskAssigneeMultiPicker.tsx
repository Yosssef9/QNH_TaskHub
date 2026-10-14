import { Check, ChevronsUpDown, Search, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMeetingActionItemAssignees } from '@/features/meetings/action-items/use-meeting-action-items'

import type { EligibleTaskUser } from './general-assignment.api'
import { matchesTaskAssigneeSearch } from './task-assignee-search'
import { useEligibleTaskUsers } from './use-general-assignment'

interface Props {
  value: number[]
  onChange: (ids: number[]) => void
  meetingId?: number | null
  knownUsers?: EligibleTaskUser[]
  onUserPicked?: (user: EligibleTaskUser) => void
  disabled?: boolean
}

/** Reuses the existing backend-filtered user lists and name/code/email matching. */
export function TaskAssigneeMultiPicker({ value, onChange, meetingId = null, knownUsers = [], onUserPicked, disabled = false }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [remembered, setRemembered] = useState<EligibleTaskUser[]>([])
  const general = useEligibleTaskUsers(search, open && meetingId === null, page)
  const meeting = useMeetingActionItemAssignees(meetingId, open && meetingId !== null)
  const available: EligibleTaskUser[] = meetingId === null ? general.data?.items ?? [] :
    (meeting.data ?? []).filter(item => item.eligible && matchesTaskAssigneeSearch(item, search))
  const allUsers = useMemo(() => new Map([...knownUsers, ...remembered, ...available].map(user => [user.userId, user])),
    [knownUsers, remembered, available])
  function toggle(user: EligibleTaskUser) {
    onUserPicked?.(user)
    setRemembered(prev => [...prev.filter(item => item.userId !== user.userId), user])
    onChange(value.includes(user.userId) ? value.filter(id => id !== user.userId) : [...value, user.userId])
  }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline" type="button" disabled={disabled} className="h-auto min-h-10 w-full justify-between gap-2 text-start">
        <span className="flex min-w-0 items-center gap-2"><UsersRound className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{value.length ? value.map(id => allUsers.get(id)?.userName ?? `#${id}`).join(', ') : t('tasks.collaboration.selectUsers')}</span>
        </span><ChevronsUpDown className="size-4 shrink-0" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[min(29rem,calc(100vw-2rem))] space-y-2 p-2">
      <div className="relative"><Search className="text-muted-foreground absolute top-2.5 start-2.5 size-4" />
        <Input autoFocus className="ps-8" value={search} onChange={event => {setSearch(event.target.value);setPage(1)}}
          placeholder={t('tasks.assignment.searchUsers')} aria-label={t('tasks.assignment.searchUsers')}/>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto" aria-label={t('tasks.collaboration.selectUsers')}>
        {available.map(user => <button key={user.userId} type="button" aria-pressed={value.includes(user.userId)}
          className="hover:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start"
          onClick={() => toggle(user)}>
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{user.userName}</span>
            <span className="text-muted-foreground block truncate text-xs">{t('tasks.assignment.userCodeLabel',{code:user.userCode})}</span>
            {user.email && <span dir="ltr" className="text-muted-foreground block truncate text-start text-xs">{user.email}</span>}
          </span>{value.includes(user.userId) && <Check className="size-4 shrink-0" />}
        </button>)}
        {!available.length && <p className="text-muted-foreground p-2 text-xs">{t('tasks.assignment.noUsers')}</p>}
      </div>
      {meetingId === null && <div className="flex justify-between border-t pt-2">
        <Button size="sm" variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>{t('pagination.previous')}</Button>
        <span className="text-muted-foreground text-xs">{page}</span>
        <Button size="sm" variant="outline" disabled={available.length<50 || general.isFetching} onClick={()=>setPage(p=>p+1)}>{t('pagination.next')}</Button>
      </div>}
      <Button className="w-full" size="sm" onClick={()=>setOpen(false)}>{t('common.done',{defaultValue:'Done'})}</Button>
    </PopoverContent>
  </Popover>
}

