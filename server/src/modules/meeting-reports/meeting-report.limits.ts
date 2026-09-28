import { AppError } from "../../shared/errors/app-error.js";

/** A bounded, non-queueing per-process limiter; no unbounded pool of PDFs or DB reads. */
export function createMeetingReportLimiter(maxConcurrent = 2) {
  const actors = new Set<number>();
  return {
    async run<T>(actorUserId: number, operation: () => Promise<T>): Promise<T> {
      if (actors.has(actorUserId) || actors.size >= maxConcurrent) {
        throw new AppError({
          statusCode: 429,
          code: "MEETING_REPORT_BUSY",
          message: "Report generation is busy. Please wait a moment and try again.",
        });
      }
      actors.add(actorUserId);
      try {
        return await operation();
      } finally {
        actors.delete(actorUserId);
      }
    },
  };
}
