import { Router, type Router as ExpressRouter } from "express";

import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  getTask,
  getTaskSummary,
  listTasks,
  restoreTask,
  updateTask,
} from "./tasks.controller.js";
import {
  changeTaskStatusBodySchema,
  createTaskBodySchema,
  listTasksParamsSchema,
  taskListQuerySchema,
  taskParamsSchema,
  updateTaskBodySchema,
} from "./tasks.schemas.js";

export const listTasksRouter: ExpressRouter = Router();
listTasksRouter.use(verifyPortalJwt, resolveTaskHubAccess);
listTasksRouter.get(
  "/:listId/tasks",
  validateRequest({ params: listTasksParamsSchema, query: taskListQuerySchema }),
  listTasks,
);
listTasksRouter.get(
  "/:listId/tasks/summary",
  validateRequest({ params: listTasksParamsSchema }),
  getTaskSummary,
);
listTasksRouter.post(
  "/:listId/tasks",
  validateRequest({ params: listTasksParamsSchema, body: createTaskBodySchema }),
  createTask,
);

export const tasksRouter: ExpressRouter = Router();
tasksRouter.use(verifyPortalJwt, resolveTaskHubAccess);
tasksRouter.get("/:taskId", validateRequest({ params: taskParamsSchema }), getTask);
tasksRouter.patch(
  "/:taskId",
  validateRequest({ params: taskParamsSchema, body: updateTaskBodySchema }),
  updateTask,
);
tasksRouter.patch(
  "/:taskId/status",
  validateRequest({ params: taskParamsSchema, body: changeTaskStatusBodySchema }),
  changeTaskStatus,
);
tasksRouter.delete("/:taskId", validateRequest({ params: taskParamsSchema }), deleteTask);
tasksRouter.post("/:taskId/restore", validateRequest({ params: taskParamsSchema }), restoreTask);
