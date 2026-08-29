import { ChevronRight, Home } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
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
  const breadcrumbs = items ?? buildBreadcrumbs(location.pathname, labelMap)

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
      <nav aria-label="Breadcrumb">
        <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
          {breadcrumbs.map((item, index) => {
            const isFirst = index === 0
            const isLast = index === breadcrumbs.length - 1
            const key = item.path ?? `${item.label}-${index}`

            return (
              <li key={key} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight aria-hidden="true" className="size-3.5" /> : null}
                {isLast || !item.path ? (
                  <span
                    aria-current="page"
                    className="text-foreground inline-flex items-center gap-1.5 px-2 py-1 font-medium"
                  >
                    {isFirst ? <Home aria-hidden="true" className="size-3.5" /> : null}
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.path}
                    onClick={(event) => handleNavigation(event, item.path as string)}
                    className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 outline-none focus-visible:ring-2"
                  >
                    {isFirst ? <Home aria-hidden="true" className="size-3.5" /> : null}
                    {item.label}
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
