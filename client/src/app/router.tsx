import { createBrowserRouter } from 'react-router'

import App from '@/App'
import { RequireAuth } from '@/features/auth/components/RequireAuth'
import { RequireContractsAccess } from '@/features/contracts/components/RequireContractsAccess'
import { RequireMeetingAccess } from '@/features/meetings/components/RequireMeetingAccess'
import { AdminAccessRoute } from '@/pages/admin/AdminAccessRoute'
import { AdminHolidaysRoute } from '@/pages/admin/AdminHolidaysRoute'
import { AdminMeetingRoomsRoute } from '@/pages/admin/AdminMeetingRoomsRoute'
import { CalendarPage } from '@/pages/calendar/CalendarPage'
import { HomePage } from '@/pages/home/HomePage'
import { ContractsPage } from '@/pages/contracts/ContractsPage'
import { ContractDetailsPage } from '@/pages/contracts/ContractDetailsPage'
import { SuppliersPage } from '@/pages/contracts/SuppliersPage'
import { SupplierDetailsPage } from '@/pages/contracts/SupplierDetailsPage'
import { KpisPage } from '@/pages/kpis/KpisPage'
import { loadKpiTasksPage } from '@/pages/kpi-tasks/kpi-tasks.loader'
import { KpiTasksPage } from '@/pages/kpi-tasks/KpiTasksPage'
import { ListPage } from '@/pages/lists/ListPage'
import { MeetingCoordinationPage } from '@/pages/meetings/MeetingCoordinationPage'
import { MeetingDetailsPage } from '@/pages/meetings/MeetingDetailsPage'
import { MeetingRequestsPage } from '@/pages/meetings/MeetingRequestsPage'
import { MeetingSchedulePage } from '@/pages/meetings/MeetingSchedulePage'
import { MeetingTemplatesPage } from '@/pages/meetings/MeetingTemplatesPage'
import { MeetingsPage } from '@/pages/meetings/MeetingsPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { ForbiddenPage } from '@/pages/system/ForbiddenPage'
import { NotFoundPage } from '@/pages/system/NotFoundPage'
import { KpiInstancePage } from '@/pages/work-cycles/KpiInstancePage'
import { WorkCyclePage } from '@/pages/work-cycles/WorkCyclePage'
import { WorkCyclesPage } from '@/pages/work-cycles/WorkCyclesPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RequireAuth>
        <App />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'meetings', element: <MeetingsPage /> },
      {
        path: 'meetings/requests',
        element: (
          <RequireMeetingAccess capability="ORGANIZER">
            <MeetingRequestsPage />
          </RequireMeetingAccess>
        ),
      },
      {
        path: 'meetings/coordination',
        element: (
          <RequireMeetingAccess capability="COORDINATOR">
            <MeetingCoordinationPage />
          </RequireMeetingAccess>
        ),
      },
      {
        path: 'meetings/schedule',
        element: (
          <RequireMeetingAccess capability="ORGANIZE_OR_COORDINATE">
            <MeetingSchedulePage />
          </RequireMeetingAccess>
        ),
      },
      {
        path: 'meetings/templates',
        element: (
          <RequireMeetingAccess capability="ORGANIZE_OR_COORDINATE">
            <MeetingTemplatesPage />
          </RequireMeetingAccess>
        ),
      },
      { path: 'meetings/:meetingId', element: <MeetingDetailsPage /> },
      { path: 'lists/:listId', element: <ListPage /> },
      { path: 'work-cycles', element: <WorkCyclesPage /> },
      { path: 'work-cycles/:cycleId', element: <WorkCyclePage /> },
      { path: 'work-cycles/:cycleId/kpis/:instanceId', element: <KpiInstancePage /> },
      { path: 'kpis', element: <KpisPage /> },
      { path: 'kpis/:kpiId', element: <KpisPage /> },
      { path: 'kpi-tasks', loader: loadKpiTasksPage, element: <KpiTasksPage /> },
      {
        path: 'contracts',
        element: (
          <RequireContractsAccess>
            <ContractsPage />
          </RequireContractsAccess>
        ),
      },
      {
        path: 'contracts/suppliers',
        element: (
          <RequireContractsAccess>
            <SuppliersPage />
          </RequireContractsAccess>
        ),
      },
      {
        path: 'contracts/suppliers/:supplierId',
        element: (
          <RequireContractsAccess>
            <SupplierDetailsPage />
          </RequireContractsAccess>
        ),
      },
      {
        path: 'contracts/:contractId',
        element: (
          <RequireContractsAccess>
            <ContractDetailsPage />
          </RequireContractsAccess>
        ),
      },
      { path: 'settings', element: <SettingsPage /> },
      {
        path: 'admin/access',
        element: <AdminAccessRoute />,
      },
      { path: 'admin/holidays', element: <AdminHolidaysRoute /> },
      { path: 'admin/meeting-rooms', element: <AdminMeetingRoomsRoute /> },
      { path: 'forbidden', element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
