import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { TablePagination } from '@/components/shared/TablePagination'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { AnimatedFetching, AnimatedState } from '@/components/shared/TaskHubMotion'
import { Card } from '@/components/ui/card'
import { AccessEditorDialog } from '@/features/access-management/components/AccessEditorDialog'
import { AccessUsersTable } from '@/features/access-management/components/AccessUsersTable'
import { useAccessUsers } from '@/features/access-management/hooks/use-access-users'
import type { AccessUser } from '@/features/access-management/types/access.types'

export function AccessManagementPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedUser, setSelectedUser] = useState<AccessUser | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const usersQuery = useAccessUsers({
    search,
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

  function changeSearch(value: string) {
    setSearch(value)
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

      <AccessEditorDialog
        user={selectedUser}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  )
}
