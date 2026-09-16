import { describe, expect, it } from "vitest";

import {
  createMeetingSeriesBodySchema,
  meetingSeriesPreviewBodySchema,
} from "../../src/modules/meetings/meeting-series.schemas.js";

const defaults = {
  title: "Weekly Management Meeting",
  description: null,
  organizerAttending: false,
  attendeeUserIds: [101, 102],
  agendaItems: [],
  roomId: 7,
  startTime: "08:00",
  endTime: "10:00",
};

describe("Meeting Series schemas", () => {
  it("accepts a bounded weekly pattern", () => {
    const result = meetingSeriesPreviewBodySchema.safeParse({
      defaults,
      schedule: {
        mode: "PATTERN",
        pattern: { type: "WEEKLY", interval: 1, daysOfWeek: ["MONDAY"] },
        range: { type: "END_DATE", startDate: "2026-10-01", endDate: "2026-10-31" },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate custom dates and duplicate weekly weekdays", () => {
    expect(
      meetingSeriesPreviewBodySchema.safeParse({
        defaults,
        schedule: { mode: "CUSTOM", dates: ["2026-10-05", "2026-10-05"] },
      }).success,
    ).toBe(false);

    expect(
      meetingSeriesPreviewBodySchema.safeParse({
        defaults,
        schedule: {
          mode: "PATTERN",
          pattern: { type: "WEEKLY", interval: 1, daysOfWeek: ["MONDAY", "MONDAY"] },
          range: { type: "COUNT", startDate: "2026-10-01", count: 4 },
        },
      }).success,
    ).toBe(false);
  });

  it("keeps an omitted occurrence description distinct from an explicit null override", () => {
    const base = {
      defaults: { ...defaults, description: "Default description" },
      schedule: { mode: "CUSTOM" as const, dates: ["2026-10-05"] },
    };

    const omitted = meetingSeriesPreviewBodySchema.parse({
      ...base,
      exceptions: [{ action: "OVERRIDE", occurrenceKey: "C:2026-10-05:08:00", roomId: 8 }],
    });
    const cleared = meetingSeriesPreviewBodySchema.parse({
      ...base,
      exceptions: [
        { action: "OVERRIDE", occurrenceKey: "C:2026-10-05:08:00", description: null },
      ],
    });

    expect(omitted.exceptions[0]?.description).toBeUndefined();
    expect(cleared.exceptions[0]?.description).toBeNull();
  });

  it("requires a UUID idempotency key for final creation", () => {
    const base = {
      defaults,
      schedule: { mode: "CUSTOM", dates: ["2026-10-05"] },
    };

    expect(
      createMeetingSeriesBodySchema.safeParse({
        ...base,
        creationRequestId: "7d4d41be-6a75-4ab6-8325-63539c8012a4",
      }).success,
    ).toBe(true);
    expect(
      createMeetingSeriesBodySchema.safeParse({ ...base, creationRequestId: "not-a-uuid" }).success,
    ).toBe(false);
  });
});
