import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { useCurrentUser } from '@/features/auth/hooks/use-current-user'

import { RequireContractsAccess } from './RequireContractsAccess'

vi.mock('@/features/auth/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(),
}))

function renderGuard(contractsEnabled: boolean) {
  vi.mocked(useCurrentUser).mockReturnValue({
    data: {
      user: { userId: 1, userCode: 'TEST001', userName: 'Test User', email: null },
      access: { roleCode: 'USER', contractsEnabled },
      preferences: {
        languageCode: 'EN',
        theme: 'SYSTEM',
        sidebarCollapsed: false,
        calendarShowAdjacentDates: true,
        timezone: 'Asia/Riyadh',
      },
    },
  } as unknown as ReturnType<typeof useCurrentUser>)

  return render(
    <MemoryRouter initialEntries={['/contracts']}>
      <Routes>
        <Route
          path="/contracts"
          element={
            <RequireContractsAccess>
              <p>Contracts content</p>
            </RequireContractsAccess>
          }
        />
        <Route path="/forbidden" element={<p>Forbidden content</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireContractsAccess', () => {
  it('allows users whose Contracts module is enabled', () => {
    renderGuard(true)
    expect(screen.getByText('Contracts content')).toBeVisible()
  })

  it('redirects users whose Contracts module is disabled', () => {
    renderGuard(false)
    expect(screen.getByText('Forbidden content')).toBeVisible()
  })
})
