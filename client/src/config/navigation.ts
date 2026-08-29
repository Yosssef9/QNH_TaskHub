import { CalendarDays, CalendarRange, House, Settings, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TaskHubRoleCode } from '@/features/auth/types/auth.types'

export interface NavigationItem {
  to: string
  labelKey:
    | 'navigation.home'
    | 'navigation.calendar'
    | 'navigation.settings'
    | 'navigation.accessManagement'
    | 'navigation.holidays'
  icon: LucideIcon
  end: boolean
  requiredRole?: TaskHubRoleCode
}

export const navigationItems: readonly NavigationItem[] = [
  {
    to: '/',
    labelKey: 'navigation.home',
    icon: House,
    end: true,
  },
  {
    to: '/calendar',
    labelKey: 'navigation.calendar',
    icon: CalendarRange,
    end: true,
  },
  {
    to: '/settings',
    labelKey: 'navigation.settings',
    icon: Settings,
    end: true,
  },
  {
    to: '/admin/access',
    labelKey: 'navigation.accessManagement',
    icon: ShieldCheck,
    end: true,
    requiredRole: 'ADMIN',
  },
  {
    to: '/admin/holidays',
    labelKey: 'navigation.holidays',
    icon: CalendarDays,
    end: true,
    requiredRole: 'ADMIN',
  },
]
