import { describe, expect, it } from "vitest";

import {
  findMeetingSeriesInternalConflicts,
  resolveMeetingSeriesOccurrences,
} from "../../src/modules/meetings/meeting-series.recurrence.js";
import { meetingSeriesPreviewBodySchema } from "../../src/modules/meetings/meeting-series.schemas.js";
import { riyadhLocalDateTimeToUtc } from "../../src/modules/meetings/meeting-series-time.js";

const defaults = {
  title: "Management Meeting",
  description: null,
  organizerAttending: false,
  attendeeUserIds: [101],
  agendaItems: [],
  roomId: 7,
  startTime: "08:00",
  endTime: "10:00",
};

function resolve(value: unknown) {
  return resolveMeetingSeriesOccurrences(meetingSeriesPreviewBodySchema.parse(value));
}

describe("Meeting Series recurrence", () => {
  it("generates daily and multi-weekday weekly patterns", () => {
    const daily = resolve({
      defaults,
      schedule: {
        mode: "PATTERN",
        pattern: { type: "DAILY", interval: 2 },
        range: { type: "COUNT", startDate: "2026-10-01", count: 3 },
      },
    });
    expect(daily.map((item) => item.date)).toEqual(["2026-10-01", "2026-10-03", "2026-10-05"]);

    const weekly = resolve({
      defaults,
      schedule: {
        mode: "PATTERN",
        pattern: { type: "WEEKLY", interval: 1, daysOfWeek: ["SUNDAY", "TUESDAY"] },
        range: { type: "COUNT", startDate: "2026-10-01", count: 4 },
      },
    });
    expect(weekly.map((item) => item.date)).toEqual([
      "2026-10-04",
      "2026-10-06",
      "2026-10-11",
      "2026-10-13",
    ]);

    const everyOtherWeek = resolve({
      defaults,
      schedule: {
        mode: "PATTERN",
        pattern: { type: "WEEKLY", interval: 2, daysOfWeek: ["MONDAY"] },
        range: { type: "COUNT", startDate: "2026-10-01", count: 3 },
      },
    });
    expect(everyOtherWeek.map((item) => item.date)).toEqual([
      "2026-10-05",
      "2026-10-19",
      "2026-11-02",
    ]);
  });

  it("supports monthly calendar-date and relative patterns", () => {
    const monthlyDate = resolve({
      defaults,
      schedule: {
        mode: "PATTERN",
        pattern: { type: "MONTHLY_DATE", interval: 1, dayOfMonth: 30 },
        range: { type: "COUNT", startDate: "2027-01-01", count: 3 },
      },
    });
    expect(monthlyDate.map((item) => item.date)).toEqual([
      "2027-01-30",
      "2027-03-30",
      "2027-04-30",
    ]);

    const lastMonday = resolve({
      defaults,
      schedule: {
        mode: "PATTERN",
        pattern: { type: "MONTHLY_RELATIVE", interval: 1, ordinal: -1, dayOfWeek: "MONDAY" },
        range: { type: "COUNT", startDate: "2026-10-01", count: 2 },
      },
    });
    expect(lastMonday.map((item) => item.date)).toEqual(["2026-10-26", "2026-11-30"]);
  });

  it("supports custom dates, removal, addition, and moved occurrence identity", () => {
    const items = resolve({
      defaults,
      schedule: { mode: "CUSTOM", dates: ["2026-10-05", "2026-10-12", "2026-10-19"] },
      exceptions: [
        { action: "REMOVE", occurrenceKey: "C:2026-10-12:08:00" },
        {
          action: "OVERRIDE",
          occurrenceKey: "C:2026-10-19:08:00",
          date: "2026-10-20",
          startTime: "09:00",
          endTime: "11:00",
          roomId: 8,
        },
        {
          action: "ADD",
          clientOccurrenceId: "bb65f9dd-2976-4f68-88ec-c9097dc78184",
          date: "2026-10-29",
          startTime: "14:00",
          endTime: "15:00",
        },
      ],
    });

    expect(items).toHaveLength(3);
    const moved = items.find((item) => item.occurrenceKey === "C:2026-10-19:08:00");
    expect(moved).toMatchObject({
      originalDate: "2026-10-19",
      date: "2026-10-20",
      startTime: "09:00",
      roomId: 8,
      isCustomized: true,
      overrideKinds: ["DATE", "TIME", "ROOM"],
    });
    expect(items.some((item) => item.sourceType === "ADDED")).toBe(true);
  });

  it("detects overlaps inside the new batch", () => {
    const items = resolve({
      defaults,
      schedule: { mode: "CUSTOM", dates: ["2026-10-05", "2026-10-06"] },
      exceptions: [
        {
          action: "OVERRIDE",
          occurrenceKey: "C:2026-10-06:08:00",
          date: "2026-10-05",
          startTime: "09:00",
          endTime: "11:00",
        },
      ],
    });

    expect(findMeetingSeriesInternalConflicts(items)).toEqual([
      expect.objectContaining({ roomId: 7 }),
    ]);
  });

  it("converts Riyadh local time to UTC and enforces the 12-month range", () => {
    expect(riyadhLocalDateTimeToUtc("2026-10-05", "08:00").toISOString()).toBe(
      "2026-10-05T05:00:00.000Z",
    );

    expect(() =>
      resolve({
        defaults,
        schedule: {
          mode: "PATTERN",
          pattern: { type: "DAILY", interval: 30 },
          range: { type: "END_DATE", startDate: "2026-10-01", endDate: "2027-10-02" },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "MEETING_SERIES_RANGE_TOO_LONG" }));
  });

  it("enforces the final 100-Meeting bound after manually added occurrences", () => {
    const dates = Array.from({ length: 100 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 9, 1 + index));
      return date.toISOString().slice(0, 10);
    });

    expect(() =>
      resolve({
        defaults,
        schedule: { mode: "CUSTOM", dates },
        exceptions: [
          {
            action: "ADD",
            clientOccurrenceId: "b1703556-f44d-4fb7-89e7-688d0fc5d392",
            date: "2027-01-15",
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "MEETING_SERIES_TOO_MANY_OCCURRENCES" }));
  });
});
