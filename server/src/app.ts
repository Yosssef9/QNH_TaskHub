import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { httpLogger } from "./config/http-logger.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { notFoundMiddleware } from "./middleware/not-found.middleware.js";
import { accessRouter } from "./modules/access/access.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { calendarRouter } from "./modules/calendar/calendar.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { emailSettingsRouter } from "./modules/email-settings/email-settings.routes.js";
import { listsRouter } from "./modules/lists/lists.routes.js";
import { holidaysRouter } from "./modules/holidays/holidays.routes.js";
import { kpisRouter } from "./modules/kpis/kpis.routes.js";
import { kpiTasksRouter } from "./modules/kpis/kpi-tasks.routes.js";
import { kpiInstancesRouter } from "./modules/kpis/kpi-instances.routes.js";
import { workCyclesRouter } from "./modules/work-cycles/work-cycles.routes.js";
import { preferencesRouter } from "./modules/preferences/preferences.routes.js";
import { searchRouter } from "./modules/search/search.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import {
  attachmentsRouter,
  subtasksRouter,
  taskDetailsRouter,
} from "./modules/task-details/task-details.routes.js";
import { listTasksRouter, tasksRouter } from "./modules/tasks/tasks.routes.js";
import type { ApiSuccessResponse } from "./shared/types/result.js";

interface HealthData {
  status: "ok";
}

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
    }),
  );
  app.use(httpLogger);
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    const body: ApiSuccessResponse<HealthData> = {
      success: true,
      data: { status: "ok" },
    };

    res.status(200).json(body);
  });

  app.use("/api/auth", authRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/calendar", calendarRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/email-settings", emailSettingsRouter);
  app.use("/api/lists", listTasksRouter, listsRouter);
  app.use("/api/kpis", kpisRouter);
  app.use("/api/kpi-tasks", kpiTasksRouter);
  app.use("/api/kpi-instances", kpiInstancesRouter);
  app.use("/api/work-cycles", workCyclesRouter);
  app.use("/api/tasks", taskDetailsRouter, tasksRouter);
  app.use("/api/subtasks", subtasksRouter);
  app.use("/api/attachments", attachmentsRouter);
  app.use("/api/admin/access", accessRouter);
  app.use("/api/admin/holidays", holidaysRouter);
  app.use("/api/users", preferencesRouter);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

export const app = createApp();
