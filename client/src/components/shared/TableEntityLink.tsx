import { Building2, FileText, PackageSearch, type LucideIcon } from 'lucide-react'
import { Link, type To } from 'react-router'

import { cn } from '@/lib/cn'
import { OverflowTooltipText } from './OverflowTooltipText'

export type TableEntityKind = 'supplier' | 'item' | 'contract'

interface TableEntityLinkProps {
  kind: TableEntityKind
  id: number
  name: string
  code?: string | null
  to?: To
  compact?: boolean
  className?: string
}

const entityIcons: Record<TableEntityKind, LucideIcon> = {
  supplier: Building2,
  item: PackageSearch,
  contract: FileText,
}

function entityPath(kind: TableEntityKind, id: number): string {
  if (kind === 'supplier') return `/suppliers/${id}`
  if (kind === 'item') return `/items/${id}`
  return `/contracts/${id}`
}

export function TableEntityLink({
  kind,
  id,
  name,
  code,
  to,
  compact = false,
  className,
}: TableEntityLinkProps) {
  const Icon = entityIcons[kind]

  return (
    <Link
      to={to ?? entityPath(kind, id)}
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/15 bg-primary/10 px-2.5 py-1.5 text-start text-primary no-underline outline-none',
        'transition-colors hover:border-primary/25 hover:bg-primary/15 hover:text-primary',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1',
        compact && 'gap-1.5 rounded-md px-2 py-1 text-xs',
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('shrink-0', compact ? 'size-3.5' : 'size-4')} />
      <span className="min-w-0 leading-tight">
        <OverflowTooltipText
          className={cn('block font-semibold', compact ? 'max-w-[12rem]' : 'max-w-[22rem]')}
        >
          {name}
        </OverflowTooltipText>
        {code?.trim() ? (
          <span
            dir="ltr"
            className={cn(
              'mt-0.5 block truncate font-mono font-medium text-primary/70',
              compact ? 'text-[10px]' : 'text-[11px]',
            )}
          >
            {code.trim()}
          </span>
        ) : null}
      </span>
    </Link>
  )
}
