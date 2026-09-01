import { z } from "zod";

export const accessListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const accessUserParamsSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const updateAccessBodySchema = z.object({
  roleCode: z.enum(["USER", "ADMIN"]),
  isActive: z.boolean(),
  contractsEnabled: z.boolean().optional(),
  meetingOrganizeEnabled: z.boolean().optional(),
  meetingCoordinateEnabled: z.boolean().optional(),
});

export type AccessListQueryInput = z.infer<typeof accessListQuerySchema>;
export type AccessUserParams = z.infer<typeof accessUserParamsSchema>;
export type UpdateAccessBody = z.infer<typeof updateAccessBodySchema>;
