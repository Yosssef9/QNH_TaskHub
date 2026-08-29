import { Router, type Router as ExpressRouter } from "express";

import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { updateCurrentUserPreferences } from "./preferences.controller.js";
import { updatePreferencesBodySchema } from "./preferences.schemas.js";

export const preferencesRouter: ExpressRouter = Router();

preferencesRouter.patch(
  "/me/preferences",
  verifyPortalJwt,
  resolveTaskHubAccess,
  validateRequest({ body: updatePreferencesBodySchema }),
  updateCurrentUserPreferences,
);
