/** Prevent a slow PDF/SMTP operation from outliving its outbox ownership lease. */
export function startEmailLeaseGuard(renew: () => Promise<boolean>, intervalMs = 10_000) {
  const controller = new AbortController();
  let stopped = false;
  let pending: Promise<void> | undefined;
  const refresh = async () => {
    try {
      if (!(await renew())) controller.abort();
    } catch {
      // Unknown ownership is not permission to send. A later worker can recover the expired lease.
      controller.abort();
    }
  };
  const timer = setInterval(() => {
    if (stopped || pending || controller.signal.aborted) return;
    pending = refresh().finally(() => { pending = undefined; });
  }, intervalMs);
  timer.unref();
  return {
    signal: controller.signal,
    async assertOwned(): Promise<void> {
      if (pending) await pending;
      if (!controller.signal.aborted) await refresh();
      if (controller.signal.aborted) throw new Error("EMAIL_LEASE_LOST");
    },
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(timer);
      if (pending) await pending;
    },
  };
}
