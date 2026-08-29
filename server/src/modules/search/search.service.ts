import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";
import { searchRepository, type SearchResultRecord } from "./search.repository.js";
import type { GlobalSearchData, GlobalSearchResult } from "./search.types.js";

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll("[", "\\[");
}

function optionalId(value: number | string | null, label: string): number | null {
  return value == null ? null : parsePositiveIntegerId(value, label);
}

function hrefFor(record: SearchResultRecord): string {
  const id = parsePositiveIntegerId(record.entityId, "search result id");
  const listId = optionalId(record.listId, "search list id");
  const cycleId = optionalId(record.cycleId, "search cycle id");
  const instanceId = optionalId(record.instanceId, "search KPI instance id");
  const taskId = optionalId(record.taskId, "search task id");

  switch (record.resultType) {
    case "TASK":
    case "SUBTASK": {
      if (taskId === null) return "/";
      const subtaskSuffix = record.resultType === "SUBTASK" ? `&subtaskId=${id}` : "";
      const taskSuffix = `?taskId=${taskId}${subtaskSuffix}`;
      if (listId !== null) return `/lists/${listId}${taskSuffix}`;
      if (cycleId !== null && instanceId !== null) {
        return `/work-cycles/${cycleId}/kpis/${instanceId}${taskSuffix}`;
      }
      return "/kpi-tasks";
    }
    case "WORK_CYCLE":
      return `/work-cycles/${id}`;
    case "KPI_INSTANCE":
      return cycleId === null ? "/work-cycles" : `/work-cycles/${cycleId}/kpis/${id}`;
    case "KPI_TEMPLATE":
      return `/kpis/${id}`;
    case "LIST":
      return `/lists/${id}`;
  }
}

function mapResult(record: SearchResultRecord): GlobalSearchResult {
  return {
    type: record.resultType,
    id: parsePositiveIntegerId(record.entityId, "search result id"),
    title: record.title,
    subtitle: record.subtitle,
    href: hrefFor(record),
    isCurrentContext: record.isCurrentContext,
  };
}

export const searchService = {
  async search(ownerUserId: number, query: string, limit: number): Promise<GlobalSearchData> {
    const normalized = query.trim();
    const escaped = escapeLike(normalized);
    const records = await searchRepository.search(
      ownerUserId,
      normalized,
      `${escaped}%`,
      `%${escaped}%`,
      limit,
    );

    return {
      query: normalized,
      results: records.map(mapResult),
    };
  },
};
