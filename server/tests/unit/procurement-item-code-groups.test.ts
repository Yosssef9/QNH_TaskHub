import { describe, expect, it } from 'vitest'
import { groupInputSchema } from '../../src/modules/procurement-item-code-groups/procurement-item-code-groups.schemas.js'
import { itemListQuerySchema, annualPriceQuerySchema, itemOverviewQuerySchema } from '../../src/modules/items/items.schemas.js'

describe('shared procurement item code groups', () => {
  it('preserves leading zeros and accepts two or more digits', () => {
    expect(groupInputSchema.parse({ name: ' Medical Consumables ', prefix: '02' })).toEqual({ name: 'Medical Consumables', prefix: '02' })
    expect(groupInputSchema.parse({ name: 'Equipment', prefix: '030' }).prefix).toBe('030')
  })
  it('rejects one-digit and non-numeric prefixes and missing group names', () => {
    for (const prefix of ['0', '0x', '02%', ' 02', '02 ', '', '0'.repeat(21)]) {
      expect(groupInputSchema.safeParse({ name: 'Medical', prefix }).success).toBe(false)
    }
    expect(groupInputSchema.safeParse({ name: '  ', prefix: '02' }).success).toBe(false)
  })
  it('accepts the same prefix filter on summary, overview and annual data endpoints', () => {
    expect(itemListQuerySchema.parse({ itemCodePrefix: '02' }).itemCodePrefix).toBe('02')
    expect(itemOverviewQuerySchema.parse({ itemCodePrefix: '021' }).itemCodePrefix).toBe('021')
    expect(annualPriceQuerySchema.parse({ itemCodePrefix: '03' }).itemCodePrefix).toBe('03')
    expect(itemListQuerySchema.safeParse({ itemCodePrefix: '3%' }).success).toBe(false)
  })
})
