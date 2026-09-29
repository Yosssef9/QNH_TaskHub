export function isValidZoomJoinUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2048) return false
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:') return false
    const hostname = url.hostname.toLowerCase()
    if (!(hostname === 'zoom.us' || hostname.endsWith('.zoom.us'))) return false
    return url.pathname !== '/' && url.pathname.length > 1
  } catch {
    return false
  }
}
