import type { ButtonHTMLAttributes } from 'react'
import { forwardRef } from 'react'

import { buttonStyles } from '@/components/ui/button.styles'

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'ghost'
export type ButtonSize = 'default' | 'sm' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, type = 'button', variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  ),
)

Button.displayName = 'Button'
