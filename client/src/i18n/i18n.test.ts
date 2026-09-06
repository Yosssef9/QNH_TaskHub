import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { setAppLanguage } from './index'
import { arTranslation } from './locales/ar/translation'
import { enTranslation } from './locales/en/translation'


function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('application language', () => {
  it('keeps every English translation key available in Arabic', () => {
    const englishKeys = new Set(leafKeys(enTranslation))
    const arabicKeys = new Set(leafKeys(arTranslation))
    const missingArabicKeys = [...englishKeys].filter((key) => !arabicKeys.has(key)).sort()

    expect(missingArabicKeys).toEqual([])
  })

  it('applies English LTR and Arabic RTL to the document', async () => {
    await act(() => setAppLanguage('en'))
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')
    expect(window.localStorage.getItem('qnh-taskhub-language')).toBe('en')

    await act(() => setAppLanguage('ar'))
    expect(document.documentElement).toHaveAttribute('lang', 'ar')
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
  })
})
