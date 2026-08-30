import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { mapCalendarTask } from "./calendar.mapper.js";
import { calendarRepository } from "./calendar.repository.js";
import type {
  CalendarSearchData,
  CalendarSearchQuery,
  CalendarTasksData,
  CalendarTasksQuery,
} from "./calendar.types.js";

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll("[", "\\[");
}

const CALENDAR_SEARCH_LIMIT = 30;

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

  async searchTasks(ownerUserId: number, query: CalendarSearchQuery): Promise<CalendarSearchData> {
    const searchPattern = `%${escapeLike(query.q.trim())}%`;
    const records = await calendarRepository.searchTasks(
      ownerUserId,
      query,
      getCurrentDateInAppTimeZone(),
      searchPattern,
      CALENDAR_SEARCH_LIMIT,
    );

    return {
      items: records.map(mapCalendarTask),
      total: Number(records[0]?.totalCount ?? 0),
    };
  },
};
