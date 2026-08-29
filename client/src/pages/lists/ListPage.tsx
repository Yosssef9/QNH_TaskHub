import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { useLists } from '@/features/lists/hooks/use-lists'
import { TaskList } from '@/features/tasks/components/TaskList'

export function ListPage() {
  const { t } = useTranslation()
  const params = useParams<{ listId: string }>()
  const listsQuery = useLists()

  if (listsQuery.isPending) return <LoadingState />
  if (listsQuery.isError) return <ErrorState onRetry={() => void listsQuery.refetch()} />

  const listId = Number(params.listId)
  const list = listsQuery.data.find((item) => Number(item.id) === listId)
  if (!list) return <Navigate to="/not-found" replace />

  const name = list.isDefault ? t('lists.myTasks') : list.name
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('lists.eyebrow')}
        title={name}
        description={t('lists.pageDescription')}
      />
      <TaskList listId={listId} lists={listsQuery.data} />
    </div>
  )
}
