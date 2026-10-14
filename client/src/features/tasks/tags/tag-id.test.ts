import { describe, expect, it } from 'vitest'
import { normalizeTagId, normalizeTagIds, normalizeTagRecord } from './tag-id'

describe('SQL Server tag identifiers', () => {
  it('converts BIGINT strings from the library and newly created tags', () => {
    expect(normalizeTagRecord({ id: '1', name: 'QNH' })).toEqual({ id: 1, name: 'QNH' })
    expect(normalizeTagRecord({ id: '2', name: 'QMS' })).toEqual({ id: 2, name: 'QMS' })
    expect(normalizeTagRecord({ id: '10', name: 'Custom' }).id).toBe(10)
  })

  it('keeps numeric IDs and makes outgoing task and tag-update arrays numeric', () => {
    expect(normalizeTagId(5)).toBe(5)
    expect(normalizeTagIds(['1', 2, '10'])).toEqual([1, 2, 10])
    expect(normalizeTagIds([])).toEqual([])
  })

  it.each([0, -1, '0', '', ' 1', '1.5', '1e3', 'abc', null, undefined, 2.5, '9007199254740992'])(
    'rejects invalid or unsafe tag ID %s', (id) => {
      expect(() => normalizeTagId(id)).toThrow('Invalid TaskHub tag identifier.')
    },
  )
})
