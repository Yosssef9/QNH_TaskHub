import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import { emailSettingsService } from "./email-settings.service.js";
import type {
  RequestAlternateVerificationBody,
  UpdateEmailSettingsBody,
  VerifyAlternateEmailBody,
} from "./email-settings.schemas.js";
import type { EmailSettingsData, PendingEmailVerification } from "./email-settings.types.js";

function owner(req: Request): number {
  const userId = req.authContext?.user.userId;
  if (!userId) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated access was not resolved.",
    });
  }
  return userId;
}

function emailLanguage(req: Request): "ar" | "en" {
  return req.authContext?.preferences.languageCode === "EN" ? "en" : "ar";
}

export const getEmailSettings: RequestHandler = async (req, res) => {
  const data = await emailSettingsService.get(owner(req));
  const body: ApiSuccessResponse<EmailSettingsData> = { success: true, data };
  res.json(body);
};

export const updateEmailSettings: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<UpdateEmailSettingsBody>(req, "body");
  const data = await emailSettingsService.update(owner(req), input);
  const body: ApiSuccessResponse<EmailSettingsData> = { success: true, data };
  res.json(body);
};

export const requestAlternateEmailVerification: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<RequestAlternateVerificationBody>(req, "body");
  const verification = await emailSettingsService.requestVerification(
    owner(req),
    input.email,
    emailLanguage(req),
  );
  const body: ApiSuccessResponse<{ verification: PendingEmailVerification }> = {
    success: true,
    data: { verification },
  };
  res.status(202).json(body);
};

export const resendAlternateEmailVerification: RequestHandler = async (req, res) => {
  const verification = await emailSettingsService.resendVerification(owner(req), emailLanguage(req));
  const body: ApiSuccessResponse<{ verification: PendingEmailVerification }> = {
    success: true,
    data: { verification },
  };
  res.status(202).json(body);
};

export const verifyAlternateEmail: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<VerifyAlternateEmailBody>(req, "body");
  const data = await emailSettingsService.verifyAlternate(owner(req), input.code);
  const body: ApiSuccessResponse<EmailSettingsData> = { success: true, data };
  res.json(body);
};

export const deleteAlternateEmail: RequestHandler = async (req, res) => {
  const data = await emailSettingsService.deleteAlternate(owner(req));
  const body: ApiSuccessResponse<EmailSettingsData> = { success: true, data };
  res.json(body);
};

export const sendTestEmail: RequestHandler = async (req, res) => {
  const result = await emailSettingsService.sendTest(owner(req), emailLanguage(req));
  res.json({ success: true, data: result });
};
