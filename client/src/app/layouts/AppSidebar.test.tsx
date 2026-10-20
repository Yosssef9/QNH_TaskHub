import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { listsQueryKey } from '@/features/lists/hooks/use-lists'

import { AppSidebar } from './AppSidebar'

function renderSidebar(collapsed: boolean, initialRoute = '/') {
  const queryClient = new QueryClient()
  queryClient.setQueryData(listsQueryKey, [
    {
      id: 1,
      name: 'My Tasks',
      iconKey: 'list-todo',
      color: '#2563EB',
      isDefault: true,
      displayOrder: 0,
    },
    {
      id: 2,
      name: 'التخطيط',
      iconKey: 'target',
      color: '#0D9488',
      isDefault: false,
      displayOrder: 1,
    },
  ])

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <TooltipProvider>
          <AppSidebar collapsed={collapsed} />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppSidebar', () => {
  it('keeps collapsed navigation understandable and shows the compact QNH logo', () => {
    const { container } = renderSidebar(true)

    expect(screen.getByRole('link', { name: 'الرئيسية' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'صندوق العمل' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'مهامي' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'التخطيط' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'توسيع القائمة الجانبية' })).not.toBeInTheDocument()

    const compactLogo = container.querySelector('img[src$="images/logo.png"]')
    const fullLogo = container.querySelector('img[src$="images/fullLogo.png"]')

    expect(compactLogo).toBeInTheDocument()
    expect(compactLogo?.parentElement).toHaveAttribute('aria-hidden', 'false')
    expect(fullLogo).toBeInTheDocument()
    expect(fullLogo?.parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('places Work Inbox immediately after Home and highlights the active page', () => {
    const { container } = renderSidebar(false, '/work-inbox')
    const homeLink = screen.getByRole('link', { name: 'الرئيسية' })
    const inboxLink = screen.getByRole('link', { name: 'صندوق العمل' })
    const navigationLinks = Array.from(container.querySelectorAll('nav a'))

    expect(inboxLink).toHaveAttribute('href', '/work-inbox')
    expect(inboxLink).toHaveAttribute('aria-current', 'page')
    expect(navigationLinks.indexOf(inboxLink)).toBe(navigationLinks.indexOf(homeLink) + 1)
  })

  it('shows the full hospital brand and application name when expanded', () => {
    const { container } = renderSidebar(false)

    const compactLogo = container.querySelector('img[src$="images/logo.png"]')
    const fullLogo = container.querySelector('img[src$="images/fullLogo.png"]')

    expect(compactLogo?.parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(fullLogo).toBeInTheDocument()
    expect(fullLogo?.parentElement).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getAllByText('منصة مهام QNH').length).toBeGreaterThan(0)
  })
})
