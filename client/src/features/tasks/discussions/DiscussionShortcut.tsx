import { MessageCircleMore } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

/** Shown only for server-authorized, multi-person discussion scopes. */
export function DiscussionShortcut({
  available, unread = 0, onOpen,
}: {
  available: boolean
  unread?: number
  onOpen: () => void
}) {
  const { t } = useTranslation()
  if (!available) return null
  const count = Math.max(0, unread)
  const label = count > 0
    ? t('discussions.unreadShortcut', { count })
    : t('discussions.openShortcut')

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={event => { event.stopPropagation(); onOpen() }}
      className={cn(
        'focus-visible:ring-ring relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none',
        count > 0
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'border-border bg-background text-muted-foreground hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40',
      )}
    >
      <MessageCircleMore aria-hidden="true" className="size-[19px]" strokeWidth={2} />
      {count > 0 ? <span aria-hidden="true" className="bg-primary text-primary-foreground absolute -end-2 -top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums shadow-sm">
        {count > 99 ? '99+' : count}
      </span> : null}
    </button>
  )
}
