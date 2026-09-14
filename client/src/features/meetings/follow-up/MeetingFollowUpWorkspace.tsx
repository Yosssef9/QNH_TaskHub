import { ArrowLeft, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'

export function FollowUpWorkspaceCard({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={cn('overflow-hidden border-border/70 p-0 shadow-sm', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/[0.12] px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold leading-6">{title}</h2>
            {description ? (
              <p className="text-muted-foreground mt-0.5 text-xs leading-5 sm:text-sm">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </Card>
  )
}

export function FollowUpDetailHeader({
  icon: Icon,
  title,
  description,
  backLabel,
  onBack,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  backLabel: string
  onBack: () => void
  action?: ReactNode
}) {
  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={onBack}>
        <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
        {backLabel}
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            {description ? (
              <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  )
}

export function FollowUpMetricCard({
  icon: Icon,
  label,
  value,
  tone = 'blue',
  onClick,
}: {
  icon: LucideIcon
  label: string
  value: number
  tone?: 'blue' | 'green' | 'red' | 'violet'
  onClick?: () => void
}) {
  const toneClass = {
    blue: 'border-sky-200/70 bg-sky-50/70 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/25 dark:text-sky-300',
    green:
      'border-emerald-200/70 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-300',
    red: 'border-rose-200/70 bg-rose-50/70 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/25 dark:text-rose-300',
    violet:
      'border-violet-200/70 bg-violet-50/70 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/25 dark:text-violet-300',
  }[tone]

  const content = (
    <>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
        <p className="mt-1 truncate text-xs font-semibold sm:text-sm">{label}</p>
      </div>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/65 shadow-sm dark:bg-white/10">
        <Icon aria-hidden="true" className="size-5" />
      </span>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'focus-visible:ring-ring flex min-w-0 items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-start shadow-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none sm:px-5',
          toneClass,
        )}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      className={cn(
        'flex min-w-0 items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-start shadow-sm sm:px-5',
        toneClass,
      )}
    >
      {content}
    </div>
  )
}
