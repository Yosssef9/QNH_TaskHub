import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { buttonStyles } from '@/components/ui/button.styles'
import { KpiWorkspace } from '@/features/kpis/components/KpiWorkspace'
import { useWorkCycle } from '@/features/work-cycles/hooks/use-work-cycles'

export function KpiInstancePage() {
  const { t } = useTranslation()
  const params = useParams<{ cycleId: string; instanceId: string }>()
  const cycleId = Number(params.cycleId)
  const instanceId = Number(params.instanceId)
  const valid = Number.isSafeInteger(cycleId) && cycleId > 0 && Number.isSafeInteger(instanceId) && instanceId > 0
  const query = useWorkCycle(valid ? cycleId : null)

  if (!valid) return <Navigate to="/not-found" replace />
  if (query.isPending) return <LoadingState />
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />

  const cycle = query.data
  const instance = cycle.instances.find((item) => item.id === instanceId)
  if (!instance) return <Navigate to="/not-found" replace />

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={cycle.title}
        title={instance.name}
        description={instance.description ?? t('kpis.noDescription')}
        actions={
          <Link to={`/work-cycles/${cycle.id}`} className={buttonStyles({ variant: 'outline' })}>
            {t('workCycles.openCycle')}
          </Link>
        }
      />
      {cycle.closedAtUtc ? (
        <div className="bg-muted/60 text-muted-foreground flex items-start gap-3 rounded-xl border p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>{t('workCycles.readOnlyDescription')}</p>
        </div>
      ) : null}
      <KpiWorkspace instance={instance} />
    </div>
  )
}
