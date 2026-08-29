import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'

describe('shared feedback states', () => {
  it('provides localized loading and empty messages', () => {
    const { rerender } = render(<LoadingState />)
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ تحميل البيانات')

    rerender(<EmptyState />)
    expect(screen.getByRole('heading', { name: 'لا توجد بيانات بعد' })).toBeVisible()
  })

  it('offers an accessible retry action', () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
