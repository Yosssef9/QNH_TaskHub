import { Inbox } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}

export function EmptyState({
  action,
  className,
  description,
  icon: Icon = Inbox,
  title,
}: EmptyStateProps) {
  const { t } = useTranslation()

  return (
    <section
      className={cn(
        'bg-card flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center',
        className,
      )}
    >
      <div className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-full">
        <Icon aria-hidden="true" className="size-6" />
      </div>
      <h2 className="mt-4 font-semibold">{title ?? t('states.emptyTitle')}</h2>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm leading-6">
        {description ?? t('states.emptyDescription')}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  )
}
