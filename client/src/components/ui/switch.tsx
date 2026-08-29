import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function Switch({ checked, className, onCheckedChange, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        'focus-visible:ring-ring relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
        className,
      )}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'bg-background pointer-events-none block size-5 rounded-full shadow-sm transition-transform',
          checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
