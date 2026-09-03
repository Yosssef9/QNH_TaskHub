import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { useCurrentUser } from '../hooks/use-current-user'
import { RequireRole } from './RequireRole'

vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(),
}))

function renderGuard(roleCode: 'USER' | 'ADMIN') {
  vi.mocked(useCurrentUser).mockReturnValue({
    data: {
      user: { userId: 1, userCode: '2410', userName: 'Test', email: null },
      access: { roleCode, contractsEnabled: false },
      preferences: {
        languageCode: 'AR',
        theme: 'SYSTEM',
        sidebarCollapsed: false,
        calendarShowAdjacentDates: false,
        meetingStartReminderEnabled: true,
        timeFormat: '12H',
        timezone: 'Asia/Riyadh',
      },
    },
  } as unknown as ReturnType<typeof useCurrentUser>)

  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route
          path="/admin"
          element={
            <RequireRole role="ADMIN">
              <p>Admin content</p>
            </RequireRole>
          }
        />
        <Route path="/forbidden" element={<p>Forbidden content</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireRole', () => {
  it('allows the required role', () => {
    renderGuard('ADMIN')
    expect(screen.getByText('Admin content')).toBeVisible()
  })

  it('redirects other roles to the forbidden page', () => {
    renderGuard('USER')
    expect(screen.getByText('Forbidden content')).toBeVisible()
  })
})



