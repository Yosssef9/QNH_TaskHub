import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { ActionLink } from '@/components/shared/ActionLink'
import { taskHubEase } from '@/components/shared/TaskHubMotion'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

import type { PersonalKpi } from '../types/kpi.types'
import { kpiIcons } from './kpi-icons'

interface KpiTaskPillProps {
  kpi: PersonalKpi
  className?: string
  cycleId?: number | undefined
  instanceId?: number | undefined
}

function formatTarget(kpi: PersonalKpi, locale: string, noTarget: string): string {
  if (kpi.targetValue === null) return noTarget

  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(kpi.targetValue)

  return kpi.measurementUnit === 'PERCENT' ? `${formatted}%` : formatted
}

export function KpiTaskPill({ kpi, className, cycleId, instanceId }: KpiTaskPillProps) {
  const { i18n, t } = useTranslation()
  const Icon = kpiIcons[kpi.iconKey]
  const href = cycleId && instanceId ? `/work-cycles/${cycleId}/kpis/${instanceId}` : `/kpis/${kpi.id}`

  const target = formatTarget(kpi, i18n.language, t('kpis.noTarget'))
  const targetDirection = kpi.targetDirection
    ? t(`kpis.directions.${kpi.targetDirection}`)
    : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={href}
          aria-label={t('kpiTasks.openKpiLabel', { name: kpi.name })}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'focus-visible:ring-ring inline-flex min-w-0 rounded-full outline-none focus-visible:ring-2',
            className,
          )}
        >
          <motion.span
            whileHover={{
              y: -1,
              scale: 1.015,
              boxShadow: `0 7px 18px -12px ${kpi.color}B3, 0 0 0 1px ${kpi.color}55`,
            }}
            whileTap={{ scale: 0.985 }}
            transition={{
              duration: 0.16,
              ease: taskHubEase,
            }}
            className="inline-flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-1 text-start text-xs font-medium"
            style={{
              borderColor: `${kpi.color}40`,
              backgroundColor: `${kpi.color}12`,
            }}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" style={{ color: kpi.color }} />
            <span className="truncate">{kpi.name}</span>
          </motion.span>
        </Link>
      </TooltipTrigger>

      <TooltipContent
        side="top"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        className="bg-popover text-popover-foreground border-border w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border p-0 shadow-xl"
      >
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 start-0 w-1"
            style={{ backgroundColor: kpi.color }}
          />

          <div className="p-4 ps-5">
            <div className="flex items-start gap-3">
              <div
                className="grid size-9 shrink-0 place-items-center rounded-lg"
                style={{
                  color: kpi.color,
                  backgroundColor: `${kpi.color}14`,
                }}
              >
                <Icon aria-hidden="true" className="size-4.5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm leading-5 font-semibold">{kpi.name}</p>

                {kpi.description ? (
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
                    {kpi.description}
                  </p>
                ) : null}
              </div>
            </div>

            <dl className="mt-3.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t pt-3 text-xs">
              <dt className="text-muted-foreground">{t('kpis.method')}</dt>
              <dd className="text-foreground truncate font-medium">
                {t(`kpis.methods.${kpi.calculationMethod}`)}
              </dd>

              <dt className="text-muted-foreground">{t('kpis.period')}</dt>
              <dd className="text-foreground font-medium">{t(`kpis.periods.${kpi.periodType}`)}</dd>

              <dt className="text-muted-foreground">{t('kpis.target')}</dt>
              <dd className="text-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 font-medium">
                <span>{target}</span>
                {targetDirection ? (
                  <span className="text-muted-foreground font-normal">· {targetDirection}</span>
                ) : null}
              </dd>
            </dl>

            <ActionLink
              to={href}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className="mt-3 w-full border-t text-xs"
            >
              {t('kpiTasks.openKpi')}
            </ActionLink>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
