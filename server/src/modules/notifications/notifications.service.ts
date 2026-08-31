import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { getKpiPeriodBounds } from "../kpis/kpi-period.js";
import { kpiWorkService } from "../kpis/kpi-work.service.js";
import { workCyclesService } from "../work-cycles/work-cycles.service.js";
import {
  notificationsRepository,
  type NotificationRecord,
} from "./notifications.repository.js";
import type { NotificationItem, NotificationListData } from "./notifications.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function optionalId(value: number | string | null): number | null {
  return value == null ? null : Number(value);
}

export function notificationHref(record: NotificationRecord): string {
  const taskId = optionalId(record.taskId);
  const listId = optionalId(record.listId);
  const cycleId = optionalId(record.cycleId);
  const instanceId = optionalId(record.kpiInstanceId);
  const contractId = optionalId(record.contractId);

  if (
    record.notificationType === "TASK_OVERDUE" ||
    record.notificationType === "TASK_DUE_TODAY" ||
    record.notificationType === "HIGH_PRIORITY_TASK_DUE_TOMORROW"
  ) {
    if (taskId === null) return "/";
    if (listId !== null) return `/lists/${listId}?taskId=${taskId}`;
    if (cycleId !== null && instanceId !== null) {
      return `/work-cycles/${cycleId}/kpis/${instanceId}?taskId=${taskId}`;
    }
    return "/kpi-tasks";
  }

  if (
    record.notificationType === "CONTRACT_EXPIRATION_REMINDER" ||
    record.notificationType === "CONTRACT_NOTICE_DEADLINE_REMINDER"
  ) {
    return contractId === null ? "/contracts" : `/contracts/${contractId}`;
  }

  if (
    record.notificationType === "CURRENT_CYCLE_ENDING_SOON" ||
    record.notificationType === "CURRENT_CYCLE_PAST_END"
  ) {
    return cycleId === null ? "/work-cycles" : `/work-cycles/${cycleId}`;
  }

  if (cycleId !== null && instanceId !== null) {
    return `/work-cycles/${cycleId}/kpis/${instanceId}`;
  }

  return cycleId === null ? "/work-cycles" : `/work-cycles/${cycleId}`;
}

function mapNotification(record: NotificationRecord): NotificationItem {
  return {
    id: Number(record.id),
    type: record.notificationType,
    subjectTitle: record.subjectTitle,
    contextTitle: record.contextTitle,
    eventDate: record.eventDate?.toISOString().slice(0, 10) ?? null,
    actualValue: record.actualValue == null ? null : Number(record.actualValue),
    targetValue: record.targetValue == null ? null : Number(record.targetValue),
    measurementUnit: record.measurementUnit,
    readAtUtc: record.readAtUtc?.toISOString() ?? null,
    createdAtUtc: record.createdAtUtc.toISOString(),
    href: notificationHref(record),
  };
}

async function syncKpiNotifications(owner: number, today: string): Promise<void> {
  const cycle = await workCyclesService.current(owner);
  if (!cycle || cycle.closedAtUtc || cycle.archivedAtUtc) return;

  await Promise.all(
    cycle.instances.map(async (instance) => {
      try {
        const period = getKpiPeriodBounds(today, instance.periodType);
        const summary = await kpiWorkService.summary(owner, instance.id, period);

        if (summary.status === "NOT_MET") {
          await notificationsRepository.ensureKpiNotification(owner, {
            type: "KPI_BELOW_TARGET",
            dedupeKey: `KPI_BELOW_TARGET:${instance.id}:${period.periodStart}:${period.periodEnd}`,
            subjectTitle: instance.name,
            contextTitle: cycle.title,
            cycleId: cycle.id,
            kpiInstanceId: instance.id,
            eventDate: period.periodEnd,
            actualValue: summary.actualValue,
            targetValue: instance.targetValue,
            measurementUnit: instance.measurementUnit,
          });
        }

        const isManual =
          instance.calculationMethod === "MANUAL_RATIO" ||
          instance.calculationMethod === "MANUAL_NUMBER";
        const daysUntilPeriodEnd = daysBetween(today, period.periodEnd);

        if (isManual && summary.status === "NO_DATA" && daysUntilPeriodEnd >= 0 && daysUntilPeriodEnd <= 3) {
          await notificationsRepository.ensureKpiNotification(owner, {
            type: "KPI_MEASUREMENT_DUE",
            dedupeKey: `KPI_MEASUREMENT_DUE:${instance.id}:${period.periodStart}:${period.periodEnd}`,
            subjectTitle: instance.name,
            contextTitle: cycle.title,
            cycleId: cycle.id,
            kpiInstanceId: instance.id,
            eventDate: period.periodEnd,
            actualValue: null,
            targetValue: instance.targetValue,
            measurementUnit: instance.measurementUnit,
          });
        }
      } catch (error) {
        logger.warn(
          { err: error, ownerUserId: owner, kpiInstanceId: instance.id },
          "KPI notification synchronization skipped for one instance",
        );
      }
    }),
  );
}

async function synchronize(owner: number): Promise<void> {
  const today = getCurrentDateInAppTimeZone();
  await notificationsRepository.syncTimeBased(owner, today, addDays(today, 1));
  await notificationsRepository.syncContractNotifications(owner, today);
  await syncKpiNotifications(owner, today);
}

export const notificationsService = {
  synchronize,

  async list(owner: number, limit: number): Promise<NotificationListData> {
    await synchronize(owner);
    const [records, unreadCount] = await Promise.all([
      notificationsRepository.list(owner, limit),
      notificationsRepository.unreadCount(owner),
    ]);

    return {
      items: records.map(mapNotification),
      unreadCount,
    };
  },

  async markRead(owner: number, notificationId: number): Promise<void> {
    if (!(await notificationsRepository.markRead(owner, notificationId))) {
      throw new AppError({
        statusCode: 404,
        code: "NOTIFICATION_NOT_FOUND",
        message: "Notification not found.",
      });
    }
  },

  async markAllRead(owner: number): Promise<number> {
    return notificationsRepository.markAllRead(owner);
  },
};

