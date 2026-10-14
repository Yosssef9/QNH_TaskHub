import { describe, expect, it } from 'vitest'
import { TAG_COLOR_PRESETS, TAG_ICON_MAX_BYTES, validateTagImageFile } from './tag-editor-options'

describe('tag editor options', () => {
  it('offers unique valid colors', () => {
    expect(TAG_COLOR_PRESETS).toHaveLength(10)
    expect(new Set(TAG_COLOR_PRESETS).size).toBe(TAG_COLOR_PRESETS.length)
    TAG_COLOR_PRESETS.forEach((color) => expect(color).toMatch(/^#[0-9A-F]{6}$/))
  })

  it('accepts supported image formats through the existing upload limit', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(validateTagImageFile({ type, size: TAG_ICON_MAX_BYTES })).toBeNull()
    }
  })

  it('rejects unsupported, oversize, and empty image files', () => {
    expect(validateTagImageFile({ type: 'image/svg+xml', size: 123 })).toBe('type')
    expect(validateTagImageFile({ type: 'image/png', size: TAG_ICON_MAX_BYTES + 1 })).toBe('size')
    expect(validateTagImageFile({ type: 'image/png', size: 0 })).toBe('empty')
  })
})
