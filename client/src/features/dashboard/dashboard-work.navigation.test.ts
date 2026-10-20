import { describe, expect, it } from 'vitest'
import { dashboardKpiDestination, dashboardWorkDestination, dashboardWorkInitialFilters } from './dashboard-work.navigation'

const filters = {tab:'assigned' as const,due:'ALL' as const,status:'ACTIVE' as const,priority:'ALL' as const,search:'',sort:'urgency' as const}

describe('dashboard navigation', () => {
  it('takes assignment and sharing KPIs to their dedicated pages', () => {
    expect(dashboardKpiDestination('assigned')).toBe('/assigned-to-me')
    expect(dashboardKpiDestination('shared')).toBe('/shared-tasks?tab=with')
    expect(dashboardWorkDestination(filters)).toBe('/assigned-to-me')
    expect(dashboardWorkDestination({...filters,tab:'shared'})).toBe('/shared-tasks?tab=with')
  })

  it('preserves the due-day scope in the full Work Inbox', () => {
    for (const [key,due] of [['today','TODAY'],['overdue','OVERDUE']] as const) {
      const target=dashboardKpiDestination(key)
      const [path,query]=target.split('?')
      expect(path).toBe('/work-inbox')
      expect(dashboardWorkInitialFilters(new URLSearchParams(query)).due).toBe(due)
    }
  })

  it('does not lose applied filters when opening the full view', () => {
    const target=dashboardWorkDestination({...filters,tab:'delegated',due:'OVERDUE',priority:'HIGH',search:'nursing & IT'})
    const parsed=dashboardWorkInitialFilters(new URLSearchParams(target.split('?')[1]))
    expect(parsed).toMatchObject({tab:'delegated',due:'OVERDUE',priority:'HIGH',search:'nursing & IT',page:1,pageSize:20})
  })

  it('rejects unsupported query values instead of issuing invalid requests', () => {
    expect(dashboardWorkInitialFilters(new URLSearchParams('tab=not-real&due=INVALID'))).toMatchObject({tab:'attention',due:'ALL'})
  })
})
