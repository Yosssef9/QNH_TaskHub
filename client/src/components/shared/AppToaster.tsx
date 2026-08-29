import { cloneElement, isValidElement } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ToastBar, Toaster } from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/hooks/use-theme'

function applyMessageDirection(message: ReactNode, direction: 'ltr' | 'rtl'): ReactNode {
  const directionalStyle: CSSProperties = {
    direction,
    textAlign: direction === 'rtl' ? 'right' : 'left',
  }

  if (isValidElement<{ dir?: string; style?: CSSProperties }>(message)) {
    return cloneElement(message, {
      dir: direction,
      style: { ...message.props.style, ...directionalStyle },
    })
  }

  return (
    <span dir={direction} style={directionalStyle}>
      {message}
    </span>
  )
}

export function AppToaster() {
  const { i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const direction = i18n.dir()

  return (
    <Toaster
      position={direction === 'rtl' ? 'top-left' : 'top-right'}
      toastOptions={{
        duration: 4000,
        style: {
          background: 'var(--popover)',
          color: 'var(--popover-foreground)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-lg)',
          direction,
          textAlign: direction === 'rtl' ? 'right' : 'left',
        },
        success: {
          iconTheme: {
            primary: 'var(--success)',
            secondary: 'var(--success-foreground-contrast)',
          },
        },
        error: {
          iconTheme: {
            primary: 'var(--destructive)',
            secondary: 'white',
          },
        },
      }}
      // React Hot Toast uses physical left/right positions. Keep its positioning
      // container LTR and apply the locale direction only to each toast's content.
      containerStyle={{ colorScheme: resolvedTheme, direction: 'ltr' }}
    >
      {(toastItem) => (
        <ToastBar toast={toastItem}>
          {({ icon, message }) => (
            <>
              {icon}
              {applyMessageDirection(message, direction)}
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  )
}
