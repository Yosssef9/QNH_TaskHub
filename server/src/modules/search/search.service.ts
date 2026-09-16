import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";
import { searchRepository, type SearchResultRecord } from "./search.repository.js";
import type {
  GlobalSearchData,
  GlobalSearchResult,
  SearchAccessScope,
  SearchResultType,
} from "./search.types.js";

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

function parseSearchEntityId(
  value: number | string,
  resultType: SearchResultType,
): number {
  if (resultType === "ITEM" || resultType === "SUPPLIER") {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed === 0) {
      throw new TypeError(`Search ${resultType.toLowerCase()} id must be a non-zero integer.`);
    }
    return parsed;
  }

  return parsePositiveIntegerId(value, "search result id");
}

function hrefFor(record: SearchResultRecord, id: number): string {
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
    case "MEETING":
      return `/meetings/${id}`;
    case "MEETING_SERIES":
      return `/meetings/series/${id}`;
    case "CONTRACT":
      return `/contracts/${id}`;
    case "SUPPLIER":
      return `/suppliers/${id}`;
    case "ITEM":
      return `/items/${id}`;
    case "PRICE_QUOTE":
      return `/price-quotes?quoteId=${id}`;
  }
}

function mapResult(record: SearchResultRecord): GlobalSearchResult {
  const id = parseSearchEntityId(record.entityId, record.resultType);
  return {
    type: record.resultType,
    id,
    title: record.title,
    subtitle: record.subtitle,
    href: hrefFor(record, id),
    isCurrentContext: record.isCurrentContext,
  };
}

export const searchService = {
  async search(
    ownerUserId: number,
    query: string,
    limit: number,
    access: SearchAccessScope,
  ): Promise<GlobalSearchData> {
    const normalized = query.trim();
    const escaped = escapeLike(normalized);
    const records = await searchRepository.search(
      ownerUserId,
      normalized,
      `${escaped}%`,
      `%${escaped}%`,
      limit,
      access,
    );

    return {
      query: normalized,
      results: records.map(mapResult),
    };
  },
};
