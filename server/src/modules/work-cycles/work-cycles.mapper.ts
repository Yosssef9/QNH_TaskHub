import { mapKpi } from "../kpis/kpis.mapper.js";
import type { KpiRecord } from "../kpis/kpis.types.js";
import type { KpiInstance, KpiInstanceRecord, WorkCycle, WorkCycleRecord } from "./work-cycles.types.js";

const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const dateTime = (value: Date | null) => value?.toISOString() ?? null;

export function mapKpiInstance(record: KpiInstanceRecord): KpiInstance {
  const mapped = mapKpi({
    ...record,
    id: record.id,
  } as KpiRecord);

  return {
    ...mapped,
    templateId: Number(record.templateId),
    cycleId: Number(record.cycleId),
    cycleTitle: record.cycleTitle,
    cycleClosedAtUtc: dateTime(record.cycleClosedAtUtc),
  };
}

export function mapWorkCycle(record: WorkCycleRecord, instances: KpiInstance[]): WorkCycle {
  return {
    id: Number(record.id),
    title: record.title,
    description: record.description,
    iconKey: record.iconKey,
    color: record.color.toUpperCase(),
    startDate: date(record.startDate),
    endDate: date(record.endDate),
    displayOrder: Number(record.displayOrder),
    closedAtUtc: dateTime(record.closedAtUtc),
    archivedAtUtc: dateTime(record.archivedAtUtc),
    isCurrent: record.isCurrent,
    taskCount: Number(record.taskCount),
    completedTaskCount: Number(record.completedTaskCount),
    overdueTaskCount: Number(record.overdueTaskCount),
    instances,
  };
}
