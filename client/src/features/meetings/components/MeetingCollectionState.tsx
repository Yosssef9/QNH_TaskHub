import { CalendarDays, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { cn } from '@/lib/cn'

interface MeetingCollectionStateProps {
  pending: boolean
  error: boolean
  empty: boolean
  emptyTitle: string
  emptyDescription: string
  onRetry: () => void
  children: ReactNode
  icon?: LucideIcon
  className?: string
}

export function MeetingCollectionState({
  pending,
  error,
  empty,
  emptyTitle,
  emptyDescription,
  onRetry,
  children,
  icon = CalendarDays,
  className,
}: MeetingCollectionStateProps) {
  if (pending) return <LoadingState className="min-h-32" />
  if (error) return <ErrorState className="min-h-32" onRetry={onRetry} />

  if (empty) {
    return (
      <EmptyState
        icon={icon}
        title={emptyTitle}
        description={emptyDescription}
        className="min-h-40"
      />
    )
  }

  return <div className={cn('grid gap-4 xl:grid-cols-2', className)}>{children}</div>
}
