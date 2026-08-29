import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface CollapsibleSectionProps {
  title: ReactNode
  description?: ReactNode
  collapsedDescription?: ReactNode
  defaultOpen?: boolean
  expandLabel: string
  collapseLabel: string
  children: ReactNode
  className?: string
  headerClassName?: string
  titleClassName?: string
  descriptionClassName?: string
  contentClassName?: string
}

const smoothEase = [0.22, 1, 0.36, 1] as const

export function CollapsibleSection({
  title,
  description,
  collapsedDescription,
  defaultOpen = true,
  expandLabel,
  collapseLabel,
  children,
  className,
  headerClassName,
  titleClassName,
  descriptionClassName,
  contentClassName,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const shouldReduceMotion = useReducedMotion()
  const triggerId = useId()
  const contentId = useId()
  const visibleDescription = !open && collapsedDescription !== undefined ? collapsedDescription : description

  return (
    <section className={cn('bg-card overflow-hidden rounded-xl border shadow-sm', className)}>
      <button
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={open ? collapseLabel : expandLabel}
        className={cn(
          'group focus-visible:ring-ring flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-3 text-start transition-[background-color,box-shadow] hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none sm:px-5',
          headerClassName,
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block text-sm font-semibold', titleClassName)}>{title}</span>

          {visibleDescription !== undefined && visibleDescription !== null ? (
            <span className="relative mt-1 block min-h-4 overflow-hidden">
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={open ? 'expanded-description' : 'collapsed-description'}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: open ? -3 : 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: open ? 3 : -3 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : {
                          duration: 0.16,
                          ease: 'easeOut',
                        }
                  }
                  className={cn('text-muted-foreground block text-sm', descriptionClassName)}
                >
                  {visibleDescription}
                </motion.span>
              </AnimatePresence>
            </span>
          ) : null}
        </span>

        <motion.span
          aria-hidden="true"
          className="text-muted-foreground group-hover:text-foreground grid size-8 shrink-0 place-items-center rounded-lg transition-colors"
          animate={{ rotate: open ? 180 : 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: 'easeInOut' }}
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={contentId}
            role="region"
            aria-labelledby={triggerId}
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    height: { duration: 0.42, ease: smoothEase },
                    opacity: { duration: 0.22, ease: 'easeOut' },
                  }
            }
            className="overflow-hidden"
          >
            <motion.div
              initial={shouldReduceMotion ? false : { y: -6 }}
              animate={{ y: 0 }}
              {...(!shouldReduceMotion ? { exit: { y: -6 } } : {})}
              transition={
                shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: smoothEase }
              }
              className={cn('border-t px-4 py-4 sm:px-5', contentClassName)}
            >
              {children}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
