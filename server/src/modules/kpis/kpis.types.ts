import type {
  KPI_COLORS,
  KPI_DEADLINE_DIRECTIONS,
  KPI_DEADLINE_SOURCES,
  KPI_DIRECTIONS,
  KPI_ICON_KEYS,
  KPI_METHODS,
  KPI_PERIODS,
} from "./kpis.constants.js";
import type { KpiTaskPolicy } from "./kpi-task-policy.js";

export type KpiMethod = (typeof KPI_METHODS)[number];
export type KpiPeriod = (typeof KPI_PERIODS)[number];
export type KpiDirection = (typeof KPI_DIRECTIONS)[number];
export type KpiDeadlineDirection = (typeof KPI_DEADLINE_DIRECTIONS)[number];
export type KpiDeadlineSource = (typeof KPI_DEADLINE_SOURCES)[number];
export type KpiIconKey = (typeof KPI_ICON_KEYS)[number];
export type KpiColor = (typeof KPI_COLORS)[number];

export interface PersonalKpi {
  id: number;
  name: string;
  description: string | null;
  iconKey: KpiIconKey;
  color: KpiColor;
  calculationMethod: KpiMethod;
  periodType: KpiPeriod;
  measurementUnit: "PERCENT" | "NUMBER";
  targetValue: number | null;
  targetDirection: KpiDirection | null;
  deadlineSource: KpiDeadlineSource | null;
  businessDayOffset: number | null;
  deadlineDirection: KpiDeadlineDirection | null;
  referenceDateLabel: string | null;
  numeratorLabel: string | null;
  denominatorLabel: string | null;
  valueLabel: string | null;
  displayOrder: number;
  isActive: boolean;
  taskCount: number;
  taskPolicy: KpiTaskPolicy;
}

export interface KpiRecord extends Omit<
  PersonalKpi,
  | "id"
  | "iconKey"
  | "color"
  | "calculationMethod"
  | "periodType"
  | "measurementUnit"
  | "targetDirection"
  | "deadlineSource"
  | "deadlineDirection"
  | "taskPolicy"
> {
  id: number | string;
  iconKey: string;
  color: string;
  calculationMethod: string;
  periodType: string;
  measurementUnit: string;
  targetDirection: string | null;
  deadlineSource: string | null;
  deadlineDirection: string | null;
}

export type SaveKpiInput = Omit<
  PersonalKpi,
  "id" | "displayOrder" | "isActive" | "taskCount" | "measurementUnit" | "taskPolicy"
>;
