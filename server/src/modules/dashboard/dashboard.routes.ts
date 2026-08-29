import { Router, type Router as ExpressRouter } from "express";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { getDashboard } from "./dashboard.controller.js";

export const dashboardRouter: ExpressRouter = Router();
dashboardRouter.use(verifyPortalJwt, resolveTaskHubAccess);
dashboardRouter.get("/", getDashboard);
