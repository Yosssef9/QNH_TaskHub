import { AppError } from "../../shared/errors/app-error.js";
import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";
import { getKpiTaskPolicy } from "./kpi-task-policy.js";
import {
  KPI_COLORS,
  KPI_DEADLINE_DIRECTIONS,
  KPI_DEADLINE_SOURCES,
  KPI_DIRECTIONS,
  KPI_ICON_KEYS,
  KPI_METHODS,
  KPI_PERIODS,
} from "./kpis.constants.js";
import type { KpiRecord, PersonalKpi } from "./kpis.types.js";

function supported<T extends readonly string[]>(
  values: T,
  value: string | null,
): value is T[number] {
  return value !== null && values.some((item) => item === value);
}

export function mapKpi(record: KpiRecord): PersonalKpi {
  const normalizedColor = record.color.toUpperCase();

  if (
    !supported(KPI_ICON_KEYS, record.iconKey) ||
    !supported(KPI_COLORS, normalizedColor) ||
    !supported(KPI_METHODS, record.calculationMethod) ||
    !supported(KPI_PERIODS, record.periodType) ||
    !supported(["PERCENT", "NUMBER"] as const, record.measurementUnit) ||
    (record.targetDirection !== null && !supported(KPI_DIRECTIONS, record.targetDirection)) ||
    (record.deadlineSource !== null && !supported(KPI_DEADLINE_SOURCES, record.deadlineSource)) ||
    (record.calculationMethod === "ON_TIME_RATE" && record.deadlineSource === null) ||
    (record.calculationMethod !== "ON_TIME_RATE" && record.deadlineSource !== null) ||
    (record.deadlineDirection !== null &&
      !supported(KPI_DEADLINE_DIRECTIONS, record.deadlineDirection))
  ) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_KPI_CONFIGURATION",
      message: "A KPI has an unsupported configuration.",
    });
  }

  const deadlineSource = record.deadlineSource as PersonalKpi["deadlineSource"];

  return {
    ...record,
    id: parsePositiveIntegerId(record.id, "kpi id"),
    iconKey: record.iconKey,
    color: normalizedColor,
    calculationMethod: record.calculationMethod,
    periodType: record.periodType,
    measurementUnit: record.measurementUnit,
    targetDirection: record.targetDirection,
    deadlineSource,
    deadlineDirection: record.deadlineDirection,
    targetValue: record.targetValue === null ? null : Number(record.targetValue),
    taskCount: Number(record.taskCount),
    taskPolicy: getKpiTaskPolicy(record.calculationMethod, deadlineSource),
  };
}
