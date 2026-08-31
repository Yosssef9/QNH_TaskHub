import { logger } from "../../config/logger.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { findAccessUserById } from "../access/access.repository.js";
import { contractsService } from "../contracts/contracts.service.js";
import { dashboardService } from "../dashboard/dashboard.service.js";
import { emailSettingsService } from "../email-settings/email-settings.service.js";
import type { EmailPreferenceEvent, OperationalEmailDelivery } from "../email-settings/email-settings.types.js";
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
import type { NotificationType } from "../notifications/notifications.types.js";
import { workCyclesService } from "../work-cycles/work-cycles.service.js";
import { emailService } from "./email.service.js";
import { isContractNotificationType, templateKeyForNotification } from "./operational-email.policy.js";

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

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function asEmailPreferenceEvent(type: NotificationType): EmailPreferenceEvent | null {
  switch (type) {
    case "TASK_OVERDUE":
    case "TASK_DUE_TODAY":
    case "HIGH_PRIORITY_TASK_DUE_TOMORROW":
    case "CURRENT_CYCLE_ENDING_SOON":
    case "CURRENT_CYCLE_PAST_END":
    case "KPI_BELOW_TARGET":
    case "KPI_MEASUREMENT_DUE":
      return type;
    case "CONTRACT_EXPIRATION_REMINDER":
    case "CONTRACT_NOTICE_DEADLINE_REMINDER":
      return null;
  }
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

  const dueDate = dateOnly(task.dueDate);
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

async function contractPayload(
  candidate: NotificationEmailCandidate,
  today: string,
): Promise<Record<string, unknown> | null> {
  const contractId = id(candidate.contractId);
  const eventDate = dateOnly(candidate.eventDate);
  if (contractId === null || !eventDate) return null;

  const [contract, settings] = await Promise.all([
    contractsService.getContract(candidate.ownerUserId, contractId),
    contractsService.getSettings(candidate.ownerUserId),
  ]);
  if (!contract.isActive) return null;

  if (candidate.notificationType === "CONTRACT_EXPIRATION_REMINDER") {
    if (!contract.endDate || contract.endDate !== eventDate) return null;
    const targetDate = addDays(contract.endDate, -settings.expirationReminderLeadDays);
    if (today < targetDate || today > contract.endDate) return null;
    return {
      contractId,
      contractTitle: contract.title,
      contractNumber: contract.contractNumber,
      supplierName: contract.supplierName,
      endDate: contract.endDate,
      daysRemaining: Math.max(0, daysBetween(today, contract.endDate)),
      href: `/contracts/${contractId}`,
    };
  }

  if (
    !contract.isAutoRenewal ||
    !contract.endDate ||
    !contract.noticePeriodDays ||
    !contract.noticeDeadline ||
    contract.noticeDeadline !== eventDate
  ) return null;
  const targetDate = addDays(contract.noticeDeadline, -settings.noticeReminderLeadDays);
  if (today < targetDate || today > contract.noticeDeadline) return null;
  return {
    contractId,
    contractTitle: contract.title,
    contractNumber: contract.contractNumber,
    supplierName: contract.supplierName,
    endDate: contract.endDate,
    noticePeriodDays: contract.noticePeriodDays,
    noticeDeadline: contract.noticeDeadline,
    daysRemaining: Math.max(0, daysBetween(today, contract.noticeDeadline)),
    href: `/contracts/${contractId}`,
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
    case "CONTRACT_EXPIRATION_REMINDER":
    case "CONTRACT_NOTICE_DEADLINE_REMINDER":
      return contractPayload(candidate, today);
  }
}

async function resolveDelivery(
  ownerUserId: number,
  type: NotificationType,
): Promise<OperationalEmailDelivery | null> {
  if (isContractNotificationType(type)) {
    const access = await findAccessUserById(ownerUserId);
    if (!access?.portalIsActive || !access.accessIsActive || !access.contractsEnabled) return null;
    const settings = await contractsService.getSettings(ownerUserId);
    const enabled = type === "CONTRACT_EXPIRATION_REMINDER"
      ? settings.expirationEmailEnabled
      : settings.noticeEmailEnabled;
    if (!enabled) return null;
    return emailSettingsService.resolveBaseOperationalDelivery(ownerUserId);
  }

  const event = asEmailPreferenceEvent(type);
  return event ? emailSettingsService.resolveOperationalDelivery(ownerUserId, event) : null;
}

async function validateContractPayloadAtSend(
  ownerUserId: number,
  type: "CONTRACT_EXPIRATION_REMINDER" | "CONTRACT_NOTICE_DEADLINE_REMINDER",
  payload: Record<string, unknown>,
): Promise<boolean> {
  const contractId = Number(payload.contractId);
  if (!Number.isSafeInteger(contractId) || contractId <= 0) return false;
  const today = getCurrentDateInAppTimeZone();
  const contract = await contractsService.getContract(ownerUserId, contractId);
  const settings = await contractsService.getSettings(ownerUserId);
  if (!contract.isActive) return false;

  if (type === "CONTRACT_EXPIRATION_REMINDER") {
    if (!settings.expirationEmailEnabled || !contract.endDate || payload.endDate !== contract.endDate) return false;
    return today >= addDays(contract.endDate, -settings.expirationReminderLeadDays) && today <= contract.endDate;
  }

  if (
    !settings.noticeEmailEnabled ||
    !contract.isAutoRenewal ||
    !contract.noticeDeadline ||
    payload.noticeDeadline !== contract.noticeDeadline
  ) return false;
  return today >= addDays(contract.noticeDeadline, -settings.noticeReminderLeadDays) && today <= contract.noticeDeadline;
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
  const delivery = await resolveDelivery(candidate.ownerUserId, candidate.notificationType);

  if (!delivery) {
    if (!isContractNotificationType(candidate.notificationType)) {
      await notificationsRepository.markEmailProcessed(Number(candidate.id));
    }
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
  async resolveSendTimeDelivery(
    ownerUserId: number,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<OperationalEmailDelivery | null> {
    const delivery = await resolveDelivery(ownerUserId, type);
    if (!delivery) return null;
    if (isContractNotificationType(type)) {
      return (await validateContractPayloadAtSend(ownerUserId, type, payload)) ? delivery : null;
    }
    return delivery;
  },

  async synchronize(): Promise<number> {
    const now = Date.now();
    if (now >= nextEventSynchronizationAt) {
      await synchronizeNotificationsForActiveUsers();
      nextEventSynchronizationAt = now + OPERATIONAL_EVENT_SYNC_INTERVAL_MS;
    }

    const today = getCurrentDateInAppTimeZone();
    const tomorrow = addDays(today, 1);
    const candidates = await notificationsRepository.listUnprocessedEmailCandidates(
      EMAIL_CANDIDATE_BATCH_SIZE,
      today,
    );

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
