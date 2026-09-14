import { RotateCcw, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { TablePagination } from '@/components/shared/TablePagination'
import { AnimatedFetching, AnimatedState } from '@/components/shared/TaskHubMotion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AccessEditorDialog } from '@/features/access-management/components/AccessEditorDialog'
import { ContractAccessManager } from '@/features/access-management/components/ContractAccessManager'
import { AccessUsersTable } from '@/features/access-management/components/AccessUsersTable'
import { useAccessUsers } from '@/features/access-management/hooks/use-access-users'
import type {
  AccessKpiWorkCyclesFilter,
  AccessMeetingFilter,
  AccessPermissionFilter,
  AccessRoleFilter,
  AccessSortBy,
  AccessSortDirection,
  AccessStatusFilter,
  AccessUser,
} from '@/features/access-management/types/access.types'

interface FilterSelectProps {
  label: string
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
}

function FilterSelect({ children, label, onValueChange, value }: FilterSelectProps) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label className="text-muted-foreground block text-xs font-medium">{label}</label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

export function AccessManagementPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [roleFilter, setRoleFilter] = useState<AccessRoleFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<AccessStatusFilter>('ALL')
  const [procurementFilter, setProcurementFilter] = useState<AccessPermissionFilter>('ALL')
  const [kpiWorkCyclesFilter, setKpiWorkCyclesFilter] = useState<AccessKpiWorkCyclesFilter>('ALL')
  const [meetingFilter, setMeetingFilter] = useState<AccessMeetingFilter>('ALL')
  const [sortBy, setSortBy] = useState<AccessSortBy>('userName')
  const [sortDirection, setSortDirection] = useState<AccessSortDirection>('asc')
  const [selectedUser, setSelectedUser] = useState<AccessUser | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const usersQuery = useAccessUsers({
    search,
    role: roleFilter,
    status: statusFilter,
    procurement: procurementFilter,
    kpiWorkCycles: kpiWorkCyclesFilter,
    meetings: meetingFilter,
    sortBy,
    sortDirection,
    page,
    pageSize,
  })
  const data = usersQuery.data
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1
  const endRow = Math.min(page * pageSize, total)
  const resultsState = usersQuery.isPending
    ? 'loading'
    : usersQuery.isError || !data
      ? 'error'
      : data.items.length === 0
        ? 'empty'
        : 'content'
  const hasFilters =
    roleFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    procurementFilter !== 'ALL' ||
    kpiWorkCyclesFilter !== 'ALL' ||
    meetingFilter !== 'ALL'

  function changeSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function changeFilter<T extends string>(setter: (value: T) => void, value: string) {
    setter(value as T)
    setPage(1)
  }

  function clearFilters() {
    setRoleFilter('ALL')
    setStatusFilter('ALL')
    setProcurementFilter('ALL')
    setKpiWorkCyclesFilter('ALL')
    setMeetingFilter('ALL')
    setPage(1)
  }

  function changeSort(column: AccessSortBy) {
    if (sortBy === column) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDirection('asc')
    }
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('access.eyebrow')}
        title={t('access.title')}
        description={t('access.description')}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div>
              <h2 className="font-semibold">{t('access.usersTitle')}</h2>
              <p className="text-muted-foreground text-xs">{t('access.usersDescription')}</p>
            </div>
          </div>
          <SearchInput
            value={search}
            className="sm:max-w-sm"
            placeholder={t('access.searchPlaceholder')}
            ariaLabel={t('access.searchLabel')}
            onChange={changeSearch}
          />
        </div>

        <div className="bg-muted/20 border-b p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto] xl:items-end">
            <FilterSelect
              label={t('access.filters.role')}
              value={roleFilter}
              onValueChange={(value) => changeFilter(setRoleFilter, value)}
            >
              <SelectItem value="ALL">{t('access.filters.all')}</SelectItem>
              <SelectItem value="USER">{t('access.roles.USER')}</SelectItem>
              <SelectItem value="ADMIN">{t('access.roles.ADMIN')}</SelectItem>
              <SelectItem value="UNASSIGNED">{t('access.notAssigned')}</SelectItem>
            </FilterSelect>

            <FilterSelect
              label={t('access.filters.status')}
              value={statusFilter}
              onValueChange={(value) => changeFilter(setStatusFilter, value)}
            >
              <SelectItem value="ALL">{t('access.filters.all')}</SelectItem>
              <SelectItem value="ACTIVE">{t('access.active')}</SelectItem>
              <SelectItem value="INACTIVE">{t('access.inactive')}</SelectItem>
              <SelectItem value="UNASSIGNED">{t('access.notAssigned')}</SelectItem>
            </FilterSelect>

            <FilterSelect
              label={t('access.filters.procurement')}
              value={procurementFilter}
              onValueChange={(value) => changeFilter(setProcurementFilter, value)}
            >
              <SelectItem value="ALL">{t('access.filters.all')}</SelectItem>
              <SelectItem value="WITH_ACCESS">{t('access.filters.hasAccess')}</SelectItem>
              <SelectItem value="WITHOUT_ACCESS">{t('access.filters.noAccess')}</SelectItem>
            </FilterSelect>

            <FilterSelect
              label={t('access.filters.kpiWorkCycles')}
              value={kpiWorkCyclesFilter}
              onValueChange={(value) => changeFilter(setKpiWorkCyclesFilter, value)}
            >
              <SelectItem value="ALL">{t('access.filters.all')}</SelectItem>
              <SelectItem value="WITH_ACCESS">{t('access.filters.hasAccess')}</SelectItem>
              <SelectItem value="WITHOUT_ACCESS">{t('access.filters.noAccess')}</SelectItem>
            </FilterSelect>

            <FilterSelect
              label={t('access.filters.meetings')}
              value={meetingFilter}
              onValueChange={(value) => changeFilter(setMeetingFilter, value)}
            >
              <SelectItem value="ALL">{t('access.filters.all')}</SelectItem>
              <SelectItem value="ORGANIZER">{t('access.filters.meetingOrganizerOnly')}</SelectItem>
              <SelectItem value="COORDINATOR">{t('access.filters.meetingCoordinatorOnly')}</SelectItem>
              <SelectItem value="BOTH">{t('access.filters.meetingBoth')}</SelectItem>
              <SelectItem value="NONE">{t('access.filters.meetingNone')}</SelectItem>
            </FilterSelect>

            <Button
              type="button"
              variant="outline"
              className="w-full xl:w-auto"
              disabled={!hasFilters}
              onClick={clearFilters}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              {t('access.filters.reset')}
            </Button>
          </div>
        </div>

        <AnimatedState stateKey={resultsState}>
          {usersQuery.isPending ? (
            <LoadingState className="rounded-none border-0" />
          ) : usersQuery.isError || !data ? (
            <ErrorState
              className="rounded-none border-0"
              onRetry={() => void usersQuery.refetch()}
            />
          ) : (
            <AnimatedFetching busy={usersQuery.isPlaceholderData}>
              <AccessUsersTable
                users={data.items}
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSort={changeSort}
                onEdit={(user) => {
                  setSelectedUser(user)
                  setEditorOpen(true)
                }}
              />
              <TablePagination
                page={page}
                pageSize={pageSize}
                totalPages={totalPages}
                startRow={startRow}
                endRow={endRow}
                totalRows={data.total}
                pageSizes={[20, 50]}
                onPageChange={setPage}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize)
                  setPage(1)
                }}
              />
            </AnimatedFetching>
          )}
        </AnimatedState>
      </Card>

      <ContractAccessManager />

      <AccessEditorDialog
        user={selectedUser}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  )
}
