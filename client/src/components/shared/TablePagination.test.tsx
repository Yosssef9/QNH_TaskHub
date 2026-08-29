import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setAppLanguage } from '@/i18n'

import { TablePagination } from './TablePagination'

const defaultProps = {
  page: 2,
  totalPages: 3,
  pageSize: 20,
  startRow: 21,
  endRow: 40,
  totalRows: 60,
  onPageChange: vi.fn(),
  onPageSizeChange: vi.fn(),
}

describe('TablePagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('points previous right and next left in Arabic RTL', async () => {
    await setAppLanguage('ar')
    render(<TablePagination {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'الصفحة السابقة' }).querySelector('svg')).toHaveClass(
      'lucide-chevron-right',
    )
    expect(screen.getByRole('button', { name: 'الصفحة التالية' }).querySelector('svg')).toHaveClass(
      'lucide-chevron-left',
    )
  })

  it('points previous left and next right in English LTR', async () => {
    await setAppLanguage('en')
    render(<TablePagination {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'Previous page' }).querySelector('svg')).toHaveClass(
      'lucide-chevron-left',
    )
    expect(screen.getByRole('button', { name: 'Next page' }).querySelector('svg')).toHaveClass(
      'lucide-chevron-right',
    )
  })
})
