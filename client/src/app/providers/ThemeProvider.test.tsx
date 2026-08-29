import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useTheme } from '@/hooks/use-theme'

import { ThemeProvider } from './ThemeProvider'

function ThemeTestHarness() {
  const { setTheme, theme } = useTheme()

  return (
    <div>
      <span>{theme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        light
      </button>
    </div>
  )
}

describe('ThemeProvider', () => {
  it('applies and persists the selected theme', () => {
    render(
      <ThemeProvider>
        <ThemeTestHarness />
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(window.localStorage.getItem('qnh-taskhub-theme')).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(window.localStorage.getItem('qnh-taskhub-theme')).toBe('light')
  })
})
