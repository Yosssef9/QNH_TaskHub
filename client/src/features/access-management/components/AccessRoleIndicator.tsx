import { ShieldCheck, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'
import type { TaskHubRoleCode } from '@/features/auth/types/auth.types'

export function AccessRoleIndicator({
  role,
  pill = false,
}: {
  role: TaskHubRoleCode
  pill?: boolean
}) {
  const { t } = useTranslation()
  const admin = role === 'ADMIN'
  const Icon = admin ? ShieldCheck : UserRound
  const tone = admin ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 font-medium',
        pill && 'rounded-full px-2.5 py-1 text-xs',
        pill && tone,
      )}
    >
      <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', !pill && tone)}>
        <Icon aria-hidden="true" className={pill ? 'size-3.5' : 'size-3'} />
      </span>
      <span className="truncate">{t(`access.roles.${role}`)}</span>
    </span>
  )
}
