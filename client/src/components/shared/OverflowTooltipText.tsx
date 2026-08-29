import { useRef, useState, type ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

interface OverflowTooltipTextProps {
  children: ReactNode
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export function OverflowTooltipText({
  children,
  className,
  side = 'top',
}: OverflowTooltipTextProps) {
  const textRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setOpen(false)
      return
    }

    const element = textRef.current
    const isOverflowing = Boolean(element && element.scrollWidth > element.clientWidth)

    setOpen(isOverflowing)
  }

  return (
    <Tooltip open={open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <span ref={textRef} className={cn('min-w-0 truncate', className)}>
          {children}
        </span>
      </TooltipTrigger>

      <TooltipContent side={side} className="max-w-xs break-words">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
