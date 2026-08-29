import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type {
  AttachmentIdParams,
  CompleteSubtaskBody,
  CreateSubtaskBody,
  ReorderSubtasksBody,
  SubtaskIdParams,
  TaskIdParams,
  UpdateSubtaskBody,
} from "./task-details.schemas.js";
import { taskDetailsService } from "./task-details.service.js";
import type { Attachment, Subtask, TaskDetails } from "./task-details.types.js";

function ownerId(req: Request): number {
  const id = req.authContext?.user.userId;
  if (!id)
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated access was not resolved.",
    });
  return id;
}
export const getTaskDetails: RequestHandler = async (req, res) => {
  const { taskId } = getValidatedRequestPart<TaskIdParams>(req, "params");
  const body: ApiSuccessResponse<TaskDetails> = {
    success: true,
    data: await taskDetailsService.get(ownerId(req), taskId),
  };
  res.status(200).json(body);
};
export const createSubtask: RequestHandler = async (req, res) => {
  const { taskId } = getValidatedRequestPart<TaskIdParams>(req, "params");
  const subtask = await taskDetailsService.createSubtask(
    ownerId(req),
    taskId,
    getValidatedRequestPart<CreateSubtaskBody>(req, "body"),
  );
  res
    .status(201)
    .json({ success: true, data: { subtask } } satisfies ApiSuccessResponse<{ subtask: Subtask }>);
};
export const updateSubtask: RequestHandler = async (req, res) => {
  const { subtaskId } = getValidatedRequestPart<SubtaskIdParams>(req, "params");
  const result = await taskDetailsService.updateSubtask(
    ownerId(req),
    subtaskId,
    getValidatedRequestPart<UpdateSubtaskBody>(req, "body"),
  );
  res.status(200).json({
    success: true,
    data: { subtask: result.subtask },
  } satisfies ApiSuccessResponse<{
    subtask: Subtask;
  }>);
};
export const completeSubtask: RequestHandler = async (req, res) => {
  const { subtaskId } = getValidatedRequestPart<SubtaskIdParams>(req, "params");
  const { isCompleted } = getValidatedRequestPart<CompleteSubtaskBody>(req, "body");
  await taskDetailsService.completeSubtask(ownerId(req), subtaskId, isCompleted);
  res.status(204).send();
};
export const deleteSubtask: RequestHandler = async (req, res) => {
  const { subtaskId } = getValidatedRequestPart<SubtaskIdParams>(req, "params");
  await taskDetailsService.deleteSubtask(ownerId(req), subtaskId);
  res.status(204).send();
};
export const reorderSubtasks: RequestHandler = async (req, res) => {
  const { taskId } = getValidatedRequestPart<TaskIdParams>(req, "params");
  const { subtaskIds } = getValidatedRequestPart<ReorderSubtasksBody>(req, "body");
  await taskDetailsService.reorder(ownerId(req), taskId, subtaskIds);
  res.status(204).send();
};
function requireFile(req: Request): Express.Multer.File {
  if (!req.file)
    throw new AppError({
      statusCode: 400,
      code: "ATTACHMENT_REQUIRED",
      message: "Choose a file to upload.",
    });
  return req.file;
}
export const uploadTaskAttachment: RequestHandler = async (req, res) => {
  const { taskId } = getValidatedRequestPart<TaskIdParams>(req, "params");
  const attachment = await taskDetailsService.upload(ownerId(req), { taskId }, requireFile(req));
  res.status(201).json({ success: true, data: { attachment } } satisfies ApiSuccessResponse<{
    attachment: Attachment;
  }>);
};
export const uploadSubtaskAttachment: RequestHandler = async (req, res) => {
  const { subtaskId } = getValidatedRequestPart<SubtaskIdParams>(req, "params");
  const attachment = await taskDetailsService.upload(ownerId(req), { subtaskId }, requireFile(req));
  res.status(201).json({ success: true, data: { attachment } } satisfies ApiSuccessResponse<{
    attachment: Attachment;
  }>);
};
export const downloadAttachment: RequestHandler = async (req, res) => {
  const { attachmentId } = getValidatedRequestPart<AttachmentIdParams>(req, "params");
  const { attachment, buffer } = await taskDetailsService.download(ownerId(req), attachmentId);
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalFileName)}`,
  );
  res.status(200).send(buffer);
};

export const previewAttachment: RequestHandler = async (req, res) => {
  const { attachmentId } = getValidatedRequestPart<AttachmentIdParams>(req, "params");
  const { attachment, buffer } = await taskDetailsService.download(ownerId(req), attachmentId);
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalFileName)}`,
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(buffer);
};
export const deleteAttachment: RequestHandler = async (req, res) => {
  const { attachmentId } = getValidatedRequestPart<AttachmentIdParams>(req, "params");
  await taskDetailsService.deleteAttachment(ownerId(req), attachmentId);
  res.status(204).send();
};
