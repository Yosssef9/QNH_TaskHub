import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Star, Target } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import { IconPicker } from './IconPicker'

describe('IconPicker', () => {
  it('filters icons by label and returns the selected icon', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <TooltipProvider>
        <IconPicker
          value="target"
          options={['target', 'star'] as const}
          icons={{ target: Target, star: Star }}
          getLabel={(value) => (value === 'target' ? 'Target' : 'Star')}
          searchLabel="Search icons"
          searchPlaceholder="Search icons…"
          clearSearchLabel="Clear icon search"
          noResultsText="No matching icons."
          selectedLabel="Selected icon"
          onChange={onChange}
        />
      </TooltipProvider>,
    )

    expect(screen.getByRole('button', { name: 'Target' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search icons' }), 'star')

    expect(screen.queryByRole('button', { name: 'Target' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Star' }))

    expect(onChange).toHaveBeenCalledWith('star')
  })
})
