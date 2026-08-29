import type { KpiPeriod } from "./kpis.types.js";

function dateOnly(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

export function getKpiPeriodBounds(today: string, type: KpiPeriod) {
  const [yearText, monthText] = today.split("-");
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const startMonth =
    type === "YEARLY" ? 0 : type === "QUARTERLY" ? Math.floor(month / 3) * 3 : month;
  const endMonth = type === "YEARLY" ? 11 : type === "QUARTERLY" ? startMonth + 2 : startMonth;

  return {
    periodStart: dateOnly(year, startMonth, 1),
    periodEnd: dateOnly(year, endMonth + 1, 0),
  };
}
