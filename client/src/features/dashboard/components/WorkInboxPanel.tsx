import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ArrowDownUp, ArrowLeft, ArrowRight, CircleDot, Inbox, ListChecks } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { SearchInput } from '@/components/shared/SearchInput'
import { TablePagination } from '@/components/shared/TablePagination'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getDashboardWork } from '@/features/dashboard/api/dashboard-work.api'
import { taskHref } from '@/features/dashboard/dashboard-work.links'
import { dashboardWorkDestination, dashboardWorkInitialFilters } from '@/features/dashboard/dashboard-work.navigation'
import type { WorkDue, WorkFilters, WorkPriority, WorkStatus, WorkTab } from '@/features/dashboard/types/dashboard-work.types'
import { TaskPriorityIndicator, TaskDueIndicator } from '@/features/tasks/components/TaskSelectIndicators'
import { TaskStatusIndicator } from '@/features/tasks/components/TaskStatusIndicator'
import { cn } from '@/lib/cn'
import { formatRiyadhDateInput } from '@/lib/date-time'

const TABS: WorkTab[] = ['attention','assigned','shared','personal','delegated']
const STATUS: WorkStatus[] = ['ACTIVE','ALL','TODO','IN_PROGRESS','DONE','CANCELLED']
const PRIORITIES: WorkPriority[] = ['ALL','LOW','MEDIUM','HIGH']
const DUE: WorkDue[] = ['ALL','OVERDUE','TODAY','UPCOMING','NO_DATE']
const PREVIEW: WorkFilters = {tab:'attention',page:1,pageSize:5,search:'',status:'ACTIVE',priority:'ALL',due:'ALL',sort:'urgency'}

