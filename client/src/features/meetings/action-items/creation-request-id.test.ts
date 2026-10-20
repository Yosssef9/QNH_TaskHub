import { describe, expect, it, vi } from 'vitest'
import { newActionCreationRequestId } from './creation-request-id'

describe('Meeting Action Item create retry IDs', () => {
  it('generates unique UUIDs that are accepted by the backend', () => {
    const first = newActionCreationRequestId()
    const second = newActionCreationRequestId()
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(second).not.toBe(first)
  })
  it('works without randomUUID (e.g. HTTP on the hospital LAN)', () => {
    const original = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(42) })
    try { expect(newActionCreationRequestId()).toMatch(/^[0-9a-f-]{36}$/) }
    finally { vi.stubGlobal('crypto', original); vi.unstubAllGlobals() }
  })
})
