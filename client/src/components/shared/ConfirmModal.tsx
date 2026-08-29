import { AlertTriangle, Loader2, X } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/cn'

export interface ConfirmModalProps {
  open: boolean
  title?: string
  message?: ReactNode
  children?: ReactNode
  confirmText?: string
  cancelText?: string
  loading?: boolean
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title = 'Are you sure?',
  message,
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  loading = false,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  function handleConfirm(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    onConfirm()
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !loading) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogCancel
          aria-label="Close confirmation dialog"
          disabled={loading}
          className="absolute end-4 top-4 size-8 border-0 p-0"
        >
          <X aria-hidden="true" className="size-4" />
        </AlertDialogCancel>

        <AlertDialogHeader className="pe-8">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg',
                danger ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground',
              )}
            >
              <AlertTriangle aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription className={cn(!message && 'sr-only')}>
                {message ?? 'Confirm this action.'}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {children ? <div>{children}</div> : null}

        <AlertDialogFooter>
          {cancelText ? (
            <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
          ) : null}
          <AlertDialogAction
            disabled={loading}
            className={danger ? 'bg-destructive hover:bg-destructive/90 text-white' : undefined}
            onClick={handleConfirm}
          >
            {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {loading ? 'Please wait…' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
