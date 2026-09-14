import { ChevronDown, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface MeetingFollowUpSectionProps {
  icon: LucideIcon
  title: ReactNode
  summary?: ReactNode
  action?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  expandLabel: string
  collapseLabel: string
  className?: string
}

const smoothEase = [0.22, 1, 0.36, 1] as const

export function MeetingFollowUpSection({
  icon: Icon,
  title,
  summary,
  action,
  children,
  defaultOpen = false,
  expandLabel,
  collapseLabel,
  className,
}: MeetingFollowUpSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const shouldReduceMotion = useReducedMotion()
  const triggerId = useId()
  const panelId = useId()

  return (
    <section className={cn('bg-card overflow-hidden rounded-xl border shadow-sm', className)}>
      <div className="flex items-stretch gap-2">
        <button
          id={triggerId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? collapseLabel : expandLabel}
          className="group focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-start outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-inset sm:px-5"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
            <Icon aria-hidden="true" className="size-5" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold sm:text-base">{title}</span>
            {summary !== undefined && summary !== null ? (
              <span className="text-muted-foreground mt-0.5 block truncate text-xs sm:text-sm">
                {summary}
              </span>
            ) : null}
          </span>

          <motion.span
            aria-hidden="true"
            className="text-muted-foreground group-hover:text-foreground grid size-8 shrink-0 place-items-center rounded-lg transition-colors"
            animate={{ rotate: open ? 180 : 0 }}
            transition={
              shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeInOut' }
            }
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </button>

        {action ? (
          <div className="flex shrink-0 items-center py-2.5 pe-3 sm:pe-4">{action}</div>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={triggerId}
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    height: { duration: 0.36, ease: smoothEase },
                    opacity: { duration: 0.2, ease: 'easeOut' },
                  }
            }
            className="overflow-hidden"
          >
            <motion.div
              initial={shouldReduceMotion ? false : { y: -5 }}
              animate={{ y: 0 }}
              {...(!shouldReduceMotion ? { exit: { y: -5 } } : {})}
              transition={
                shouldReduceMotion ? { duration: 0 } : { duration: 0.26, ease: smoothEase }
              }
              className="border-t px-4 py-4 sm:px-5 sm:py-5"
            >
              {children}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
