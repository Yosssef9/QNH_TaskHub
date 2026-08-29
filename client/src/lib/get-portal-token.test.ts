import { describe, expect, it } from 'vitest'

import { getPortalToken } from './get-portal-token'

describe('getPortalToken', () => {
  it('prefers the Portal token from local storage', () => {
    window.localStorage.setItem('portalToken', 'local-token')
    window.sessionStorage.setItem('portalToken', 'session-token')

    expect(getPortalToken()).toBe('local-token')
  })

  it('falls back to session storage', () => {
    window.sessionStorage.setItem('token', 'session-token')

    expect(getPortalToken()).toBe('session-token')
  })

  it('returns null when no Portal token exists', () => {
    expect(getPortalToken()).toBeNull()
  })
})
