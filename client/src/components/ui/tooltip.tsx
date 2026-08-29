import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ComponentProps } from 'react'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

export function TooltipProvider({
  delayDuration = 250,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
}

export function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />
}

export function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger {...props} />
}

export const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof TooltipPrimitive.Content>
>(({ className, dir, sideOffset = 8, ...props }, ref) => {
  const { i18n } = useTranslation()
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        dir={dir ?? i18n.dir()}
        sideOffset={sideOffset}
        className={cn(
          'ui-popover-motion bg-foreground text-background z-50 rounded-md px-2.5 py-1.5 text-xs shadow-md',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
})
TooltipContent.displayName = 'TooltipContent'
