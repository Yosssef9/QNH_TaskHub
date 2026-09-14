import { z } from "zod";

export const accessListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["ALL", "USER", "ADMIN", "UNASSIGNED"]).default("ALL"),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE", "UNASSIGNED"]).default("ALL"),
  procurement: z.enum(["ALL", "WITH_ACCESS", "WITHOUT_ACCESS"]).default("ALL"),
  kpiWorkCycles: z.enum(["ALL", "WITH_ACCESS", "WITHOUT_ACCESS"]).default("ALL"),
  meetings: z.enum(["ALL", "ORGANIZER", "COORDINATOR", "BOTH", "NONE"]).default("ALL"),
  sortBy: z
    .enum(["userName", "userCode", "role", "procurement", "kpiWorkCycles", "meetings", "status"])
    .default("userName"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const accessUserParamsSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const procurementAccessSchema = z.object({
  contracts: z.boolean(),
  items: z.boolean(),
  suppliers: z.boolean(),
  priceQuotes: z.boolean(),
});

export const updateAccessBodySchema = z.object({
  roleCode: z.enum(["USER", "ADMIN"]),
  isActive: z.boolean(),
  procurementAccess: procurementAccessSchema,
  kpiWorkCyclesAccess: z.boolean(),
  meetingOrganizeEnabled: z.boolean().optional(),
  meetingCoordinateEnabled: z.boolean().optional(),
});

export const contractDelegationBodySchema = z
  .object({
    granteeUserId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    view: z.boolean(),
    manageAttachments: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.granteeUserId === value.ownerUserId) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerUserId"],
        message: "A user cannot receive delegated access to their own Contracts.",
      });
    }
    if (value.manageAttachments && !value.view) {
      ctx.addIssue({
        code: "custom",
        path: ["manageAttachments"],
        message: "Manage attachments requires View Contracts access.",
      });
    }
  });

export type AccessListQueryInput = z.infer<typeof accessListQuerySchema>;
export type AccessUserParams = z.infer<typeof accessUserParamsSchema>;
export type UpdateAccessBody = z.infer<typeof updateAccessBodySchema>;
export type ContractDelegationBody = z.infer<typeof contractDelegationBodySchema>;
