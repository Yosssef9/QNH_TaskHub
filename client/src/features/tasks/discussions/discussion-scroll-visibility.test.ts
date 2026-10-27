import { describe, expect, it } from 'vitest'
import {
  SCROLL_HIDE_DISTANCE,
  SCROLL_SHOW_DISTANCE,
  shouldShowDiscussionScrollButton,
} from './discussion-scroll-visibility'

describe('discussion jump-to-bottom button visibility', () => {
  it('appears only when the user moves far enough from the newest message', () => {
    expect(shouldShowDiscussionScrollButton(false, SCROLL_SHOW_DISTANCE)).toBe(false)
    expect(shouldShowDiscussionScrollButton(false, SCROLL_SHOW_DISTANCE + 1)).toBe(true)
  })

  it('remains visible between thresholds until the user returns to the bottom', () => {
    expect(shouldShowDiscussionScrollButton(true, 100)).toBe(true)
    expect(shouldShowDiscussionScrollButton(true, SCROLL_HIDE_DISTANCE)).toBe(false)
    expect(shouldShowDiscussionScrollButton(false, 100)).toBe(false)
  })

  it('does not appear on an empty or non-scrolling conversation', () => {
    expect(shouldShowDiscussionScrollButton(false, 0)).toBe(false)
    expect(shouldShowDiscussionScrollButton(true, -10)).toBe(false)
    expect(shouldShowDiscussionScrollButton(false, Number.NaN)).toBe(false)
  })
})
