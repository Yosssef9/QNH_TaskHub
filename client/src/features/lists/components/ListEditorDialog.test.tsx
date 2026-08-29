import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ListEditorDialog } from './ListEditorDialog'

const mutations = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}))

vi.mock('../hooks/use-lists', () => ({
  useCreateList: () => ({ isPending: false, mutate: mutations.create }),
  useUpdateList: () => ({ isPending: false, mutate: mutations.update }),
}))

describe('ListEditorDialog', () => {
  it('validates the name and submits the controlled appearance values', async () => {
    const user = userEvent.setup()
    render(<ListEditorDialog open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'حفظ' }))
    expect(await screen.findByText('اكتب اسماً للقائمة.')).toBeVisible()
    expect(mutations.create).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('اسم القائمة'), 'مهام العمل')
    await user.click(screen.getByRole('button', { name: 'هدف' }))
    await user.click(screen.getByRole('button', { name: 'اختيار اللون #0D9488' }))
    await user.click(screen.getByRole('button', { name: 'حفظ' }))

    expect(mutations.create).toHaveBeenCalledWith(
      { name: 'مهام العمل', iconKey: 'target', color: '#0D9488' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })
})
