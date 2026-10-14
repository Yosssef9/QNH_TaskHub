import { Search, UserRound, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'

export interface TaskTeamMember {
  userId: number
  userName: string
  userCode: string
  email: string | null
  mainAssignee: boolean
}

export interface TaskTeamSummary {
  teamTask?: boolean
  teamMemberCount?: number
  mainAssigneeCount?: number
  mainCompletedCount?: number
  teamRoster?: TaskTeamMember[]
}

interface Props {
  summary: TaskTeamSummary
  subtaskTotal?: number
  subtaskCompleted?: number
  compact?: boolean
  className?: string
}

export function TaskTeamIndicator({ summary, subtaskTotal = 0, subtaskCompleted = 0, compact = false, className }: Props) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function cancelTimers() {
    if (openTimer.current !== null) clearTimeout(openTimer.current)
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }
  useEffect(() => () => {
    if (openTimer.current !== null) clearTimeout(openTimer.current)
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
  }, [])
  function startHover(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    cancelTimers()
    openTimer.current = setTimeout(() => setOpen(true), 100)
  }
  function stopHover(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    cancelTimers()
    closeTimer.current = setTimeout(() => setOpen(false), 280)
  }
  function keepOpen(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    cancelTimers()
  }
  function handleOpenChange(nextOpen: boolean) {
    cancelTimers()
    setOpen(nextOpen)
    if (!nextOpen) setSearch('')
  }
  const roster = summary.teamRoster ?? []
  const mainCount = summary.mainAssigneeCount ?? roster.filter(user => user.mainAssignee).length
  const teamCount = summary.teamMemberCount || roster.length
  const hasTeam = Boolean(summary.teamTask && teamCount > 1)
  const mainDone = summary.mainCompletedCount ?? 0
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return query ? roster.filter(user => `${user.userName} ${user.userCode} ${user.email ?? ''}`.toLocaleLowerCase().includes(query)) : roster
  }, [roster, search])
  if (!roster.length && !hasTeam) return null

  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {hasTeam && !roster.length ? <span className="bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold">
          <UsersRound aria-hidden="true" className="size-3.5" />{t('tasks.teamCards.teamLabel', { count: teamCount })}
        </span> : null}
        {roster.length > 0 ? <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <button type="button" className="hover:bg-muted focus-visible:ring-ring inline-flex min-w-0 flex-wrap items-center gap-1 rounded-lg px-1 py-1 text-start transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label={t('tasks.teamCards.viewTeam')}
              onPointerEnter={startHover}
              onPointerLeave={stopHover}
              onFocus={() => { cancelTimers(); setOpen(true) }}
              onClick={event => { event.preventDefault(); event.stopPropagation(); cancelTimers(); setOpen(true) }}>
              {hasTeam ? <span className="bg-primary/10 text-primary me-1 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold">
                <UsersRound aria-hidden="true" className="size-3.5" />{t('tasks.teamCards.teamLabel', { count: teamCount })}
              </span> : null}
              {roster.slice(0, 3).map(user => (
                <span key={user.userId} title={user.userName} className="bg-muted text-foreground grid size-7 shrink-0 place-items-center rounded-full border text-[10px] font-bold uppercase">
                  {user.userName.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('') || <UserRound className="size-3.5" />}
                </span>
              ))}
              {roster.length > 3 ? <span className="bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full border text-[10px] font-semibold">+{roster.length - 3}</span> : null}
              {!compact ? <span className="text-muted-foreground ms-1 max-w-44 truncate text-xs">
                {roster.length === 1 ? roster[0]!.userName : t('tasks.teamCards.members', { count: teamCount })}
              </span> : null}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] p-3"
            onPointerEnter={keepOpen} onPointerLeave={stopHover}
            onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{t('tasks.teamCards.roster')}</span>
              <span className="text-muted-foreground text-xs">{t('tasks.teamCards.members', { count: teamCount })}</span>
            </div>
            {roster.length > 4 ? <div className="relative mb-3">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" aria-hidden="true" />
              <input className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border ps-9 pe-3 text-sm outline-none focus-visible:ring-2" aria-label={t('tasks.teamCards.search')} placeholder={t('tasks.teamCards.search')} value={search} onChange={event => setSearch(event.target.value)}/>
            </div> : null}
            <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain">
              {filtered.length ? filtered.map(user => (
                <div key={user.userId} className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted/40">
                  <UserRound className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.userName}</p>
                    <p className="text-muted-foreground text-xs">{t('tasks.assignment.userCodeLabel', { code: user.userCode })}{user.mainAssignee ? ` · ${t('tasks.teamCards.mainAssignment')}` : ` · ${t('tasks.teamCards.subtaskAssignment')}`}</p>
                    {user.email ? <p className="text-muted-foreground truncate text-xs" title={user.email}>{user.email}</p> : null}
                  </div>
                </div>
              )) : <p className="text-muted-foreground px-2 py-4 text-center text-xs">{t('tasks.teamCards.noMatch')}</p>}
            </div>
            <p className="text-muted-foreground mt-2 border-t pt-2 text-xs">{t('tasks.teamCards.privateHint')}</p>
          </PopoverContent>
        </Popover> : null}
        {hasTeam && mainCount > 0 ? <span className="text-muted-foreground text-xs tabular-nums">{t('tasks.teamCards.mainProgress', { completed: mainDone, total: mainCount })}</span> : null}
        {hasTeam && mainCount === 0 ? <span className="text-muted-foreground text-xs">{t('tasks.teamCards.subtasksOnly')}</span> : null}
      </div>
      {hasTeam && !compact && mainCount > 0 ? (
        <div className="bg-muted h-1.5 max-w-sm overflow-hidden rounded-full" role="progressbar" aria-label={t('tasks.teamCards.mainProgress', { completed: mainDone, total: mainCount })} aria-valuenow={mainDone} aria-valuemin={0} aria-valuemax={mainCount}>
          <div className="bg-primary h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, Math.round(mainDone / mainCount * 100))}%` }} />
        </div>
      ) : null}
      {hasTeam && !compact && subtaskTotal > 0 ? <p className="text-muted-foreground text-xs">{t('tasks.teamCards.subtaskProgress', { completed: subtaskCompleted, total: subtaskTotal })}</p> : null}
    </div>
  )
}
