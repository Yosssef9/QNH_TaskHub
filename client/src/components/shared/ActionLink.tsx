import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { MouseEventHandler, PointerEventHandler, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, type To } from 'react-router'

import { cn } from '@/lib/cn'

export type ActionLinkVariant = 'default' | 'prominent'

interface ActionLinkProps {
  children: ReactNode
  to?: To
  variant?: ActionLinkVariant
  className?: string
  ariaLabel?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
  onPointerDown?: PointerEventHandler<HTMLAnchorElement>
}

export function ActionLink({
  children,
  to,
  variant = 'default',
  className,
  ariaLabel,
  onClick,
  onPointerDown,
}: ActionLinkProps) {
  const { i18n } = useTranslation()
  const isRtl = i18n.dir() === 'rtl'
  const Arrow = isRtl ? ArrowLeft : ArrowRight

  const rootClassName = cn(
    'group text-primary inline-flex items-center gap-2 rounded-lg text-sm font-semibold no-underline',
    'transition-[background-color,color,box-shadow] duration-150 ease-out',
    variant === 'default' && 'px-2.5 py-1.5 hover:bg-primary/8 group-hover:bg-primary/8',
    variant === 'prominent' && 'px-3 py-2 hover:bg-primary/8 group-hover:bg-primary/8',
    to &&
      'focus-visible:ring-ring focus-visible:ring-offset-background cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    !to && 'pointer-events-none select-none',
    className,
  )

  const directionMotion = isRtl
    ? 'group-hover:-translate-x-1'
    : 'group-hover:translate-x-1'

  const content = (
    <>
      <span>{children}</span>
      {variant === 'prominent' ? (
        <span
          aria-hidden="true"
          className={cn(
            'bg-primary/8 grid size-7 shrink-0 place-items-center rounded-full',
            'transition-[transform,background-color] duration-150 ease-out',
            'group-hover:bg-primary/14 motion-reduce:transform-none motion-reduce:transition-none',
            directionMotion,
          )}
        >
          <Arrow className="size-4" />
        </span>
      ) : (
        <Arrow
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 transition-transform duration-150 ease-out',
            'motion-reduce:transform-none motion-reduce:transition-none',
            directionMotion,
          )}
        />
      )}
    </>
  )

  if (!to) {
    return (
      <span aria-hidden="true" className={rootClassName}>
        {content}
      </span>
    )
  }

  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className={rootClassName}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {content}
    </Link>
  )
}
