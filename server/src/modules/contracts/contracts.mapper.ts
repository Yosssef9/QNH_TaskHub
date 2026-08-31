import { AppError } from "../../shared/errors/app-error.js";
import { normalizeSqlRowVersion } from "./contracts-row-version.js";
import type {
  Contract,
  ContractActivity,
  ContractActivityType,
  ContractAttachment,
  ContractSummary,
  Supplier,
} from "./contracts.types.js";
import type {
  ActivityRecord,
  ContractAttachmentRecord,
  ContractRecord,
  SupplierRecord,
} from "./contracts.repository.js";

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function dateTime(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}


function rowVersion(value: unknown): string {
  const normalized = normalizeSqlRowVersion(value);
  if (normalized) return normalized;

  throw new AppError({
    statusCode: 500,
    code: "INVALID_ROW_VERSION",
    message: "The database returned an invalid SQL Server row version.",
  });
}

function activityType(value: string): ContractActivityType {
  if (
    value === "CREATED" ||
    value === "UPDATED" ||
    value === "ARCHIVED" ||
    value === "RESTORED" ||
    value === "ATTACHMENT_ADDED" ||
    value === "ATTACHMENT_REMOVED"
  ) {
    return value;
  }
  throw new AppError({
    statusCode: 500,
    code: "INVALID_CONTRACT_ACTIVITY",
    message: "Contract activity has an unsupported type.",
  });
}

export function mapContract(record: ContractRecord): Contract {
  return {
    id: Number(record.id),
    supplierId: Number(record.supplierId),
    supplierName: record.supplierName,
    supplierIsActive: record.supplierIsActive,
    contractNumber: record.contractNumber,
    title: record.title,
    startDate: record.startDate.toISOString().slice(0, 10),
    endDate: dateOnly(record.endDate),
    durationDays: record.durationDays,
    daysRemaining: record.daysRemaining,
    trackingState: record.trackingState,
    isAutoRenewal: record.isAutoRenewal,
    renewalTermMonths: record.renewalTermMonths,
    noticePeriodDays: record.noticePeriodDays,
    noticeDeadline: dateOnly(record.noticeDeadline),
    valueType: record.valueType,
    contractValueSar: record.contractValueSar,
    paymentFrequency: record.paymentFrequency,
    paymentTiming: record.paymentTiming,
    notes: record.notes,
    isActive: record.isActive,
    createdAtUtc: record.createdAtUtc.toISOString(),
    updatedAtUtc: dateTime(record.updatedAtUtc),
    rowVersion: rowVersion(record.rowVersion),
    fileCount: Number(record.fileCount ?? 0),
  };
}

export function mapContractAttachment(record: ContractAttachmentRecord): ContractAttachment {
  return {
    id: record.id,
    contractId: Number(record.contractId),
    originalFileName: record.originalFileName,
    mimeType: record.mimeType,
    fileExtension: record.fileExtension,
    sizeBytes: Number(record.sizeBytes),
    createdAtUtc: record.createdAtUtc.toISOString(),
  };
}

export function mapSupplier(record: SupplierRecord): Supplier {
  return {
    id: Number(record.id),
    name: record.name,
    commercialRegistrationNo: record.commercialRegistrationNo,
    taxNumber: record.taxNumber,
    primaryContactName: record.primaryContactName,
    primaryContactEmail: record.primaryContactEmail,
    primaryContactPhone: record.primaryContactPhone,
    addressText: record.addressText,
    notes: record.notes,
    isActive: record.isActive,
    currentContractCount: Number(record.currentContractCount ?? 0),
    expiringSoonContractCount: Number(record.expiringSoonContractCount ?? 0),
    createdAtUtc: record.createdAtUtc.toISOString(),
    updatedAtUtc: dateTime(record.updatedAtUtc),
    rowVersion: rowVersion(record.rowVersion),
  };
}

export function mapSummary(record: {
  total: number | string;
  active: number | string;
  expiringSoon: number | string;
  expired: number | string;
  upcoming: number | string;
}): ContractSummary {
  return {
    total: Number(record.total ?? 0),
    active: Number(record.active ?? 0),
    expiringSoon: Number(record.expiringSoon ?? 0),
    expired: Number(record.expired ?? 0),
    upcoming: Number(record.upcoming ?? 0),
  };
}

export function mapActivity(record: ActivityRecord): ContractActivity {
  let changes: Record<string, { from: unknown; to: unknown }> | null = null;
  if (record.changesJson) {
    const parsed: unknown = JSON.parse(record.changesJson);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      changes = parsed as Record<string, { from: unknown; to: unknown }>;
    }
  }

  return {
    id: Number(record.id),
    type: activityType(record.activityType),
    changes,
    actorUserId: record.actorUserId,
    actorName: record.actorName,
    createdAtUtc: record.createdAtUtc.toISOString(),
  };
}
