import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import { notificationsService } from "./notifications.service.js";
import type { NotificationListQuery, NotificationParams } from "./notifications.schemas.js";
import type { NotificationListData } from "./notifications.types.js";

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

export const listNotifications: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<NotificationListQuery>(req, "query");
  const data = await notificationsService.list(owner(req), query.limit);
  const body: ApiSuccessResponse<NotificationListData> = { success: true, data };
  res.json(body);
};

export const markNotificationRead: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<NotificationParams>(req, "params");
  await notificationsService.markRead(owner(req), params.notificationId);
  res.json({ success: true, data: { notificationId: params.notificationId } });
};

export const markAllNotificationsRead: RequestHandler = async (req, res) => {
  const updated = await notificationsService.markAllRead(owner(req));
  res.json({ success: true, data: { updated } });
};
