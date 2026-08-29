import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListChecks,
  ListTodo,
  Repeat2,
  Star,
  Target,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { ActionLink } from '@/components/shared/ActionLink'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { buttonStyles } from '@/components/ui/button.styles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { appIcons } from '@/config/app-icons'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { useDashboard } from '@/features/dashboard/hooks/use-dashboard'
import type { DashboardKpiPerformance } from '@/features/dashboard/types/dashboard.types'
import { cn } from '@/lib/cn'

function formatDate(value: string | null, locale: string) {
  if (!value) return null
  return new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function metric(value: number | null, unit: 'PERCENT' | 'NUMBER', locale: string) {
  if (value === null) return '—'
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
  return unit === 'PERCENT' ? `${formatted}%` : formatted
}

function progressWidth(item: DashboardKpiPerformance) {
  if (item.targetAchievement !== null) return Math.max(0, Math.min(100, item.targetAchievement))
  if (item.measurementUnit === 'PERCENT' && item.actualValue !== null) {
    return Math.max(0, Math.min(100, item.actualValue))
  }
  return 0
}

export function HomePage() {
  const { i18n, t } = useTranslation()
  const { data: userData } = useCurrentUser()
  const dashboard = useDashboard()

  if (dashboard.isPending) return <LoadingState />
  if (dashboard.isError) return <ErrorState onRetry={() => void dashboard.refetch()} />

  const data = dashboard.data
  const cycle = data.currentCycle
  const summary = data.cycleSummary

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('home.eyebrow')}
        title={t('home.title', { name: userData?.user.userName || t('home.fallbackName') })}
        description={t('home.description')}
        actions={
          <Link to="/work-cycles" className={buttonStyles({ variant: 'outline' })}>
            <Repeat2 className="size-4" />
            {t('home.manageCycles')}
          </Link>
        }
      />

      {cycle && summary ? (
        <Link
          to={`/work-cycles/${cycle.id}`}
          aria-label={`${t('home.continueCycle')}: ${cycle.title}`}
          className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="relative overflow-hidden border-primary/20 shadow-sm transition hover:border-primary/35 hover:shadow-md">
            <div
              className="absolute inset-y-0 start-0 w-1.5"
              style={{ backgroundColor: cycle.color }}
              aria-hidden="true"
            />
            <CardContent className="p-6 sm:p-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                      <Star className="size-3.5 fill-current" />
                      {t('home.currentCycle')}
                    </span>
                    <span className="bg-success/10 text-success rounded-full px-3 py-1 text-xs font-medium">
                      {t('workCycles.statusOpen')}
                    </span>
                  </div>

                  <div className="flex items-start gap-3">
                    {(() => {
                      const Icon = appIcons[cycle.iconKey]
                      return (
                        <span
                          className="grid size-12 shrink-0 place-items-center rounded-xl"
                          style={{ color: cycle.color, backgroundColor: `${cycle.color}18` }}
                        >
                          <Icon className="size-6" />
                        </span>
                      )
                    })()}
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{cycle.title}</h2>
                      <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
                        {cycle.description || t('workCycles.noDescription')}
                      </p>
                    </div>
                  </div>

                  {cycle.startDate || cycle.endDate ? (
                    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                      <CalendarDays className="size-4" />
                      <span>
                        {[formatDate(cycle.startDate, i18n.language), formatDate(cycle.endDate, i18n.language)]
                          .filter(Boolean)
                          .join(' — ')}
                      </span>
                    </div>
                  ) : null}
                </div>

                <ActionLink variant="prominent" className="shrink-0">
                  {t('home.continueCycle')}
                </ActionLink>
              </div>

              <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{t('home.overallProgress')}</span>
                    <span className="font-bold tabular-nums">
                      {summary.total ? Math.round((summary.completed / summary.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${summary.total ? Math.round((summary.completed / summary.total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      [t('workCycles.totalTasks'), summary.total],
                      [t('home.completed'), summary.completed],
                      [t('home.overdue'), summary.overdue],
                      [t('home.kpis'), cycle.instances.length],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="bg-muted/45 rounded-lg px-3 py-3 text-center">
                        <p className="text-xl font-bold tabular-nums">{value}</p>
                        <p className="text-muted-foreground mt-0.5 text-xs">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="mb-3 text-sm font-semibold">{t('home.kpiHealth')}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-success/10 text-success-foreground rounded-lg p-3">
                      <p className="text-xl font-bold tabular-nums">{data.kpiHealth.met}</p>
                      <p className="mt-0.5 text-xs">{t('home.kpiMet')}</p>
                    </div>
                    <div className="bg-destructive/10 text-destructive rounded-lg p-3">
                      <p className="text-xl font-bold tabular-nums">{data.kpiHealth.notMet}</p>
                      <p className="mt-0.5 text-xs">{t('home.kpiNotMet')}</p>
                    </div>
                    <div className="bg-muted text-muted-foreground rounded-lg p-3">
                      <p className="text-xl font-bold tabular-nums">{data.kpiHealth.noData}</p>
                      <p className="mt-0.5 text-xs">{t('home.kpiNoData')}</p>
                    </div>
                    <div className="bg-primary/8 text-primary rounded-lg p-3">
                      <p className="text-xl font-bold tabular-nums">{data.kpiHealth.noTarget}</p>
                      <p className="mt-0.5 text-xs">{t('home.kpiNoTarget')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center px-6 py-12 text-center">
            <span className="bg-primary/8 text-primary grid size-12 place-items-center rounded-xl">
              <Star className="size-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">
              {data.openCycleCount > 1 ? t('home.chooseCurrentTitle') : t('home.noCurrentTitle')}
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-6">
              {data.openCycleCount > 1
                ? t('home.chooseCurrentDescription')
                : t('home.noCurrentDescription')}
            </p>
            <Link to="/work-cycles" className={cn(buttonStyles(), 'mt-5')}>
              <Star className="size-4" />
              {data.openCycleCount > 1 ? t('home.chooseCurrentAction') : t('home.openWorkCycles')}
            </Link>
          </CardContent>
        </Card>
      )}

      {cycle && summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={AlertTriangle} label={t('home.overdue')} value={summary.overdue} tone="danger" to={`/work-cycles/${cycle.id}`} />
          <SummaryCard icon={Clock3} label={t('home.dueToday')} value={summary.dueToday} tone="warning" to={`/work-cycles/${cycle.id}`} />
          <SummaryCard icon={ListChecks} label={t('home.inProgress')} value={summary.inProgress} tone="info" to={`/work-cycles/${cycle.id}`} />
          <SummaryCard icon={CheckCircle2} label={t('home.completed')} value={summary.completed} tone="success" to={`/work-cycles/${cycle.id}`} />
        </div>
      ) : null}

      {cycle ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{t('home.attentionTitle')}</CardTitle>
                <p className="text-muted-foreground mt-1 text-sm">{t('home.attentionDescription')}</p>
              </div>
              <AlertTriangle className="text-warning size-5" />
            </CardHeader>
            <CardContent>
              {data.attentionTasks.length ? (
                <div className="divide-y">
                  {data.attentionTasks.map((task) => (
                    <Link
                      key={task.id}
                      to={`/work-cycles/${cycle.id}/kpis/${task.kpiInstanceId}`}
                      className="hover:bg-muted/45 -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors"
                    >
                      <span
                        className={cn(
                          'mt-0.5 size-2.5 shrink-0 rounded-full',
                          task.isOverdue ? 'bg-destructive' : task.dueDate ? 'bg-warning' : 'bg-info',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="text-muted-foreground mt-0.5 truncate text-xs">{task.kpiName}</p>
                      </div>
                      <span className={cn('shrink-0 text-xs font-medium', task.isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
                        {task.isOverdue
                          ? t('home.overdueTask')
                          : task.dueDate
                            ? formatDate(task.dueDate, i18n.language)
                            : t('tasks.noDueDate')}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground py-8 text-center text-sm">{t('home.noAttention')}</div>
              )}
              <ActionLink to={`/work-cycles/${cycle.id}`} className="mt-4">
                {t('home.viewCycleTasks')}
              </ActionLink>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('home.personalTitle')}</CardTitle>
              <p className="text-muted-foreground text-sm">{t('home.personalDescription')}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-destructive/10 rounded-lg p-3">
                  <p className="text-destructive text-xl font-bold tabular-nums">{data.personalSummary.overdue}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{t('home.overdue')}</p>
                </div>
                <div className="bg-warning/10 rounded-lg p-3">
                  <p className="text-xl font-bold tabular-nums">{data.personalSummary.dueToday}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{t('home.dueToday')}</p>
                </div>
                <div className="bg-info/10 rounded-lg p-3">
                  <p className="text-xl font-bold tabular-nums">{data.personalSummary.inProgress}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{t('home.inProgress')}</p>
                </div>
              </div>
              {data.personalSummary.defaultListId ? (
                <ActionLink to={`/lists/${data.personalSummary.defaultListId}`}>
                  {t('home.openMyTasks')}
                </ActionLink>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!cycle ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('home.personalTitle')}</CardTitle>
            <p className="text-muted-foreground text-sm">{t('home.personalDescription')}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-destructive/10 rounded-lg p-3">
                <p className="text-destructive text-xl font-bold tabular-nums">{data.personalSummary.overdue}</p>
                <p className="text-muted-foreground mt-1 text-xs">{t('home.overdue')}</p>
              </div>
              <div className="bg-warning/10 rounded-lg p-3">
                <p className="text-xl font-bold tabular-nums">{data.personalSummary.dueToday}</p>
                <p className="text-muted-foreground mt-1 text-xs">{t('home.dueToday')}</p>
              </div>
              <div className="bg-info/10 rounded-lg p-3">
                <p className="text-xl font-bold tabular-nums">{data.personalSummary.inProgress}</p>
                <p className="text-muted-foreground mt-1 text-xs">{t('home.inProgress')}</p>
              </div>
            </div>
            {data.personalSummary.defaultListId ? (
              <ActionLink to={`/lists/${data.personalSummary.defaultListId}`}>
                {t('home.openMyTasks')}
              </ActionLink>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {cycle ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{t('home.kpiPerformanceTitle')}</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">{t('home.kpiPerformanceDescription')}</p>
            </div>
            <Target className="text-primary size-5" />
          </CardHeader>
          <CardContent>
            {data.kpiPerformance.length ? (
              <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
                {data.kpiPerformance.map((item) => (
                  <Link
                    key={item.instanceId}
                    to={`/work-cycles/${cycle.id}/kpis/${item.instanceId}`}
                    className="hover:bg-muted/35 rounded-lg p-2 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.name}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {t('kpis.target')}: {metric(item.targetValue, item.measurementUnit, i18n.language)}
                        </p>
                      </div>
                      <div className="shrink-0 text-end">
                        <p className="text-base font-bold tabular-nums">{metric(item.actualValue, item.measurementUnit, i18n.language)}</p>
                        <span className={cn('text-xs font-medium', item.status === 'MET' ? 'text-success' : item.status === 'NOT_MET' ? 'text-destructive' : 'text-muted-foreground')}>
                          {t(`kpis.results.${item.status}`)}
                        </span>
                      </div>
                    </div>
                    <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          item.status === 'MET'
                            ? 'bg-success'
                            : item.status === 'NOT_MET'
                              ? 'bg-destructive'
                              : 'bg-primary/50',
                        )}
                        style={{ width: `${progressWidth(item)}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground py-8 text-center text-sm">{t('home.noKpiPerformance')}</div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('home.quickActions')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLink to="/work-cycles" icon={Repeat2} label={t('home.workCyclesAction')} />
          <QuickLink to="/kpi-tasks" icon={ListChecks} label={t('home.kpiTasksAction')} />
          <QuickLink to="/kpis" icon={Target} label={t('home.kpiLibraryAction')} />
          {data.personalSummary.defaultListId ? (
            <QuickLink
              to={`/lists/${data.personalSummary.defaultListId}`}
              icon={ListTodo}
              label={t('home.myTasksAction')}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
  to,
}: {
  icon: typeof AlertTriangle
  label: string
  value: number
  tone: 'danger' | 'warning' | 'info' | 'success'
  to: string
}) {
  const toneClasses = {
    danger: 'bg-destructive/10 text-destructive',
    warning: 'bg-warning/10 text-warning-foreground',
    info: 'bg-info/10 text-info-foreground',
    success: 'bg-success/10 text-success-foreground',
  } as const

  return (
    <Link to={to} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full transition hover:border-primary/20 hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-5">
          <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', toneClasses[tone])}>
            <Icon className="size-5" />
          </span>
          <div>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-muted-foreground mt-0.5 text-sm">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: typeof Repeat2; label: string }) {
  return (
    <Link
      to={to}
      className="hover:bg-muted/60 flex items-center gap-3 rounded-xl border p-4 text-sm font-medium transition-colors"
    >
      <span className="bg-primary/8 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
        <Icon className="size-4" />
      </span>
      <span>{label}</span>
    </Link>
  )
}
