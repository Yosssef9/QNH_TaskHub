import * as PopoverPrimitive from '@radix-ui/react-popover'
import type { ComponentProps } from 'react'
import { forwardRef } from 'react'

import { useDialogFloatingContainer } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

export function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />
}

export function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger {...props} />
}

export function PopoverAnchor(props: ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor {...props} />
}

export const PopoverContent = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof PopoverPrimitive.Content>
>(function PopoverContent({ align = 'center', sideOffset = 6, className, ...props }, ref) {
  const dialogFloatingContainer = useDialogFloatingContainer()

  return (
    <PopoverPrimitive.Portal container={dialogFloatingContainer ?? undefined}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'ui-popover-motion bg-popover text-popover-foreground z-50 rounded-lg border p-4 shadow-lg outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
})

PopoverContent.displayName = 'PopoverContent'
