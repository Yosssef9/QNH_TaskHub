import { Router, type Router as ExpressRouter } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { DISCUSSIONS_INTRO_KEY, featureAnnouncementsService } from "./feature-announcements.service.js";

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


// Fixed release key: do not accept arbitrary keys or other user IDs from clients.
function currentPortalUserId(req: import('express').Request): number {
  const userId = req.authContext?.user.userId;
  if (!userId) throw new AppError({statusCode:500,code:'AUTH_CONTEXT_MISSING',message:'TaskHub access was not resolved.'});
  return userId;
}

preferencesRouter.get('/me/feature-announcements/discussions', verifyPortalJwt, resolveTaskHubAccess, async (req, res) => {
  const seen = await featureAnnouncementsService.isSeen(currentPortalUserId(req));
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({success:true,data:{key:DISCUSSIONS_INTRO_KEY,seen}});
});

preferencesRouter.put('/me/feature-announcements/discussions/seen', verifyPortalJwt, resolveTaskHubAccess, async (req, res) => {
  await featureAnnouncementsService.markSeen(currentPortalUserId(req));
  res.status(204).send();
});
