/** Shared retry schedule for ordinary operational mail and Meeting PDF reports. */
export function emailRetryDelaySeconds(attemptCount: number): number {
  if (attemptCount <= 1) return 60;
  if (attemptCount === 2) return 5 * 60;
  if (attemptCount === 3) return 30 * 60;
  return 2 * 60 * 60;
}
