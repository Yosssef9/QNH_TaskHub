import { logger } from "../../config/logger.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { dashboardService } from "../dashboard/dashboard.service.js";
import { emailSettingsService } from "../email-settings/email-settings.service.js";
import { getKpiPeriodBounds } from "../kpis/kpi-period.js";
import { kpiWorkService } from "../kpis/kpi-work.service.js";
import {
  notificationHref,
  notificationsService,
} from "../notifications/notifications.service.js";
import {
  notificationsRepository,
  type NotificationEmailCandidate,
} from "../notifications/notifications.repository.js";
import { workCyclesService } from "../work-cycles/work-cycles.service.js";
import { emailService } from "./email.service.js";
import { templateKeyForNotification } from "./operational-email.policy.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_CANDIDATE_BATCH_SIZE = 200;
const OPERATIONAL_EVENT_SYNC_INTERVAL_MS = 15 * 60 * 1000;
let nextEventSynchronizationAt = 0;

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function id(value: number | string | null): number | null {
  return value == null ? null : Number(value);
}

async function taskPayload(
  candidate: NotificationEmailCandidate,
  today: string,
  tomorrow: string,
): Promise<Record<string, unknown> | null> {
  const taskId = id(candidate.taskId);
  if (taskId === null) return null;
  const task = await notificationsRepository.getTaskEmailState(candidate.ownerUserId, taskId);
  if (!task || task.deletedAtUtc || task.status === "DONE" || task.status === "CANCELLED") return null;
  if (task.listId !== null && task.listArchivedAtUtc) return null;
  if (task.kpiInstanceId !== null && (task.cycleClosedAtUtc || task.cycleArchivedAtUtc)) return null;

  const dueDate = task.dueDate?.toISOString().slice(0, 10) ?? null;
  if (!dueDate) return null;

  if (candidate.notificationType === "TASK_OVERDUE" && !(dueDate < today)) return null;
  if (candidate.notificationType === "TASK_DUE_TODAY" && dueDate !== today) return null;
  if (
    candidate.notificationType === "HIGH_PRIORITY_TASK_DUE_TOMORROW" &&
    (dueDate !== tomorrow || task.priority !== "HIGH")
  ) return null;

  return {
    taskTitle: candidate.subjectTitle,
    contextTitle: candidate.contextTitle,
    dueDate,
    ...(candidate.notificationType === "TASK_OVERDUE"
      ? { daysOverdue: Math.max(1, -daysBetween(today, dueDate)) }
      : {}),
    href: notificationHref(candidate),
  };
}

async function cyclePayload(
  candidate: NotificationEmailCandidate,
  today: string,
): Promise<Record<string, unknown> | null> {
  const cycleId = id(candidate.cycleId);
  if (cycleId === null) return null;
  const current = await workCyclesService.current(candidate.ownerUserId);
  if (!current || current.id !== cycleId || current.closedAtUtc || current.archivedAtUtc || !current.endDate) {
    return null;
  }

  const distance = daysBetween(today, current.endDate);
  if (candidate.notificationType === "CURRENT_CYCLE_ENDING_SOON" && (distance < 0 || distance > 3)) {
    return null;
  }
  if (candidate.notificationType === "CURRENT_CYCLE_PAST_END" && distance >= 0) return null;

  const dashboard = await dashboardService.get(candidate.ownerUserId);
  if (!dashboard.currentCycle || dashboard.currentCycle.id !== current.id || !dashboard.cycleSummary) return null;
  const summary = dashboard.cycleSummary;
  const progressPercent = summary.total > 0 ? (summary.completed / summary.total) * 100 : 0;

  return {
    cycleTitle: current.title,
    endDate: current.endDate,
    ...(candidate.notificationType === "CURRENT_CYCLE_ENDING_SOON"
      ? { daysRemaining: Math.max(0, distance) }
      : { daysPastEnd: Math.max(1, -distance) }),
    progressPercent,
    totalTasks: summary.total,
    completedTasks: summary.completed,
    overdueTasks: summary.overdue,
    kpiMet: dashboard.kpiHealth.met,
    kpiNotMet: dashboard.kpiHealth.notMet,
    kpiNoData: dashboard.kpiHealth.noData,
    href: notificationHref(candidate),
  };
}