function formatDate(date: string | null, locale: string) {
  if (!date) return '—'
  return new Intl.DateTimeFormat(locale, {day:'numeric',month:'short',year:'numeric',numberingSystem:'latn',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`))
}

interface WorkInboxPanelProps {
  mode: 'preview' | 'full'
}

export function WorkInboxPanel({mode}: WorkInboxPanelProps) {
  const {t,i18n} = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [filters,setFilters] = useState<WorkFilters>(() => mode === 'preview' ? PREVIEW : dashboardWorkInitialFilters(params))
  const isPreview = mode === 'preview'
  // A new incoming deep link should replace the current filters (not the user's keystrokes).
  const deepLink = params.toString()
  useEffect(() => {
    if (!isPreview) setFilters(dashboardWorkInitialFilters(new URLSearchParams(deepLink)))
  }, [deepLink,isPreview])
  const query = useQuery({
    queryKey:['dashboard','work',filters],
    queryFn:()=>getDashboardWork(filters),
    placeholderData:keepPreviousData,
    staleTime:30_000,
    refetchInterval:60_000,
  })
  const direction=i18n.dir()
  const locale=i18n.language.startsWith('ar')?'ar-SA':'en-SA'
  const Arrow=direction==='rtl'?ArrowLeft:ArrowRight
  const today=formatRiyadhDateInput(Date.now())
  const total=query.data?.total??0
  const dest=dashboardWorkDestination(filters)
  function update<K extends keyof WorkFilters>(key:K,value:WorkFilters[K]) {
    setFilters(old=>({...old,[key]:value,page:1}))
  }
  function changeTab(tab:WorkTab) {
    setFilters(old=>({...old,tab,page:1,due:'ALL',status:'ACTIVE',priority:'ALL',search:''}))
  }

  return <Card className="flex min-w-0 flex-col overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
      <div className="flex items-center gap-2"><Inbox className="text-primary size-5"/>
        <div><h2 className="text-base font-bold">{t('workDashboard.inbox')}</h2>
          <p className="text-muted-foreground text-xs">{t(isPreview?'workDashboard.inboxPreviewDescription':'workDashboard.inboxDescription')}</p></div>
      </div>
      {isPreview?<Link to={dest} className="text-primary focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm text-xs font-semibold hover:underline focus-visible:ring-2">
        {t('workDashboard.openFullPage')}<Arrow className="size-4"/>
      </Link>:null}
    </div>
    <div role="tablist" aria-label={t('workDashboard.inbox')} className="flex gap-1 overflow-x-auto border-b px-3 pt-2">
      {TABS.map(tab=><button type="button" key={tab} role="tab" aria-selected={filters.tab===tab} onClick={()=>changeTab(tab)}
        className={cn('focus-visible:ring-ring shrink-0 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors focus-visible:ring-2',filters.tab===tab?'border-primary text-primary':'text-muted-foreground hover:text-foreground border-transparent')}>
        {t(`workDashboard.tabs.${tab}`)}{query.data?.summary?<span className="bg-muted text-foreground ms-1.5 rounded-full px-1.5 py-0.5 text-[10px]">{query.data.summary[tab]}</span>:null}
      </button>)}
    </div>
    <div className="flex flex-wrap items-center gap-2 p-3">
      <SearchInput className="min-w-[160px] flex-1" value={filters.search} onChange={value=>update('search',value.slice(0,100))} placeholder={t('workDashboard.search')} ariaLabel={t('workDashboard.search')}/>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <WorkSelect kind="status" label={t('workDashboard.status')} value={filters.status} values={STATUS} onChange={value=>update('status',value as WorkStatus)} text={value=>value==='ACTIVE'?t('workDashboard.active'):value==='ALL'?t('workDashboard.all'):t(`tasks.statuses.${value}`)}/>
        <WorkSelect kind="priority" label={t('workDashboard.priority')} value={filters.priority} values={PRIORITIES} onChange={value=>update('priority',value as WorkPriority)} text={value=>value==='ALL'?t('workDashboard.all'):t(`tasks.priorities.${value}`)}/>
        <WorkSelect kind="due" label={t('workDashboard.due')} value={filters.due} values={DUE} onChange={value=>update('due',value as WorkDue)} text={value=>value==='ALL'?t('workDashboard.all'):t(`tasks.dueFilters.${value}`)}/>
        {!isPreview?<WorkSelect kind="sort" label={t('workDashboard.sort')} value={filters.sort} values={['urgency','created','due','priority']} onChange={value=>update('sort',value as WorkFilters['sort'])} text={value=>t(`workDashboard.sortOptions.${value}`)}/>:null}
      </div>
    </div>
    {query.isError?<div role="alert" className="text-destructive p-8 text-center text-sm">{t('workDashboard.loadError')}</div>
      :query.isPending?<div className="space-y-2 p-4" aria-busy="true">{Array.from({length:5},(_,i)=><div key={i} className="bg-muted h-12 animate-pulse rounded"/>)}</div>
      :!query.data.items.length?<div className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-center"><ListChecks className="size-6 opacity-60"/><p className="text-sm">{t('workDashboard.noTasks')}</p></div>
      :<div className={cn('min-w-0 overflow-x-auto transition-opacity',query.isFetching&&'opacity-60')}>
        <table className="w-full min-w-[620px] text-start text-xs">
          <thead className="bg-muted/35 text-muted-foreground border-y"><tr>
            <th scope="col" className="px-4 py-3 text-start font-semibold">{t('workDashboard.task')}</th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">{t('workDashboard.context')}</th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">{t('workDashboard.status')}</th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">{t('workDashboard.priority')}</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">{t('workDashboard.due')}</th>
          </tr></thead>
          <tbody className="divide-y">{query.data.items.map(task=><tr key={task.taskId} tabIndex={0} role="link" aria-label={`${t('workDashboard.task')}: ${task.title}`}
            onClick={()=>navigate(taskHref(task,filters.tab))}
            onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate(taskHref(task,filters.tab))}}}
            className="hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:ring-primary cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2">
            <td className="max-w-[380px] px-4 py-3"><Link to={taskHref(task,filters.tab)} onClick={event=>event.stopPropagation()} title={task.title} className="hover:text-primary block truncate font-semibold hover:underline">{task.title}</Link>
              <span className="text-muted-foreground block truncate text-[11px]">{task.ownerName}{task.isAssigned&&task.isShared?` · ${t('workDashboard.alsoShared')}`:''}</span></td>
            <td className="text-muted-foreground max-w-[150px] truncate px-3 py-3" title={task.listName??''}>{task.listName??t(task.meetingId!==null?'workDashboard.meetingTask':task.isShared?'workDashboard.sharedContext':task.isAssigned?'workDashboard.assignedContext':'workDashboard.generalContext')}</td>
            <td className="px-3 py-3"><TaskStatusIndicator status={task.status} pill/></td>
            <td className="px-3 py-3"><TaskPriorityIndicator priority={task.priority} pill/></td>
            <td className={cn('whitespace-nowrap px-4 py-3',task.dueDate&&task.dueDate<today&&task.status!=='DONE'&&task.status!=='CANCELLED'?'text-destructive font-semibold':'text-muted-foreground')}>{formatDate(task.dueDate,locale)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    {isPreview?<Link to={dest} className="text-primary hover:bg-muted/30 inline-flex items-center justify-center gap-2 border-t px-4 py-3 text-xs font-semibold hover:underline">
      {t('workDashboard.viewRemaining',{count:Math.max(0,total-(query.data?.items.length??0))})}<Arrow className="size-4"/>
    </Link>:!query.isError && total>0?<TablePagination page={filters.page} totalPages={Math.ceil(total/filters.pageSize)} pageSize={filters.pageSize} totalRows={total}
      startRow={(filters.page-1)*filters.pageSize+1} endRow={Math.min(filters.page*filters.pageSize,total)} pageSizes={[10,20,50]}
      onPageChange={page=>setFilters(old=>({...old,page}))} onPageSizeChange={pageSize=>setFilters(old=>({...old,page:1,pageSize}))}/>:null}
  </Card>
}

function WorkSelect({label,value,values,onChange,text,kind}:{label:string;value:string;values:readonly string[];onChange:(value:string)=>void;text:(value:string)=>string;kind:'status'|'priority'|'due'|'sort'}) {
  function optionLabel(option:string) {
    if(kind==='status'&&option==='ACTIVE')return <span className="text-info-foreground inline-flex items-center gap-2 text-xs"><CircleDot className="size-4"/>{text(option)}</span>
    if(kind==='status'&&option!=='ACTIVE')return <TaskStatusIndicator status={option as 'ALL'|'TODO'|'IN_PROGRESS'|'DONE'|'CANCELLED'} />
    if(kind==='priority')return <TaskPriorityIndicator priority={option as 'ALL'|'LOW'|'MEDIUM'|'HIGH'} />
    if(kind==='due')return <TaskDueIndicator due={option as 'ALL'|'OVERDUE'|'TODAY'|'UPCOMING'|'NO_DATE'} />
    return <span className="inline-flex items-center gap-2"><ArrowDownUp className="text-muted-foreground size-4 shrink-0"/><span className="truncate">{text(option)}</span></span>
  }
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-9 w-auto min-w-[104px] max-w-44 text-xs" aria-label={label}><SelectValue><span className="truncate">{value==='ALL'?label:text(value)}</span></SelectValue></SelectTrigger>
    <SelectContent>{values.map(option=><SelectItem key={option} value={option}>{optionLabel(option)}</SelectItem>)}</SelectContent>
  </Select>
}

