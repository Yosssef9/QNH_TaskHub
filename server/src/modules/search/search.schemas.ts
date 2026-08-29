import { z } from "zod";

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(30).default(18),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;
