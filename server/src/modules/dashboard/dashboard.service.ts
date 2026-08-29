import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { kpiWorkService } from "../kpis/kpi-work.service.js";
import { getKpiPeriodBounds } from "../kpis/kpi-period.js";
import { workCyclesService } from "../work-cycles/work-cycles.service.js";
import { dashboardRepository } from "./dashboard.repository.js";
import type { DashboardData, DashboardKpiPerformance } from "./dashboard.types.js";

export const dashboardService = {
  async get(owner: number): Promise<DashboardData> {
    const today = getCurrentDateInAppTimeZone();
    const [cycles, personalSummary] = await Promise.all([
      workCyclesService.list(owner),
      dashboardRepository.personalSummary(owner, today),
    ]);

    let currentCycle = cycles.find((cycle) => cycle.isCurrent && !cycle.closedAtUtc) ?? null;

    if (!currentCycle) {
      currentCycle = await workCyclesService.current(owner);
    }

    const openCycleCount = cycles.filter((cycle) => !cycle.closedAtUtc).length;

    if (!currentCycle) {
      return {
        currentCycle: null,
        openCycleCount,
        cycleSummary: null,
        attentionTasks: [],
        kpiPerformance: [],
        kpiHealth: { met: 0, notMet: 0, noData: 0, noTarget: 0 },
        personalSummary,
      };
    }

    const [cycleSummary, attentionTasks, kpiPerformance] = await Promise.all([
      dashboardRepository.cycleSummary(owner, currentCycle.id, today),
      dashboardRepository.attentionTasks(owner, currentCycle.id, today),
      Promise.all(
        currentCycle.instances.map(async (instance): Promise<DashboardKpiPerformance> => {
          const period = getKpiPeriodBounds(today, instance.periodType);
          const summary = await kpiWorkService.summary(owner, instance.id, period);
          return {
            instanceId: instance.id,
            name: instance.name,
            color: instance.color,
            measurementUnit: instance.measurementUnit,
            targetValue: instance.targetValue,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            numerator: summary.numerator,
            denominator: summary.denominator,
            actualValue: summary.actualValue,
            targetAchievement: summary.targetAchievement,
            status: summary.status,
          };
        }),
      ),
    ]);

    const kpiHealth = kpiPerformance.reduce(
      (counts, item) => {
        if (item.status === "MET") counts.met += 1;
        else if (item.status === "NOT_MET") counts.notMet += 1;
        else if (item.status === "NO_TARGET") counts.noTarget += 1;
        else counts.noData += 1;
        return counts;
      },
      { met: 0, notMet: 0, noData: 0, noTarget: 0 },
    );

    return {
      currentCycle,
      openCycleCount,
      cycleSummary,
      attentionTasks,
      kpiPerformance,
      kpiHealth,
      personalSummary,
    };
  },
};
