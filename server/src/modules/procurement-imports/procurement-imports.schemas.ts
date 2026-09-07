import { z } from "zod";

export const procurementImportPreviewQuerySchema = z.object({
  sheetName: z.string().trim().min(1).max(128).optional(),
});

export const procurementImportApplyBodySchema = z.object({
  sheetName: z.string().trim().min(1).max(128).optional(),
  targetMode: z.enum(["EXISTING_VIEW", "NEW_VIEW"]),
  targetSavedViewId: z.preprocess(
    (value) => value === "" || value === undefined ? undefined : value,
    z.coerce.number().int().positive().optional(),
  ),
  newViewName: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).max(120).optional(),
  ),
}).superRefine((value, context) => {
  if (value.targetMode === "EXISTING_VIEW" && value.targetSavedViewId === undefined) {
    context.addIssue({
      code: "custom",
      path: ["targetSavedViewId"],
      message: "Choose an existing Saved View.",
    });
  }
  if (value.targetMode === "NEW_VIEW" && value.newViewName === undefined) {
    context.addIssue({
      code: "custom",
      path: ["newViewName"],
      message: "Enter a name for the new Saved View.",
    });
  }
});

export type ProcurementImportPreviewQuery = z.infer<typeof procurementImportPreviewQuerySchema>;
export type ProcurementImportApplyBody = z.infer<typeof procurementImportApplyBodySchema>;
