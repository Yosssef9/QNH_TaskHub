import { ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { TaskList } from '@/features/tasks/components/TaskList'
import { useWorkCycles } from '@/features/work-cycles/hooks/use-work-cycles'

export function KpiTasksPage() {
  const { t } = useTranslation()
  const cyclesQuery = useWorkCycles()

  if (cyclesQuery.isPending) return <LoadingState />
  if (cyclesQuery.isError) return <ErrorState onRetry={() => void cyclesQuery.refetch()} />

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('kpiTasks.eyebrow')}
        title={t('kpiTasks.title')}
        description={t('kpiTasks.description')}
      />
      <div className="bg-primary/5 text-primary border-primary/15 flex items-start gap-3 rounded-xl border p-4 text-sm">
        <ListChecks className="mt-0.5 size-5 shrink-0" />
        <p>{t('kpiTasks.hint')}</p>
      </div>
      <TaskList cycles={cyclesQuery.data} />
    </div>
  )
}
