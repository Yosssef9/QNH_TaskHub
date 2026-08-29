import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError } from '@/lib/api-error'

import { useCurrentUser } from '../hooks/use-current-user'
import { RequireAuth } from './RequireAuth'

vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(),
}))

describe('RequireAuth', () => {
  beforeEach(() => {
    window.localStorage.setItem('token', 'portal-token')
  })

  it('distinguishes missing TaskHub access from an invalid Portal session', () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      isPending: false,
      isError: true,
      error: new ApiClientError('Not assigned', 'TASKHUB_ACCESS_NOT_ASSIGNED', 403),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCurrentUser>)

    render(
      <RequireAuth>
        <p>Private application</p>
      </RequireAuth>,
    )

    expect(
      screen.getByRole('heading', { name: 'لم يتم منحك صلاحية دخول منصة المهام' }),
    ).toBeVisible()
    expect(screen.queryByText('Private application')).not.toBeInTheDocument()
  })

  it('shows a retry action for an unexpected server failure', () => {
    const refetch = vi.fn()
    vi.mocked(useCurrentUser).mockReturnValue({
      isPending: false,
      isError: true,
      error: new ApiClientError('Unavailable', 'API_REQUEST_FAILED', 503),
      refetch,
    } as unknown as ReturnType<typeof useCurrentUser>)

    render(
      <RequireAuth>
        <p>Private application</p>
      </RequireAuth>,
    )

    screen.getByRole('button', { name: 'إعادة المحاولة' }).click()
    expect(refetch).toHaveBeenCalledOnce()
  })
})
