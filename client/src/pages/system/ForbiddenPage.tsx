import { ShieldX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { buttonStyles } from '@/components/ui/button.styles'

export function ForbiddenPage() {
  const { t } = useTranslation()

  return (
    <section className="grid min-h-[65vh] place-items-center text-center">
      <div className="max-w-md">
        <div className="bg-warning/15 text-warning-foreground mx-auto grid size-14 place-items-center rounded-full">
          <ShieldX aria-hidden="true" className="size-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">{t('system.forbiddenTitle')}</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          {t('system.forbiddenDescription')}
        </p>
        <Link to="/" className={buttonStyles({ className: 'mt-6' })}>
          {t('system.backHome')}
        </Link>
      </div>
    </section>
  )
}
