import { z } from "zod";

function nonZeroInteger(value: number): boolean {
  return value !== 0;
}

const nullableTrimmed = (max: number) => z.string().trim().max(max).nullable();

export const supplierIdParamsSchema = z.object({
  supplierId: z.coerce.number().int().refine(nonZeroInteger, "Supplier ID cannot be zero."),
});

export const supplierListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  source: z.enum(["ORACLE", "MANUAL"]).optional(),
  sortBy: z.enum(["code", "name", "country", "city", "currency", "contracts", "purchasedItems", "transactions", "lastPurchase"]).default("name"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
});

export const supplierOptionsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  source: z.enum(["ORACLE", "MANUAL"]).optional(),
});

const supplierFields = {
  manualFileNo: nullableTrimmed(100),
  name: z.string().trim().min(1).max(250),
  nameSecondary: nullableTrimmed(250),
  taxRegistrationNo: nullableTrimmed(100),
  countryName: nullableTrimmed(150),
  cityName: nullableTrimmed(150),
  currency: nullableTrimmed(50),
  contactJobTel: nullableTrimmed(100),
  extensionNo: nullableTrimmed(50),
  mobileNo: nullableTrimmed(100),
  homePhone: nullableTrimmed(100),
  email: z.string().trim().email().max(320).nullable(),
} as const;

export const createSupplierBodySchema = z.object(supplierFields);
export const updateSupplierBodySchema = z.object(supplierFields);

export type SupplierIdParams = z.infer<typeof supplierIdParamsSchema>;
export type SupplierListQueryInput = z.infer<typeof supplierListQuerySchema>;
export type SupplierOptionsQueryInput = z.infer<typeof supplierOptionsQuerySchema>;
export type CreateSupplierBody = z.infer<typeof createSupplierBodySchema>;
export type UpdateSupplierBody = z.infer<typeof updateSupplierBodySchema>;

