import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export const taskHubEase = [0.22, 1, 0.36, 1] as const

export const taskHubMotion = {
  enter: 0.18,
  exit: 0.14,
  layout: 0.22,
  state: 0.18,
  fetching: 0.12,
} as const

export function AnimatedState({
  children,
  className,
  stateKey,
}: {
  children: ReactNode
  className?: string
  stateKey: string | number
}) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={stateKey}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{
          duration: taskHubMotion.state,
          ease: taskHubEase,
        }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export function AnimatedFetching({
  busy,
  children,
  className,
}: {
  busy: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      aria-busy={busy}
      animate={{ opacity: busy ? 0.82 : 1 }}
      transition={{
        duration: taskHubMotion.fetching,
        ease: taskHubEase,
      }}
      className={cn('relative', className)}
    >
      {children}
    </motion.div>
  )
}

export const taskHubItemMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: {
    duration: taskHubMotion.enter,
    ease: taskHubEase,
  },
} as const

export const taskHubFadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: {
    duration: taskHubMotion.enter,
    ease: taskHubEase,
  },
} as const
