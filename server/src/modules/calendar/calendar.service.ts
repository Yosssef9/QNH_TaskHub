import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { mapCalendarTask } from "./calendar.mapper.js";
import { calendarRepository } from "./calendar.repository.js";
import type { CalendarTasksData, CalendarTasksQuery } from "./calendar.types.js";

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll("[", "\\[");
}

export const calendarService = {
  async listTasks(ownerUserId: number, query: CalendarTasksQuery): Promise<CalendarTasksData> {
    const normalizedSearch = query.search?.trim();
    const searchPattern = normalizedSearch ? `%${escapeLike(normalizedSearch)}%` : null;
    const records = await calendarRepository.listTasks(
      ownerUserId,
      query,
      getCurrentDateInAppTimeZone(),
      searchPattern,
    );

    return { items: records.map(mapCalendarTask) };
  },
};
