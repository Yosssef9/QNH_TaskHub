import { Router, type Router as ExpressRouter } from "express";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { uploadSingleAttachment } from "./attachment-upload.middleware.js";
import {
  completeSubtask,
  createSubtask,
  deleteAttachment,
  deleteSubtask,
  downloadAttachment,
  getTaskDetails,
  previewAttachment,
  reorderSubtasks,
  updateSubtask,
  uploadSubtaskAttachment,
  uploadTaskAttachment,
} from "./task-details.controller.js";
import {
  attachmentIdParamsSchema,
  completeSubtaskBodySchema,
  createSubtaskBodySchema,
  reorderSubtasksBodySchema,
  subtaskIdParamsSchema,
  taskIdParamsSchema,
  updateSubtaskBodySchema,
} from "./task-details.schemas.js";

export const taskDetailsRouter: ExpressRouter = Router();
taskDetailsRouter.use(verifyPortalJwt, resolveTaskHubAccess);
taskDetailsRouter.get(
  "/:taskId/details",
  validateRequest({ params: taskIdParamsSchema }),
  getTaskDetails,
);
taskDetailsRouter.post(
  "/:taskId/subtasks",
  validateRequest({ params: taskIdParamsSchema, body: createSubtaskBodySchema }),
  createSubtask,
);
taskDetailsRouter.put(
  "/:taskId/subtasks/reorder",
  validateRequest({ params: taskIdParamsSchema, body: reorderSubtasksBodySchema }),
  reorderSubtasks,
);
taskDetailsRouter.post(
  "/:taskId/attachments",
  validateRequest({ params: taskIdParamsSchema }),
  uploadSingleAttachment,
  uploadTaskAttachment,
);
export const subtasksRouter: ExpressRouter = Router();
subtasksRouter.use(verifyPortalJwt, resolveTaskHubAccess);
subtasksRouter.patch(
  "/:subtaskId",
  validateRequest({ params: subtaskIdParamsSchema, body: updateSubtaskBodySchema }),
  updateSubtask,
);
subtasksRouter.patch(
  "/:subtaskId/completion",
  validateRequest({ params: subtaskIdParamsSchema, body: completeSubtaskBodySchema }),
  completeSubtask,
);
subtasksRouter.delete(
  "/:subtaskId",
  validateRequest({ params: subtaskIdParamsSchema }),
  deleteSubtask,
);
subtasksRouter.post(
  "/:subtaskId/attachments",
  validateRequest({ params: subtaskIdParamsSchema }),
  uploadSingleAttachment,
  uploadSubtaskAttachment,
);
export const attachmentsRouter: ExpressRouter = Router();
attachmentsRouter.use(verifyPortalJwt, resolveTaskHubAccess);
attachmentsRouter.get(
  "/:attachmentId/preview",
  validateRequest({ params: attachmentIdParamsSchema }),
  previewAttachment,
);
attachmentsRouter.get(
  "/:attachmentId/download",
  validateRequest({ params: attachmentIdParamsSchema }),
  downloadAttachment,
);
attachmentsRouter.delete(
  "/:attachmentId",
  validateRequest({ params: attachmentIdParamsSchema }),
  deleteAttachment,
);
