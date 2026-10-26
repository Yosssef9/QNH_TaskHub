import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bell, CalendarClock, CalendarDays,
  CalendarPlus2, ClipboardList, FolderOpen, Inbox, Plus, RefreshCw,
  ShieldCheck, UsersRound, MessageCircleMore,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { hasKpiWorkCyclesAccess } from '@/features/auth/access-permissions'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { getDashboardActivity } from '@/features/dashboard/api/dashboard-activity.api'
import { getDashboardListSummaries } from '@/features/dashboard/api/dashboard-lists.api'
import { getDashboardWork } from '@/features/dashboard/api/dashboard-work.api'
import { WorkInboxPanel } from '@/features/dashboard/components/WorkInboxPanel'
import { taskHref } from '@/features/dashboard/dashboard-work.links'
import { dashboardKpiDestination } from '@/features/dashboard/dashboard-work.navigation'
import type { WorkFilters } from '@/features/dashboard/types/dashboard-work.types'
import { ListsManagerDialog } from '@/features/lists/components/ListsManagerDialog'
import { useLists } from '@/features/lists/hooks/use-lists'
import { MeetingEditorDialog } from '@/features/meetings/components/MeetingEditorDialog'
import { useCoordinatorMeetingQueue, useCoordinatorReschedules, useMyMeetings, useMyMeetingRequests } from '@/features/meetings/hooks/use-meetings'
import { useTimeFormatPreference } from '@/features/preferences/hooks/use-time-format'
import { TaskEditorDialog } from '@/features/tasks/components/TaskEditorDialog'
import { discussionApi } from '@/features/tasks/discussions/discussions.api'
import { cn } from '@/lib/cn'
import { formatRiyadhDateInput, formatTimeRange } from '@/lib/date-time'

const BASE_FILTERS: WorkFilters = {tab:'attention',page:1,pageSize:5,search:'',status:'ACTIVE',priority:'ALL',due:'ALL',sort:'urgency'}

function formattedDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric',numberingSystem:'latn',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`))
}

