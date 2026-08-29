import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

export interface LoadingStateProps {
  title?: string
  description?: string
  fullPage?: boolean
  className?: string
}

export function LoadingState({
  title,
  description,
  fullPage = false,
  className,
}: LoadingStateProps) {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'bg-card flex flex-col items-center justify-center gap-3 rounded-xl border p-8 text-center',
        fullPage && 'min-h-[60vh] border-0 bg-transparent',
        className,
      )}
    >
      <Loader2 aria-hidden="true" className="text-primary size-7 animate-spin" />
      <div>
        <p className="font-medium">{title ?? t('states.loadingTitle')}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {description ?? t('states.loadingDescription')}
        </p>
      </div>
    </div>
  )
}
