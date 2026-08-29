import type { KpiCalculationResult } from "../kpis/kpi-calculation.js";
import type { KpiInstance, WorkCycle } from "../work-cycles/work-cycles.types.js";

export interface DashboardCycleSummary {
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  dueToday: number;
}

export interface DashboardAttentionTask {
  id: number;
  kpiInstanceId: number;
  title: string;
  kpiName: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  isOverdue: boolean;
}

export interface DashboardKpiPerformance extends KpiCalculationResult {
  instanceId: number;
  name: string;
  color: string;
  measurementUnit: KpiInstance["measurementUnit"];
  targetValue: number | null;
  periodStart: string;
  periodEnd: string;
}

export interface DashboardKpiHealth {
  met: number;
  notMet: number;
  noData: number;
  noTarget: number;
}

export interface DashboardPersonalSummary {
  defaultListId: number | null;
  total: number;
  inProgress: number;
  overdue: number;
  dueToday: number;
}

export interface DashboardData {
  currentCycle: WorkCycle | null;
  openCycleCount: number;
  cycleSummary: DashboardCycleSummary | null;
  attentionTasks: DashboardAttentionTask[];
  kpiPerformance: DashboardKpiPerformance[];
  kpiHealth: DashboardKpiHealth;
  personalSummary: DashboardPersonalSummary;
}
