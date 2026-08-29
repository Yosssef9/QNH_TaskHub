import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { createContext, forwardRef, useCallback, useContext, useState } from 'react'

import { cn } from '@/lib/cn'

const DialogFloatingContainerContext = createContext<HTMLElement | null>(null)

export function useDialogFloatingContainer() {
  return useContext(DialogFloatingContainerContext)
}

export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />
}

export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />
}

export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} />
}

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  closeLabel: string
  variant?: 'drawer' | 'modal' | 'page'
}

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  function DialogContent(
    { children, className, closeLabel, variant = 'drawer', ...props },
    forwardedRef,
  ) {
    const [floatingContainer, setFloatingContainer] = useState<HTMLDivElement | null>(null)

    const setContentRef = useCallback(
      (node: HTMLDivElement | null) => {
        setFloatingContainer(node)

        if (typeof forwardedRef === 'function') {
          forwardedRef(node)
        } else if (forwardedRef) {
          forwardedRef.current = node
        }
      },
      [forwardedRef],
    )

    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-overlay-motion fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          ref={setContentRef}
          className={cn(
            'bg-background text-foreground fixed z-50 flex flex-col overflow-visible shadow-2xl outline-none',
            variant === 'drawer'
              ? 'ui-drawer-motion inset-y-0 start-0 h-dvh w-[min(20rem,88vw)] border-e'
              : variant === 'page'
                ? 'ui-page-motion inset-0 h-dvh w-screen'
                : 'ui-dialog-motion top-1/2 left-1/2 max-h-[90vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6',
            className,
          )}
          {...props}
        >
          <DialogFloatingContainerContext.Provider value={floatingContainer}>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="hover:bg-accent focus-visible:ring-ring absolute end-4 top-4 grid size-9 place-items-center rounded-md outline-none focus-visible:ring-2"
            >
              <X aria-hidden="true" className="size-5" />
            </DialogPrimitive.Close>
          </DialogFloatingContainerContext.Provider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    )
  },
)
DialogContent.displayName = 'DialogContent'

export function DialogTitle(props: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title {...props} />
}

export function DialogDescription(props: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description {...props} />
}
