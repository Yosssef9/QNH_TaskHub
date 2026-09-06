import { AppError } from "../../shared/errors/app-error.js";
import type {
  ProcurementActivityType,
  Supplier,
  SupplierActivity,
  SupplierOption,
  SupplierSource,
} from "./suppliers.types.js";
import type { SupplierActivityRecord, SupplierOptionRecord, SupplierRecord } from "./suppliers.repository.js";

function source(value: string): SupplierSource {
  if (value === "ORACLE" || value === "MANUAL") return value;
  throw new AppError({
    statusCode: 500,
    code: "INVALID_SUPPLIER_SOURCE",
    message: "Supplier source is not supported.",
  });
}

function activityType(value: string): ProcurementActivityType {
  if (value === "CREATED" || value === "UPDATED" || value === "DEACTIVATED" || value === "REACTIVATED") {
    return value;
  }
  throw new AppError({
    statusCode: 500,
    code: "INVALID_PROCUREMENT_ACTIVITY",
    message: "Procurement activity has an unsupported type.",
  });
}

export function mapSupplierOption(record: SupplierOptionRecord): SupplierOption {
  return {
    id: Number(record.id),
    code: record.code,
    name: record.name,
  };
}

export function mapSupplier(record: SupplierRecord): Supplier {
  return {
    id: Number(record.id),
    code: record.code,
    manualFileNo: record.manualFileNo,
    name: record.name,
    nameSecondary: record.nameSecondary,
    taxRegistrationNo: record.taxRegistrationNo,
    countryName: record.countryName,
    cityName: record.cityName,
    currency: record.currency,
    contactJobTel: record.contactJobTel,
    extensionNo: record.extensionNo,
    mobileNo: record.mobileNo,
    homePhone: record.homePhone,
    email: record.email,
    source: source(record.source),
    currentContractCount: Number(record.currentContractCount ?? 0),
    expiringSoonContractCount: Number(record.expiringSoonContractCount ?? 0),
    purchasedItemCount: Number(record.purchasedItemCount ?? 0),
    transactionCount: Number(record.transactionCount ?? 0),
    lastPurchaseDate: record.lastPurchaseDate ? record.lastPurchaseDate.toISOString().slice(0, 10) : null,
  };
}

export function mapSupplierActivity(record: SupplierActivityRecord): SupplierActivity {
  const parse = (value: string | null): Record<string, unknown> | null => {
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  };

  const before = parse(record.beforeValues);
  const after = parse(record.afterValues);
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    const from = before?.[key] ?? null;
    const to = after?.[key] ?? null;
    if (from !== to) changes[key] = { from, to };
  }

  return {
    id: Number(record.id),
    type: activityType(record.actionType),
    changes: Object.keys(changes).length ? changes : null,
    actorUserId: record.actorUserId,
    actorName: record.actorName,
    createdAtUtc: record.createdAtUtc.toISOString(),
  };
}

