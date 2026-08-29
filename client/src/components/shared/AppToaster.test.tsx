import { render, screen } from '@testing-library/react'
import toast from 'react-hot-toast'
import { afterEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '@/app/providers/ThemeProvider'
import { setAppLanguage } from '@/i18n'

import { AppToaster } from './AppToaster'

describe('AppToaster', () => {
  afterEach(() => toast.remove())

  it('applies RTL direction and right alignment to Arabic toast content', async () => {
    await setAppLanguage('ar')
    render(
      <ThemeProvider>
        <AppToaster />
      </ThemeProvider>,
    )

    toast.success('تم الحفظ')

    const message = await screen.findByText('تم الحفظ')
    const toastElement = message.closest('[role="status"]')
    const positionWrapper = toastElement?.parentElement?.parentElement
    const toaster = message.closest('[data-rht-toaster]')

    expect(toastElement).toHaveAttribute('dir', 'rtl')
    expect(toastElement).toHaveStyle({ direction: 'rtl', textAlign: 'right' })
    expect(toaster).toHaveStyle({ direction: 'ltr' })
    expect(positionWrapper).not.toHaveStyle({ justifyContent: 'flex-end' })
  })

  it('places English toasts on the physical right', async () => {
    await setAppLanguage('en')
    render(
      <ThemeProvider>
        <AppToaster />
      </ThemeProvider>,
    )

    toast.success('Saved')

    const message = await screen.findByText('Saved')
    const toastElement = message.closest('[role="status"]')
    const positionWrapper = toastElement?.parentElement?.parentElement

    expect(toastElement).toHaveAttribute('dir', 'ltr')
    expect(positionWrapper).toHaveStyle({ justifyContent: 'flex-end' })
  })
})
