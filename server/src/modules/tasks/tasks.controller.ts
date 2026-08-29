import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type {
  ChangeTaskStatusBody,
  CreateTaskBody,
  ListTasksParams,
  TaskListQueryInput,
  TaskParams,
  UpdateTaskBody,
} from "./tasks.schemas.js";
import { tasksService } from "./tasks.service.js";
import type { PersonalTask, TaskListResult, TaskSummary } from "./tasks.types.js";

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

export const listTasks: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ListTasksParams>(req, "params");
  const query = getValidatedRequestPart<TaskListQueryInput>(req, "query");
  const result = await tasksService.list(ownerId(req), params.listId, query);
  const body: ApiSuccessResponse<TaskListResult> = { success: true, data: result };
  res.status(200).json(body);
};

export const getTaskSummary: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ListTasksParams>(req, "params");
  const summary = await tasksService.summary(ownerId(req), params.listId);
  const body: ApiSuccessResponse<TaskSummary> = { success: true, data: summary };
  res.status(200).json(body);
};

export const createTask: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ListTasksParams>(req, "params");
  const input = getValidatedRequestPart<CreateTaskBody>(req, "body");
  const task = await tasksService.create(ownerId(req), params.listId, input);
  const body: ApiSuccessResponse<{ task: PersonalTask }> = { success: true, data: { task } };
  res.status(201).json(body);
};

export const getTask: RequestHandler = async (req, res) => {
  const { taskId } = getValidatedRequestPart<TaskParams>(req, "params");
  const task = await tasksService.get(ownerId(req), taskId);
  res
    .status(200)
    .json({ success: true, data: { task } } satisfies ApiSuccessResponse<{ task: PersonalTask }>);
};

export const updateTask: RequestHandler = async (req, res) => {
  const { taskId } = getValidatedRequestPart<TaskParams>(req, "params");
  const input = getValidatedRequestPart<UpdateTaskBody>(req, "body");
  const task = await tasksService.update(ownerId(req), taskId, input);
  res
    .status(200)
    .json({ success: true, data: { task } } satisfies ApiSuccessResponse<{ task: PersonalTask }>);
};

export const changeTaskStatus: RequestHandler = async (req, res) => {
  const { taskId } = getValidatedRequestPart<TaskParams>(req, "params");
  const input = getValidatedRequestPart<ChangeTaskStatusBody>(req, "body");
  const task = await tasksService.changeStatus(ownerId(req), taskId, input);
  res
    .status(200)
    .json({ success: true, data: { task } } satisfies ApiSuccessResponse<{ task: PersonalTask }>);
};

export const deleteTask: RequestHandler = async (req, res) => {
  const { taskId } = getValidatedRequestPart<TaskParams>(req, "params");
  await tasksService.remove(ownerId(req), taskId);
  res.status(204).send();
};

export const restoreTask: RequestHandler = async (req, res) => {
  const { taskId } = getValidatedRequestPart<TaskParams>(req, "params");
  const task = await tasksService.restore(ownerId(req), taskId);
  res
    .status(200)
    .json({ success: true, data: { task } } satisfies ApiSuccessResponse<{ task: PersonalTask }>);
};
