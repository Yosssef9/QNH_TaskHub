const PORTAL_TOKEN_KEYS = ['token', 'portalToken'] as const

function getTokenFromStorage(storage: Storage): string | null {
  for (const key of PORTAL_TOKEN_KEYS) {
    const token = storage.getItem(key)?.trim()

    if (token) {
      return token
    }
  }

  return null
}

export function getPortalToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return getTokenFromStorage(window.localStorage) ?? getTokenFromStorage(window.sessionStorage)
}
