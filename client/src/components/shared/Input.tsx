import type { ComponentProps, ReactNode } from 'react'
import { forwardRef, useId } from 'react'

import { Input as InputPrimitive } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/cn'

interface FieldShellProps {
  label?: string
  description?: string
  error?: string
  required?: boolean
  containerClassName?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

function FieldLabel({
  htmlFor,
  label,
  required,
}: {
  htmlFor: string
  label: string
  required: boolean
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
      {label}
      {required ? (
        <span aria-hidden="true" className="text-destructive ms-1">
          *
        </span>
      ) : null}
    </label>
  )
}

function FieldMessages({
  description,
  descriptionId,
  error,
  errorId,
}: {
  description: string | undefined
  descriptionId: string
  error: string | undefined
  errorId: string
}) {
  return (
    <>
      {description ? (
        <p id={descriptionId} className="text-muted-foreground mt-1.5 text-xs">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-destructive mt-1.5 text-xs font-medium">
          {error}
        </p>
      ) : null}
    </>
  )
}

export interface InputFieldProps
  extends Omit<ComponentProps<typeof InputPrimitive>, 'required'>, FieldShellProps {}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  (
    {
      id,
      label,
      description,
      error,
      required = false,
      containerClassName,
      className,
      leftIcon,
      rightIcon,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId()
    const fieldId = id ?? generatedId
    const descriptionId = `${fieldId}-description`
    const errorId = `${fieldId}-error`
    const describedBy = [description ? descriptionId : null, error ? errorId : null]
      .filter(Boolean)
      .join(' ')

    return (
      <div className={containerClassName}>
        {label ? <FieldLabel htmlFor={fieldId} label={label} required={required} /> : null}
        <div className="relative">
          {leftIcon ? (
            <span className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 -translate-y-1/2">
              {leftIcon}
            </span>
          ) : null}
          <InputPrimitive
            ref={ref}
            id={fieldId}
            required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy || undefined}
            className={cn(leftIcon && 'ps-9', rightIcon && 'pe-9', className)}
            {...props}
          />
          {rightIcon ? (
            <span className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 -translate-y-1/2">
              {rightIcon}
            </span>
          ) : null}
        </div>
        <FieldMessages
          description={description}
          descriptionId={descriptionId}
          error={error}
          errorId={errorId}
        />
      </div>
    )
  },
)
InputField.displayName = 'InputField'

export interface TextareaFieldProps
  extends
    Omit<ComponentProps<typeof Textarea>, 'required'>,
    Omit<FieldShellProps, 'leftIcon' | 'rightIcon'> {}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  (
    { id, label, description, error, required = false, containerClassName, className, ...props },
    ref,
  ) => {
    const generatedId = useId()
    const fieldId = id ?? generatedId
    const descriptionId = `${fieldId}-description`
    const errorId = `${fieldId}-error`
    const describedBy = [description ? descriptionId : null, error ? errorId : null]
      .filter(Boolean)
      .join(' ')

    return (
      <div className={containerClassName}>
        {label ? <FieldLabel htmlFor={fieldId} label={label} required={required} /> : null}
        <Textarea
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
          className={className}
          {...props}
        />
        <FieldMessages
          description={description}
          descriptionId={descriptionId}
          error={error}
          errorId={errorId}
        />
      </div>
    )
  },
)
TextareaField.displayName = 'TextareaField'

export default InputField
