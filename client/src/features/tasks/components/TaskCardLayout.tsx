import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Consistent responsive task-card structure, shared by personal, assigned and
 * Meeting Action tasks. Physical placement mirrors with the page direction:
 * completion + title on the inline-start edge; tags on the opposite edge.
 * No absolute-positioned tags or overlapping action controls.
 */
export function TaskCardLayout({
  completion,
  title,
  tags,
  details,
  metadata,
  actions,
}: {
  completion?: ReactNode
  title: ReactNode
  tags?: ReactNode
  details?: ReactNode
  metadata: ReactNode
  actions?: ReactNode
}) {
  return (
    <div data-testid="task-card-layout" className={cn(
      'grid w-full min-w-0 items-start gap-x-3 sm:gap-x-4',
      completion ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1',
    )}>
      {completion ? <div className="pt-0.5">{completion}</div> : null}
      <div className="min-w-0 space-y-2.5">
        <div data-testid="task-card-header" className="grid min-w-0 grid-cols-1 items-start gap-x-4 gap-y-2 min-[640px]:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">{title}</div>
          {tags ? (
            <div data-testid="task-card-tags" className="min-w-0 max-w-full min-[640px]:max-w-72 min-[640px]:justify-self-end">
              {tags}
            </div>
          ) : null}
        </div>
        {details ? <div className="min-w-0 space-y-2">{details}</div> : null}
        <div data-testid="task-card-footer" className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs">{metadata}</div>
          {actions ? (
            <div data-testid="task-card-actions" className="flex shrink-0 items-center gap-1" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
