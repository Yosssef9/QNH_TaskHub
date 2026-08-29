import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { i18n } from '@/i18n'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

function DirectionSelect() {
  return (
    <Select defaultValue="first">
      <SelectTrigger aria-label="direction select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="first">الخيار الأول</SelectItem>
      </SelectContent>
    </Select>
  )
}

describe('Select direction', () => {
  afterEach(async () => {
    await i18n.changeLanguage('ar')
  })

  it.each([
    ['ar', 'rtl'],
    ['en', 'ltr'],
  ] as const)('passes %s direction to the dropdown', async (language, direction) => {
    await i18n.changeLanguage(language)
    render(<DirectionSelect />)

    expect(screen.getByRole('combobox', { name: 'direction select' })).toHaveAttribute(
      'dir',
      direction,
    )
  })
})