export function HomePage() {
  const {t,i18n} = useTranslation()
  const locale = i18n.language.startsWith('ar')?'ar-SA':'en-SA'
  const Arrow = i18n.dir()==='rtl'?ArrowLeft:ArrowRight
  const user = useCurrentUser().data
  const lists = useLists()
  const listCounts = useQuery({queryKey:['dashboard','list-summaries'],queryFn:getDashboardListSummaries,staleTime:30_000,refetchInterval:60_000})
  const dashboard = useQuery({queryKey:['dashboard','work',BASE_FILTERS],queryFn:()=>getDashboardWork(BASE_FILTERS),placeholderData:keepPreviousData,staleTime:30_000,refetchInterval:60_000})
  const delegated = useQuery({queryKey:['dashboard','work','delegated-preview'],queryFn:()=>getDashboardWork({...BASE_FILTERS,tab:'delegated',pageSize:3}),staleTime:30_000,refetchInterval:60_000})
  const activity = useQuery({queryKey:['dashboard','activity'],queryFn:getDashboardActivity,staleTime:30_000,refetchInterval:60_000})
  const discussionUnread = useQuery({queryKey:['discussions','inbox-total'],queryFn:discussionApi.unreadTotal,staleTime:15000,refetchInterval:30000})
  const meetings = useMyMeetings()
  const timeFormat = useTimeFormatPreference()
  const [createTaskOpen,setCreateTaskOpen] = useState(false)
  const [createMeetingOpen,setCreateMeetingOpen] = useState(false)
  const [manageListsOpen,setManageListsOpen] = useState(false)
  const organizer = user?.access.meetingOrganizeEnabled === true
  const coordinator = user?.access.meetingCoordinateEnabled === true
  const canCreateMeeting = organizer||coordinator
  const organizerQueue = useMyMeetingRequests(organizer)
  const coordinatorQueue = useCoordinatorMeetingQueue(coordinator)
  const reschedules = useCoordinatorReschedules(coordinator)
  const today = formatRiyadhDateInput(Date.now())
  const upcoming = useMemo(()=>[...(meetings.data??[])]
    .filter(meeting=>new Date(meeting.endAtUtc).getTime()>=Date.now())
    .sort((a,b)=>new Date(a.startAtUtc).getTime()-new Date(b.startAtUtc).getTime()).slice(0,3),[meetings.data])
  const sortedLists = useMemo(()=>[...(lists.data??[])].sort((a,b)=> Number(b.isDefault)-Number(a.isDefault)||a.displayOrder-b.displayOrder),[lists.data])
  const summaryByListId = useMemo(()=>new Map((listCounts.data??[]).map(row=>[row.listId,row])),[listCounts.data])
  const kpis = [
    {key:'assigned' as const,label:t('workDashboard.assigned'),value:dashboard.data?.summary.assigned??0,icon:Inbox,tone:'bg-sky-500/10 text-sky-700 dark:text-sky-300'},
    {key:'shared' as const,label:t('workDashboard.shared'),value:dashboard.data?.summary.shared??0,icon:UsersRound,tone:'bg-violet-500/10 text-violet-700 dark:text-violet-300'},
    {key:'today' as const,label:t('workDashboard.dueToday'),value:dashboard.data?.summary.dueToday??0,icon:CalendarClock,tone:'bg-amber-500/10 text-amber-700 dark:text-amber-300'},
    {key:'overdue' as const,label:t('workDashboard.overdue'),value:dashboard.data?.summary.overdue??0,icon:AlertTriangle,tone:'bg-red-500/10 text-red-700 dark:text-red-300'},
  ]
  function refreshDashboard() {
    void dashboard.refetch();void delegated.refetch();void activity.refetch();void meetings.refetch();
    void lists.refetch();void listCounts.refetch();void discussionUnread.refetch()
  }

  return <div className="w-full min-w-0 space-y-4 pb-10">
    <header className="flex flex-wrap items-center justify-between gap-4 pb-1">
      <div className="min-w-0">
        <p className="text-primary text-xs font-semibold">{t('workDashboard.eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{t('home.title',{name:user?.user.userName??t('home.fallbackName')})}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('workDashboard.welcomeSubtitle')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-card text-muted-foreground hidden rounded-lg border px-3 py-2 text-xs font-medium md:inline-flex"><CalendarDays className="me-2 size-4"/>{formattedDate(today,locale)}</span>
        <Button size="sm" onClick={()=>setCreateTaskOpen(true)} disabled={!lists.data?.length}><Plus className="size-4"/>{t('workDashboard.newTask')}</Button>
        {canCreateMeeting?<Button size="sm" variant="outline" onClick={()=>setCreateMeetingOpen(true)}><CalendarPlus2 className="size-4"/>{t('home.newMeetingAction')}</Button>:null}
        <Link to="/calendar" className="hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold"><CalendarDays className="size-4"/>{t('workDashboard.calendar')}</Link>
        <Button size="sm" variant="ghost" onClick={refreshDashboard} aria-label={t('workDashboard.refresh')}><RefreshCw className={cn('size-4',dashboard.isFetching&&'animate-spin')}/></Button>
      </div>
    </header>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {kpis.map(({key,label,value,icon:Icon,tone})=><Link key={key} to={dashboardKpiDestination(key)}
        className="bg-card focus-visible:ring-ring hover:border-primary/40 hover:shadow-sm flex min-w-0 items-center gap-3 rounded-xl border p-3 shadow-xs transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:outline-none sm:p-4">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl',tone)}><Icon className="size-5"/></span>
        <span className="min-w-0 flex-1"><span className="text-muted-foreground block truncate text-xs font-medium">{label}</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums">{dashboard.isPending?'—':value}</span></span>
        <Arrow className="text-muted-foreground size-4 shrink-0"/>
      </Link>)}
    </div>

    {/* RTL places the first column on the right: Meetings | Work Inbox | My Lists. */}
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.7fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)]">
      <aside className="order-3 min-w-0 space-y-4 xl:order-none">
        <Link to="/discussions" className="bg-card hover:border-primary/40 focus-visible:ring-primary group flex items-center gap-3 rounded-xl border p-3 shadow-xs transition-all hover:shadow-sm focus-visible:ring-2 focus-visible:outline-none"
          aria-label={i18n.language.startsWith('ar')?'فتح محادثاتي':'Open My Discussions'}>
          <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl"><MessageCircleMore className="size-5"/></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{i18n.language.startsWith('ar')?'محادثاتي':'My Discussions'}</span>
            <span className="text-muted-foreground mt-1 block text-xs">{i18n.language.startsWith('ar')?'مناقشات المهام والمهام الفرعية':'Task and subtask conversations'}</span>
          </span>
          {discussionUnread.isError?<span className="text-muted-foreground text-xs" aria-label={i18n.language.startsWith('ar')?'تعذّر تحميل الرسائل غير المقروءة':'Could not load unread count'}>—</span>:
            (discussionUnread.data??0)>0?<span className="bg-primary text-primary-foreground min-w-6 rounded-full px-2 py-1 text-center text-xs font-bold tabular-nums" aria-label={i18n.language.startsWith('ar')?`${discussionUnread.data} رسائل غير مقروءة`:`${discussionUnread.data} unread messages`}>{(discussionUnread.data??0)>99?'99+':discussionUnread.data}</span>:null}
          <Arrow className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5"/>
        </Link>
        <Card className="overflow-hidden">
          <PanelHeader title={t('workDashboard.meetings')} icon={CalendarDays} action={<Link to="/meetings" className="text-primary text-xs font-semibold hover:underline">{t('workDashboard.viewAll')}</Link>}/>
          <div className="divide-y px-3">
            {meetings.isPending?<p className="text-muted-foreground py-7 text-center text-xs">{t('home.loadingMeetings')}</p>
              :meetings.isError?<p className="text-destructive py-7 text-center text-xs">{t('home.meetingsLoadError')}</p>
              :upcoming.length===0?<p className="text-muted-foreground py-8 text-center text-xs">{t('home.noUpcomingMeetings')}</p>
              :upcoming.map(meeting=><Link to={`/meetings/${meeting.id}`} key={meeting.id} className="hover:bg-muted/40 block py-3 transition-colors">
                <div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-xs font-semibold">{meeting.title}</span><span className="text-primary shrink-0 text-[11px] font-semibold">{formattedDate(formatRiyadhDateInput(meeting.startAtUtc),locale)}</span></div>
                <p className="text-muted-foreground mt-1 truncate text-[11px]">{meeting.meetingMode==='ZOOM'?t('meetings.zoom.zoomType'):meeting.room?(locale.startsWith('ar')?meeting.room.nameAr:meeting.room.nameEn):t('home.meetingRoomFallback')} · {formatTimeRange(meeting.startAtUtc,meeting.endAtUtc,locale,timeFormat)}</p>
              </Link>)}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <PanelHeader title={t('workDashboard.activity')} icon={Bell}/>
          <div className="divide-y px-3">{activity.isPending?<p className="text-muted-foreground py-6 text-center text-xs">{t('workDashboard.loading')}</p>
            :activity.isError?<p className="text-destructive py-6 text-center text-xs">{t('workDashboard.loadError')}</p>
            :!activity.data.length?<p className="text-muted-foreground py-6 text-center text-xs">{t('workDashboard.noActivity')}</p>
            :activity.data.slice(0,4).map(event=><Link key={`${event.kind}-${event.id}`} to={event.kind==='MEETING'?`/meetings/${event.objectId}`:event.ownerUserId===user?.user.userId&&event.listId?`/lists/${event.listId}?taskId=${event.objectId}`:event.isShared?`/shared-tasks?tab=with&taskId=${event.objectId}`:`/assigned-to-me?taskId=${event.objectId}`}
              className="hover:bg-muted/40 flex items-start gap-2 py-3"><span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"/><span className="min-w-0"><span className="block truncate text-xs font-semibold">{event.title}</span><span className="text-muted-foreground mt-1 block truncate text-[11px]">{event.actorName} · {event.kind==='MEETING'?t('workDashboard.meetingActivity'):t('workDashboard.taskActivity')}</span><span className="text-muted-foreground mt-1 block text-[10px]">{formattedDate(formatRiyadhDateInput(event.createdAtUtc),locale)}</span></span></Link>)}
          </div>
        </Card>
        {canCreateMeeting&&(organizerQueue.data?.length||coordinatorQueue.data?.length||reschedules.data?.length)?<Card className="flex items-center gap-2 p-3"><ShieldCheck className="text-primary size-4"/><p className="text-muted-foreground text-xs">{t('workDashboard.meetingQueue',{count:(organizerQueue.data?.length??0)+(coordinatorQueue.data?.length??0)+(reschedules.data?.length??0)})}</p></Card>:null}
      </aside>

      <section className="order-1 min-w-0 xl:order-none"><WorkInboxPanel mode="preview"/></section>

      <aside className="order-2 min-w-0 space-y-4 xl:order-none">
        <Card className="overflow-hidden">
          <PanelHeader title={t('workDashboard.myLists')} icon={FolderOpen} action={<button type="button" onClick={()=>setManageListsOpen(true)} disabled={!lists.data?.length} className="text-primary disabled:text-muted-foreground text-xs font-semibold hover:underline">{t('workDashboard.manageLists')}</button>}/>
          <div className="divide-y px-3">
            {lists.isPending?<div aria-busy="true" className="space-y-2 py-4">{[1,2,3].map(n=><div key={n} className="bg-muted h-10 animate-pulse rounded"/>)}</div>
              :lists.isError?<p className="text-destructive py-6 text-center text-xs">{t('workDashboard.listLoadError')}</p>
              :!sortedLists.length?<p className="text-muted-foreground py-6 text-center text-xs">{t('workDashboard.noLists')}</p>
              :sortedLists.slice(0,6).map(list=>{
                const stats=summaryByListId.get(list.id)
                const percentage=stats?.total?100*stats.completed/stats.total:0
                return <Link to={`/lists/${list.id}`} key={list.id} className="hover:bg-muted/40 block space-y-2 py-3 transition-colors" title={list.name}>
                  <div className="flex items-center gap-2"><FolderOpen className="size-4 shrink-0" style={{color:list.color}}/><span className="min-w-0 flex-1 truncate text-xs font-semibold">{list.name}</span>
                    <span className="bg-muted rounded-full px-2 py-0.5 text-[11px] tabular-nums" title={stats?t('workDashboard.activeTasksCount',{count:stats.active}):undefined}>{stats?stats.active:'—'}</span><Arrow className="text-muted-foreground size-3.5 shrink-0"/></div>
                  <div className="flex items-center gap-2"><span className="bg-muted h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"><span className="block h-full rounded-full" style={{backgroundColor:list.color,width:`${percentage}%`}}/></span>
                    <span className="text-muted-foreground text-[10px] tabular-nums">{stats?`${Math.round(percentage)}%`:'—'}</span></div>
                </Link>
              })}
            {sortedLists.length>6?<button type="button" onClick={()=>setManageListsOpen(true)} className="text-primary block w-full py-3 text-center text-xs font-semibold hover:underline">{t('workDashboard.moreLists',{count:sortedLists.length-6})}</button>:null}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <PanelHeader title={t('workDashboard.delegated')} icon={UsersRound} action={<Link to="/work-inbox?tab=delegated" className="text-primary text-xs font-semibold hover:underline">{t('workDashboard.viewAll')}</Link>}/>
          <div className="divide-y px-3">{delegated.isPending?<p className="text-muted-foreground py-5 text-center text-xs">{t('workDashboard.loading')}</p>
            :delegated.isError?<p className="text-destructive py-5 text-center text-xs">{t('workDashboard.loadError')}</p>
            :!delegated.data.items.length?<p className="text-muted-foreground py-5 text-center text-xs">{t('workDashboard.noDelegated')}</p>
            :delegated.data.items.map(task=><Link to={taskHref(task,'delegated')} key={task.taskId} className="hover:bg-muted/40 block space-y-1.5 py-3"><p className="truncate text-xs font-semibold">{task.title}</p>
              <div className="text-muted-foreground flex justify-between gap-2 text-[11px]"><span>{t(`tasks.statuses.${task.status}`)}</span><span>{task.totalAssignments>0?`${task.completedAssignments}/${task.totalAssignments} ${t('workDashboard.completed')}`:t('workDashboard.assigned')}</span></div>
              {task.totalAssignments>0?<div className="bg-muted h-1.5 overflow-hidden rounded-full"><div className="bg-primary h-full rounded-full" style={{width:`${100*task.completedAssignments/task.totalAssignments}%`}}/></div>:null}
            </Link>)}
          </div>
        </Card>
        {hasKpiWorkCyclesAccess(user?.access)?<Link to="/work-cycles" className="text-primary inline-flex items-center gap-2 text-xs font-semibold hover:underline"><ClipboardList className="size-4"/>{t('home.manageCycles')}</Link>:null}
      </aside>
    </div>

    {createMeetingOpen?<MeetingEditorDialog open mode={coordinator?'DIRECT':'REQUEST'} onOpenChange={setCreateMeetingOpen}/>:null}
    {createTaskOpen&&lists.data?.length?<TaskEditorDialog open onOpenChange={setCreateTaskOpen} lists={lists.data} allowListSelectionOnCreate onSaved={()=>{void dashboard.refetch();void delegated.refetch();void listCounts.refetch()}}/>:null}
    {manageListsOpen&&lists.data?<ListsManagerDialog open={manageListsOpen} lists={lists.data} onOpenChange={setManageListsOpen}/>:null}
  </div>
}

function PanelHeader({title,icon:Icon,action}:{title:string;icon:LucideIcon;action?:ReactNode}) {
  return <div className="flex items-center justify-between gap-2 border-b px-3 py-3"><h2 className="flex min-w-0 items-center gap-2 text-sm font-bold"><Icon className="text-primary size-4 shrink-0"/>{title}</h2>{action}</div>
}

