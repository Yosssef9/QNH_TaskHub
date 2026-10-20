import type { WorkFilters, WorkTab } from './types/dashboard-work.types'

/** Links to the dedicated task pages whenever they represent the full scope. */
export function dashboardWorkDestination(filters: Pick<WorkFilters, 'tab' | 'due' | 'status' | 'priority' | 'search' | 'sort'>): string {
  const unfiltered = filters.due === 'ALL' && filters.status === 'ACTIVE'
    && filters.priority === 'ALL' && filters.search.trim() === '' && filters.sort === 'urgency'
  if (unfiltered && filters.tab === 'assigned') return '/assigned-to-me'
  if (unfiltered && filters.tab === 'shared') return '/shared-tasks?tab=with'
  const query = new URLSearchParams({ tab: filters.tab })
  if (filters.due !== 'ALL') query.set('due', filters.due)
  if (filters.status !== 'ACTIVE') query.set('status', filters.status)
  if (filters.priority !== 'ALL') query.set('priority', filters.priority)
  if (filters.search.trim()) query.set('search', filters.search.trim())
  if (filters.sort !== 'urgency') query.set('sort', filters.sort)
  return `/work-inbox?${query.toString()}`
}

export function dashboardKpiDestination(key: 'assigned' | 'shared' | 'today' | 'overdue'): string {
  if (key === 'assigned') return '/assigned-to-me'
  if (key === 'shared') return '/shared-tasks?tab=with'
  return `/work-inbox?tab=attention&due=${key === 'today' ? 'TODAY' : 'OVERDUE'}`
}

export function dashboardWorkInitialFilters(params: URLSearchParams): WorkFilters {
  const tabs: WorkTab[] = ['attention','assigned','shared','personal','delegated']
  const tab = params.get('tab')
  const due = params.get('due')
  const status = params.get('status')
  const priority = params.get('priority')
  const sort = params.get('sort')
  return {
    tab: tabs.includes(tab as WorkTab) ? tab as WorkTab : 'attention',
    page: 1,
    pageSize: 20,
    search: (params.get('search') ?? '').slice(0,100),
    due: ['ALL','OVERDUE','TODAY','UPCOMING','NO_DATE'].includes(due ?? '') ? due as WorkFilters['due'] : 'ALL',
    status: ['ACTIVE','ALL','TODO','IN_PROGRESS','DONE','CANCELLED'].includes(status ?? '') ? status as WorkFilters['status'] : 'ACTIVE',
    priority: ['ALL','LOW','MEDIUM','HIGH'].includes(priority ?? '') ? priority as WorkFilters['priority'] : 'ALL',
    sort: ['urgency','created','due','priority'].includes(sort ?? '') ? sort as WorkFilters['sort'] : 'urgency',
  }
}
