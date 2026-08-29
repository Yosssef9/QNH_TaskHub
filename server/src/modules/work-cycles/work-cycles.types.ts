import type { PersonalKpi } from "../kpis/kpis.types.js";

export interface WorkCycle {
  id: number;
  title: string;
  description: string | null;
  iconKey: string;
  color: string;
  startDate: string | null;
  endDate: string | null;
  displayOrder: number;
  closedAtUtc: string | null;
  archivedAtUtc: string | null;
  isCurrent: boolean;
  taskCount: number;
  completedTaskCount: number;
  overdueTaskCount: number;
  instances: KpiInstance[];
}

export interface KpiInstance extends Omit<PersonalKpi, "id"> {
  id: number;
  templateId: number;
  cycleId: number;
  cycleTitle: string;
  cycleClosedAtUtc: string | null;
}

export interface WorkCycleRecord {
  id: number | string;
  title: string;
  description: string | null;
  iconKey: string;
  color: string;
  startDate: Date | null;
  endDate: Date | null;
  displayOrder: number;
  closedAtUtc: Date | null;
  archivedAtUtc: Date | null;
  isCurrent: boolean;
  taskCount: number;
  completedTaskCount: number;
  overdueTaskCount: number;
}

export interface KpiInstanceRecord {
  id: number | string;
  templateId: number | string;
  cycleId: number | string;
  cycleTitle: string;
  cycleClosedAtUtc: Date | null;
  name: string;
  description: string | null;
  iconKey: string;
  color: string;
  calculationMethod: string;
  periodType: string;
  measurementUnit: string;
  targetValue: number | null;
  targetDirection: string | null;
  deadlineSource: string | null;
  businessDayOffset: number | null;
  deadlineDirection: string | null;
  referenceDateLabel: string | null;
  numeratorLabel: string | null;
  denominatorLabel: string | null;
  valueLabel: string | null;
  displayOrder: number;
  isActive: boolean;
  taskCount: number;
}
