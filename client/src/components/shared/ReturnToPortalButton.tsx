import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { clientEnv } from '@/config/env'
import { cn } from '@/lib/cn'

interface ReturnToPortalButtonProps {
  collapsed?: boolean
}

export function ReturnToPortalButton({ collapsed = false }: ReturnToPortalButtonProps) {
  const { i18n, t } = useTranslation()
  const portalUrl = clientEnv.VITE_PORTAL_URL
  const configured = Boolean(portalUrl)
  const label = t('portal.return')

  const className = cn(
    'focus-visible:ring-ring flex h-11 w-full items-center overflow-hidden rounded-xl border text-sm font-semibold outline-none focus-visible:ring-2',
    'border-destructive/20 bg-destructive/10 text-destructive',
    configured
      ? 'hover:border-destructive/30 hover:bg-destructive/15'
      : 'cursor-not-allowed opacity-55',
    collapsed ? 'justify-center px-0' : 'gap-3 px-3',
  )

  const content = (
    <>
      <ExternalLink aria-hidden="true" className="size-5 shrink-0" />
      <span className={cn('whitespace-nowrap', collapsed && 'hidden')}>{label}</span>
    </>
  )

  if (!configured) {
    const disabledControl = (
      <button
        type="button"
        disabled
        className={className}
        aria-label={collapsed ? `${label}. ${t('portal.notConfigured')}` : undefined}
        title={!collapsed ? t('portal.notConfigured') : undefined}
      >
        {content}
      </button>
    )

    if (!collapsed) return disabledControl

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block">{disabledControl}</span>
        </TooltipTrigger>
        <TooltipContent side={i18n.dir() === 'rtl' ? 'left' : 'right'}>
          {t('portal.notConfigured')}
        </TooltipContent>
      </Tooltip>
    )
  }

  const link = (
    <a href={portalUrl} className={className} {...(collapsed ? { 'aria-label': label } : {})}>
      {content}
    </a>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side={i18n.dir() === 'rtl' ? 'left' : 'right'}>{label}</TooltipContent>
    </Tooltip>
  )
}
