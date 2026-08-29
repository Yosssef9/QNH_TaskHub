import { Router, type Router as ExpressRouter } from "express";

import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  deleteAlternateEmail,
  getEmailSettings,
  requestAlternateEmailVerification,
  resendAlternateEmailVerification,
  sendTestEmail,
  updateEmailSettings,
  verifyAlternateEmail,
} from "./email-settings.controller.js";
import {
  requestAlternateVerificationBodySchema,
  updateEmailSettingsBodySchema,
  verifyAlternateEmailBodySchema,
} from "./email-settings.schemas.js";

export const emailSettingsRouter: ExpressRouter = Router();
emailSettingsRouter.use(verifyPortalJwt, resolveTaskHubAccess);

emailSettingsRouter.get("/", getEmailSettings);
emailSettingsRouter.patch(
  "/",
  validateRequest({ body: updateEmailSettingsBodySchema }),
  updateEmailSettings,
);
emailSettingsRouter.post(
  "/alternate/request-verification",
  validateRequest({ body: requestAlternateVerificationBodySchema }),
  requestAlternateEmailVerification,
);
emailSettingsRouter.post("/alternate/resend-verification", resendAlternateEmailVerification);
emailSettingsRouter.post(
  "/alternate/verify",
  validateRequest({ body: verifyAlternateEmailBodySchema }),
  verifyAlternateEmail,
);
emailSettingsRouter.delete("/alternate", deleteAlternateEmail);
emailSettingsRouter.post("/test", sendTestEmail);
