import { ChevronLeft, ChevronRight, Home } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'

import { cn } from '@/lib/cn'
import { buildBreadcrumbs, type BreadcrumbItem } from '@/lib/breadcrumbs'

export interface BreadcrumbsProps {
  items?: readonly BreadcrumbItem[]
  labelMap?: Readonly<Record<string, string>>
  rightContent?: ReactNode
  onNavigate?: (path: string) => boolean | void
  className?: string
}

export function Breadcrumbs({
  items,
  labelMap,
  rightContent,
  onNavigate,
  className,
}: BreadcrumbsProps) {
  const location = useLocation()
  const { i18n } = useTranslation()
  const breadcrumbs = items ?? buildBreadcrumbs(location.pathname, labelMap)
  const SeparatorIcon = i18n.dir() === 'rtl' ? ChevronLeft : ChevronRight

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (onNavigate?.(path) === false) event.preventDefault()
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between',
        className,
      )}
    >
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-sm">
          {breadcrumbs.map((item, index) => {
            const isFirst = index === 0
            const isLast = index === breadcrumbs.length - 1
            const key = item.path ?? `${item.label}-${index}`

            return (
              <li key={key} className="flex min-w-0 items-center gap-0.5">
                {index > 0 ? (
                  <SeparatorIcon
                    aria-hidden="true"
                    className="text-primary/35 mx-0.5 size-3.5 shrink-0"
                  />
                ) : null}
                {isLast || !item.path ? (
                  <span
                    aria-current="page"
                    className="text-primary/90 inline-flex min-w-0 items-center gap-1.5 py-1 font-semibold leading-6"
                  >
                    {isFirst ? <Home aria-hidden="true" className="size-3.5 shrink-0" /> : null}
                    <span className="min-w-0 whitespace-normal break-words">{item.label}</span>
                  </span>
                ) : (
                  <Link
                    to={item.path}
                    onClick={(event) => handleNavigation(event, item.path as string)}
                    className="text-primary/65 hover:text-primary focus-visible:ring-ring inline-flex max-w-56 items-center gap-1.5 rounded-md py-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    {isFirst ? <Home aria-hidden="true" className="size-3.5 shrink-0" /> : null}
                    <span className="truncate">{item.label}</span>
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      {rightContent}
    </div>
  )
}

