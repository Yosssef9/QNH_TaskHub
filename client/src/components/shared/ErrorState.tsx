import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ className, description, onRetry, title }: ErrorStateProps) {
  const { t } = useTranslation()

  return (
    <section
      role="alert"
      className={cn(
        'bg-card flex min-h-64 flex-col items-center justify-center rounded-xl border p-8 text-center',
        className,
      )}
    >
      <div className="bg-destructive/10 text-destructive grid size-12 place-items-center rounded-full">
        <CircleAlert aria-hidden="true" className="size-6" />
      </div>
      <h2 className="mt-4 font-semibold">{title ?? t('states.errorTitle')}</h2>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm leading-6">
        {description ?? t('states.errorDescription')}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </section>
  )
}
