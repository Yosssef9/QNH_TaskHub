import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

export function Separator({ className, ...props }: ComponentProps<'div'>) {
  return <div role="separator" className={cn('bg-border h-px shrink-0', className)} {...props} />
}
