import { Router, type Router as ExpressRouter } from "express";

import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { getCurrentUser } from "./auth.controller.js";

export const authRouter: ExpressRouter = Router();

authRouter.get("/me", verifyPortalJwt, resolveTaskHubAccess, getCurrentUser);
