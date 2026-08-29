import { z } from "zod";

import { LIST_COLORS, LIST_ICON_KEYS } from "./lists.constants.js";

const listNameSchema = z.string().trim().min(1).max(120);

export const listParamsSchema = z.object({
  listId: z.coerce.number().int().positive(),
});

export const createListBodySchema = z.object({
  name: listNameSchema,
  iconKey: z.enum(LIST_ICON_KEYS),
  color: z.enum(LIST_COLORS),
});

export const updateListBodySchema = createListBodySchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one list field is required.",
  });

export const reorderListsBodySchema = z
  .object({
    listIds: z.array(z.number().int().positive()),
  })
  .refine((input) => new Set(input.listIds).size === input.listIds.length, {
    message: "List identifiers must be unique.",
    path: ["listIds"],
  });

export type ListParams = z.infer<typeof listParamsSchema>;
export type CreateListBody = z.infer<typeof createListBodySchema>;
export type UpdateListBody = z.infer<typeof updateListBodySchema>;
export type ReorderListsBody = z.infer<typeof reorderListsBodySchema>;
