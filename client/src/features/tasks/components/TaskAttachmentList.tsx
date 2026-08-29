import { Download, File, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { taskHubItemMotion } from '@/components/shared/TaskHubMotion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

import type { TaskAttachment } from '../types/task.types'

interface Props {
  attachments: TaskAttachment[]
  emptyLabel?: string
  compact?: boolean
  readOnly: boolean
  onOpen: (attachment: TaskAttachment) => void
  onDownload: (attachment: TaskAttachment) => void
  onDelete: (attachment: TaskAttachment) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function TaskAttachmentList({
  attachments,
  emptyLabel,
  compact = false,
  readOnly,
  onOpen,
  onDownload,
  onDelete,
}: Props) {
  const { t } = useTranslation()

  if (attachments.length === 0) {
    return emptyLabel ? (
      <p
        className={cn(
          'text-muted-foreground text-sm',
          compact ? 'py-1' : 'rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center',
        )}
      >
        {emptyLabel}
      </p>
    ) : null
  }

  return (
    <ul className={cn(compact ? 'space-y-1.5' : 'space-y-2')}>
      <AnimatePresence initial={false}>
        {attachments.map((item) => (
          <motion.li
            key={item.id}
            initial={taskHubItemMotion.initial}
            animate={taskHubItemMotion.animate}
            exit={taskHubItemMotion.exit}
            transition={taskHubItemMotion.transition}
            role="button"
            tabIndex={0}
            aria-label={t('tasks.details.openAttachment', { name: item.originalFileName })}
            onClick={() => onOpen(item)}
            onKeyDown={(event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault()
                onOpen(item)
              }
            }}
            className={cn(
              'group focus-visible:ring-ring flex cursor-pointer items-center gap-3 border outline-none transition-[background-color,border-color,box-shadow] focus-visible:ring-2',
              compact
                ? 'hover:bg-background/80 rounded-lg bg-background/55 px-3 py-2'
                : 'hover:border-primary/20 hover:bg-accent/35 rounded-xl bg-card p-3 shadow-sm hover:shadow-md',
            )}
          >
            <span
              className={cn(
                'bg-primary/8 text-primary grid shrink-0 place-items-center rounded-lg',
                compact ? 'size-8' : 'size-10',
              )}
            >
              <File className={compact ? 'size-4' : 'size-5'} />
            </span>

            <div className="min-w-0 flex-1">
              <p className={cn('truncate font-medium', compact ? 'text-xs' : 'text-sm')}>
                {item.originalFileName}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[11px]">{formatBytes(item.sizeBytes)}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1 opacity-75 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('text-muted-foreground hover:text-foreground', compact ? 'size-8' : 'size-9')}
                onClick={(event) => {
                  event.stopPropagation()
                  onDownload(item)
                }}
                aria-label={t('tasks.details.download')}
              >
                <Download className="size-4" />
              </Button>

              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                    compact ? 'size-8' : 'size-9',
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(item)
                  }}
                  aria-label={t('tasks.details.removeAttachment')}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}
