import { z } from "zod";

import { normalizeSqlRowVersion } from "./contracts-row-version.js";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableTrimmed = (max: number) => z.string().trim().max(max).nullable();
const rowVersion = z.preprocess(
  (value) => normalizeSqlRowVersion(value) ?? value,
  z.string().regex(/^0x[0-9A-Fa-f]{16}$/),
);

function optionalBooleanQuery(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return value;
}

export const attachmentIdParamsSchema = z.object({
  attachmentId: z.guid(),
});

export const contractIdParamsSchema = z.object({
  contractId: z.coerce.number().int().positive(),
});

export const supplierIdParamsSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
});

export const contractListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  archived: z.preprocess(optionalBooleanQuery, z.boolean().default(false)),
  status: z.enum(["UPCOMING", "ACTIVE", "EXPIRING_SOON", "EXPIRED"]).optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  autoRenewal: z.preprocess(optionalBooleanQuery, z.boolean().optional()),
  valueType: z.enum(["FIXED", "VARIABLE"]).optional(),
  paymentFrequency: z
    .enum(["ONE_TIME", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"])
    .optional(),
  paymentTiming: z.enum(["IN_ADVANCE", "IN_ARREARS"]).optional(),
  startFrom: dateOnly.optional(),
  startTo: dateOnly.optional(),
  endFrom: dateOnly.optional(),
  endTo: dateOnly.optional(),
  sortBy: z.enum(["title", "supplier", "startDate", "endDate", "value"]).default("endDate"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
});

export const supplierListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  archived: z.preprocess(optionalBooleanQuery, z.boolean().default(false)),
});

const supplierFields = {
  name: z.string().trim().min(1).max(250),
  commercialRegistrationNo: nullableTrimmed(80),
  taxNumber: nullableTrimmed(80),
  primaryContactName: nullableTrimmed(200),
  primaryContactEmail: z.string().trim().email().max(320).nullable(),
  primaryContactPhone: nullableTrimmed(50),
  addressText: nullableTrimmed(1000),
  notes: z.string().trim().max(10000).nullable(),
} as const;

export const createSupplierBodySchema = z.object(supplierFields);
export const updateSupplierBodySchema = z.object({ ...supplierFields, rowVersion });

const contractFields = {
  supplierId: z.coerce.number().int().positive(),
  contractNumber: nullableTrimmed(120),
  title: z.string().trim().min(1).max(250),
  startDate: dateOnly,
  endDate: dateOnly.nullable(),
  isAutoRenewal: z.boolean(),
  renewalTermMonths: z.number().int().positive().max(1200).nullable(),
  noticePeriodDays: z.number().int().positive().max(3650).nullable(),
  valueType: z.enum(["FIXED", "VARIABLE"]),
  contractValueSar: z.number().nonnegative().max(99999999999999999).nullable(),
  paymentFrequency: z
    .enum(["ONE_TIME", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"])
    .nullable(),
  paymentTiming: z.enum(["IN_ADVANCE", "IN_ARREARS"]).nullable(),
  notes: z.string().trim().max(20000).nullable(),
} as const;

const contractObjectSchema = z.object(contractFields);
type ContractFieldsValue = z.infer<typeof contractObjectSchema>;

function validateContract(data: ContractFieldsValue, ctx: z.RefinementCtx): void {
  if (data.endDate !== null && data.endDate < data.startDate) {
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "End date cannot be before start date.",
    });
  }

  if (data.isAutoRenewal) {
    if (!data.endDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is required." });
    }
    if (!data.renewalTermMonths) {
      ctx.addIssue({
        code: "custom",
        path: ["renewalTermMonths"],
        message: "Renewal term is required.",
      });
    }
    if (!data.noticePeriodDays) {
      ctx.addIssue({
        code: "custom",
        path: ["noticePeriodDays"],
        message: "Notice period is required.",
      });
    }
  } else if (data.renewalTermMonths !== null || data.noticePeriodDays !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["isAutoRenewal"],
      message: "Renewal fields only apply to automatic-renewal contracts.",
    });
  }

  if (data.valueType === "FIXED" && data.contractValueSar === null) {
    ctx.addIssue({
      code: "custom",
      path: ["contractValueSar"],
      message: "Contract value is required for fixed-value contracts.",
    });
  }

  if (data.valueType === "VARIABLE" && data.contractValueSar !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["contractValueSar"],
      message: "Variable-value contracts do not store a fixed total amount.",
    });
  }
}

export const createContractBodySchema = contractObjectSchema.superRefine(validateContract);
export const updateContractBodySchema = z
  .object({ ...contractFields, rowVersion })
  .superRefine(validateContract);

export const rowVersionBodySchema = z.object({ rowVersion });

export const contractSettingsBodySchema = z.object({
  expiringSoonDays: z.number().int().min(1).max(365),
  expirationEmailEnabled: z.boolean(),
  expirationReminderLeadDays: z.number().int().min(1).max(365),
  noticeEmailEnabled: z.boolean(),
  noticeReminderLeadDays: z.number().int().min(1).max(365),
  rowVersion,
});

export type AttachmentIdParams = z.infer<typeof attachmentIdParamsSchema>;
export type ContractIdParams = z.infer<typeof contractIdParamsSchema>;
export type SupplierIdParams = z.infer<typeof supplierIdParamsSchema>;
export type ContractListQueryInput = z.infer<typeof contractListQuerySchema>;
export type SupplierListQueryInput = z.infer<typeof supplierListQuerySchema>;
export type CreateSupplierBody = z.infer<typeof createSupplierBodySchema>;
export type UpdateSupplierBody = z.infer<typeof updateSupplierBodySchema>;
export type CreateContractBody = z.infer<typeof createContractBodySchema>;
export type UpdateContractBody = z.infer<typeof updateContractBodySchema>;
export type RowVersionBody = z.infer<typeof rowVersionBodySchema>;
export type ContractSettingsBody = z.infer<typeof contractSettingsBodySchema>;

