import { createBrowserRouter } from 'react-router'

import App from '@/App'
import { RequireAuth } from '@/features/auth/components/RequireAuth'
import { RequireMeetingAccess } from '@/features/meetings/components/RequireMeetingAccess'
import { RequireAccessPermission } from '@/features/auth/components/RequireAccessPermission'
import { AdminAccessRoute } from '@/pages/admin/AdminAccessRoute'
import { AdminHolidaysRoute } from '@/pages/admin/AdminHolidaysRoute'
import { AdminMeetingRoomsRoute } from '@/pages/admin/AdminMeetingRoomsRoute'
import { CalendarPage } from '@/pages/calendar/CalendarPage'
import { ContractDetailsPage } from '@/pages/contracts/ContractDetailsPage'
import { ContractsPage } from '@/pages/contracts/ContractsPage'
import { HomePage } from '@/pages/home/HomePage'
import { ItemDetailsPage } from '@/pages/items/ItemDetailsPage'
import { ItemsPage } from '@/pages/items/ItemsPage'
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
import { PriceQuotesPage } from '@/pages/price-quotes/PriceQuotesPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { SupplierDetailsPage } from '@/pages/suppliers/SupplierDetailsPage'
import { SuppliersPage } from '@/pages/suppliers/SuppliersPage'
import { ForbiddenPage } from '@/pages/system/ForbiddenPage'
import { NotFoundPage } from '@/pages/system/NotFoundPage'
import { KpiInstancePage } from '@/pages/work-cycles/KpiInstancePage'
import { WorkCyclePage } from '@/pages/work-cycles/WorkCyclePage'
import { WorkCyclesPage } from '@/pages/work-cycles/WorkCyclesPage'

const routerBasename =
  import.meta.env.BASE_URL === '/' ? '/' : import.meta.env.BASE_URL.replace(/\/$/, '')

export const router = createBrowserRouter(
  [
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

        {
          path: 'meetings/:meetingId',
          element: <MeetingDetailsPage />,
        },

        {
          path: 'lists/:listId',
          element: <ListPage />,
        },

        {
          path: 'work-cycles',
          element: <WorkCyclesPage />,
        },

        {
          path: 'work-cycles/:cycleId',
          element: <WorkCyclePage />,
        },

        {
          path: 'work-cycles/:cycleId/kpis/:instanceId',
          element: <KpiInstancePage />,
        },

        {
          path: 'kpis',
          element: <KpisPage />,
        },

        {
          path: 'kpis/:kpiId',
          element: <KpisPage />,
        },

        {
          path: 'kpi-tasks',
          loader: loadKpiTasksPage,
          element: <KpiTasksPage />,
        },

        {
          path: 'contracts',
          element: (
            <RequireAccessPermission entity="CONTRACTS">
              <ContractsPage />
            </RequireAccessPermission>
          ),
        },

        {
          path: 'items',
          element: (
            <RequireAccessPermission entity="ITEMS">
              <ItemsPage />
            </RequireAccessPermission>
          ),
        },

        {
          path: 'items/:itemId',
          element: (
            <RequireAccessPermission entity="ITEMS">
              <ItemDetailsPage />
            </RequireAccessPermission>
          ),
        },

        {
          path: 'suppliers',
          element: (
            <RequireAccessPermission entity="SUPPLIERS">
              <SuppliersPage />
            </RequireAccessPermission>
          ),
        },

        {
          path: 'suppliers/:supplierId',
          element: (
            <RequireAccessPermission entity="SUPPLIERS">
              <SupplierDetailsPage />
            </RequireAccessPermission>
          ),
        },

        {
          path: 'price-quotes',
          element: (
            <RequireAccessPermission entity="PRICE_QUOTES">
              <PriceQuotesPage />
            </RequireAccessPermission>
          ),
        },

        {
          path: 'contracts/suppliers',
          element: (
            <RequireAccessPermission entity="SUPPLIERS">
              <SuppliersPage />
            </RequireAccessPermission>
          ),
        },

        {
          path: 'contracts/suppliers/:supplierId',
          element: (
            <RequireAccessPermission entity="SUPPLIERS">
              <SupplierDetailsPage />
            </RequireAccessPermission>
          ),
        },

        {
          path: 'contracts/:contractId',
          element: (
            <RequireAccessPermission entity="CONTRACTS">
              <ContractDetailsPage />
            </RequireAccessPermission>
          ),
        },

        {
          path: 'settings',
          element: <SettingsPage />,
        },

        {
          path: 'admin/access',
          element: <AdminAccessRoute />,
        },

        {
          path: 'admin/holidays',
          element: <AdminHolidaysRoute />,
        },

        {
          path: 'admin/meeting-rooms',
          element: <AdminMeetingRoomsRoute />,
        },

        {
          path: 'forbidden',
          element: <ForbiddenPage />,
        },

        {
          path: '*',
          element: <NotFoundPage />,
        },
      ],
    },
  ],
  {
    basename: routerBasename,
  },
)
