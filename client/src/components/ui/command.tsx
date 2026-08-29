import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import type { ComponentProps } from 'react'
import { forwardRef } from 'react'

import { cn } from '@/lib/cn'

export const Command = forwardRef<HTMLDivElement, ComponentProps<typeof CommandPrimitive>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive
      ref={ref}
      className={cn(
        'bg-popover text-popover-foreground flex size-full flex-col overflow-hidden',
        className,
      )}
      {...props}
    />
  ),
)
Command.displayName = 'Command'

export const CommandInput = forwardRef<
  HTMLInputElement,
  ComponentProps<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3" data-cmdk-input-wrapper="">
    <Search aria-hidden="true" className="text-muted-foreground me-2 size-4 shrink-0" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'placeholder:text-muted-foreground flex h-11 w-full bg-transparent py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  </div>
))
CommandInput.displayName = 'CommandInput'

export const CommandList = forwardRef<HTMLDivElement, ComponentProps<typeof CommandPrimitive.List>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.List
      ref={ref}
      className={cn('max-h-72 overflow-x-hidden overflow-y-auto p-1', className)}
      {...props}
    />
  ),
)
CommandList.displayName = 'CommandList'

export const CommandEmpty = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn('text-muted-foreground py-6 text-center text-sm', className)}
    {...props}
  />
))
CommandEmpty.displayName = 'CommandEmpty'

export const CommandItem = forwardRef<HTMLDivElement, ComponentProps<typeof CommandPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
CommandItem.displayName = 'CommandItem'

export const CommandLoading = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof CommandPrimitive.Loading>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Loading
    ref={ref}
    className={cn('text-muted-foreground py-4 text-center text-sm', className)}
    {...props}
  />
))
CommandLoading.displayName = 'CommandLoading'