async function kpiPayload(
  candidate: NotificationEmailCandidate,
  today: string,
): Promise<Record<string, unknown> | null> {
  const cycleId = id(candidate.cycleId);
  const instanceId = id(candidate.kpiInstanceId);
  if (cycleId === null || instanceId === null) return null;

  const current = await workCyclesService.current(candidate.ownerUserId);
  if (!current || current.id !== cycleId || current.closedAtUtc || current.archivedAtUtc) return null;
  const instance = current.instances.find((item) => item.id === instanceId);
  if (!instance) return null;

  const period = getKpiPeriodBounds(today, instance.periodType);
  const summary = await kpiWorkService.summary(candidate.ownerUserId, instanceId, period);

  if (candidate.notificationType === "KPI_BELOW_TARGET") {
    if (summary.status !== "NOT_MET" || summary.actualValue === null || instance.targetValue === null) return null;
    return {
      kpiTitle: instance.name,
      cycleTitle: current.title,
      actualValue: summary.actualValue,
      targetValue: instance.targetValue,
      measurementUnit: instance.measurementUnit,
      periodEnd: period.periodEnd,
      href: notificationHref(candidate),
    };
  }

  const manual = instance.calculationMethod === "MANUAL_RATIO" || instance.calculationMethod === "MANUAL_NUMBER";
  const remaining = daysBetween(today, period.periodEnd);
  if (!manual || summary.status !== "NO_DATA" || remaining < 0 || remaining > 3) return null;
  return {
    kpiTitle: instance.name,
    cycleTitle: current.title,
    periodEnd: period.periodEnd,
    daysRemaining: remaining,
    href: notificationHref(candidate),
  };
}

async function buildPayload(
  candidate: NotificationEmailCandidate,
  today: string,
  tomorrow: string,
): Promise<Record<string, unknown> | null> {
  switch (candidate.notificationType) {
    case "TASK_OVERDUE":
    case "TASK_DUE_TODAY":
    case "HIGH_PRIORITY_TASK_DUE_TOMORROW":
      return taskPayload(candidate, today, tomorrow);
    case "CURRENT_CYCLE_ENDING_SOON":
    case "CURRENT_CYCLE_PAST_END":
      return cyclePayload(candidate, today);
    case "KPI_BELOW_TARGET":
    case "KPI_MEASUREMENT_DUE":
      return kpiPayload(candidate, today);
  }
  return null;
}

async function synchronizeNotificationsForActiveUsers(): Promise<void> {
  const owners = await notificationsRepository.listActiveOwners();
  for (const ownerUserId of owners) {
    try {
      await notificationsService.synchronize(ownerUserId);
    } catch (error) {
      logger.warn({ err: error, ownerUserId }, "Operational notification synchronization failed for one user");
    }
  }
}

async function processCandidate(candidate: NotificationEmailCandidate, today: string, tomorrow: string): Promise<void> {
  const delivery = await emailSettingsService.resolveOperationalDelivery(
    candidate.ownerUserId,
    candidate.notificationType,
  );

  if (!delivery) {
    await notificationsRepository.markEmailProcessed(Number(candidate.id));
    return;
  }

  const payload = await buildPayload(candidate, today, tomorrow);
  if (!payload) {
    await notificationsRepository.markEmailProcessed(Number(candidate.id));
    return;
  }

  await emailService.queue({
    ownerUserId: candidate.ownerUserId,
    recipientEmail: delivery.recipient.email,
    recipientName: delivery.recipient.name,
    language: delivery.language,
    templateKey: templateKeyForNotification(candidate.notificationType),
    payload,
    dedupeKey: `OPERATIONAL_EMAIL:${candidate.ownerUserId}:${candidate.dedupeKey}`,
  });

  await notificationsRepository.markEmailProcessed(Number(candidate.id));
}

export const operationalEmailService = {
  async synchronize(): Promise<number> {
    const now = Date.now();
    if (now >= nextEventSynchronizationAt) {
      await synchronizeNotificationsForActiveUsers();
      nextEventSynchronizationAt = now + OPERATIONAL_EVENT_SYNC_INTERVAL_MS;
    }

    const today = getCurrentDateInAppTimeZone();
    const tomorrow = addDays(today, 1);
    const candidates = await notificationsRepository.listUnprocessedEmailCandidates(EMAIL_CANDIDATE_BATCH_SIZE);

    let processed = 0;
    for (const candidate of candidates) {
      try {
        await processCandidate(candidate, today, tomorrow);
        processed += 1;
      } catch (error) {
        logger.warn(
          {
            err: error,
            ownerUserId: candidate.ownerUserId,
            notificationId: Number(candidate.id),
            notificationType: candidate.notificationType,
          },
          "Operational email candidate will be retried",
        );
      }
    }

    return processed;
  },
};
