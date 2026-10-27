/** Pixel distances from the end of the messages scroller. */
export const SCROLL_SHOW_DISTANCE = 160
export const SCROLL_HIDE_DISTANCE = 40

/**
 * Keep the floating jump control steady while the scroll position moves
 * between the thresholds (e.g. during smooth scrolling or message layout).
 */
export function shouldShowDiscussionScrollButton(previous: boolean, distanceFromBottom: number): boolean {
  if (!Number.isFinite(distanceFromBottom)) return previous
  if (distanceFromBottom <= SCROLL_HIDE_DISTANCE) return false
  if (distanceFromBottom > SCROLL_SHOW_DISTANCE) return true
  return previous
}
