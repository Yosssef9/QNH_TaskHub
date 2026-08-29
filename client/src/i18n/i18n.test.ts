import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { setAppLanguage } from './index'

describe('application language', () => {
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
