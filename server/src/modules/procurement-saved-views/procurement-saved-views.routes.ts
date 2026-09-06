import { Router, type Router as ExpressRouter } from "express";
import { validateRequest } from "../../middleware/validate.middleware.js";
import {
  createSavedView,
  deleteSavedView,
  duplicateSavedView,
  getSavedView,
  listSavedViews,
  setDefaultSavedView,
  updateSavedView,
} from "./procurement-saved-views.controller.js";
import {
  createSavedViewBodySchema,
  deleteSavedViewQuerySchema,
  duplicateSavedViewBodySchema,
  savedViewIdParamsSchema,
  updateSavedViewBodySchema,
} from "./procurement-saved-views.schemas.js";

export const procurementSavedViewsRouter: ExpressRouter = Router();
procurementSavedViewsRouter.get("/", listSavedViews);
procurementSavedViewsRouter.post("/", validateRequest({ body: createSavedViewBodySchema }), createSavedView);
procurementSavedViewsRouter.get("/:savedViewId", validateRequest({ params: savedViewIdParamsSchema }), getSavedView);
procurementSavedViewsRouter.patch("/:savedViewId", validateRequest({ params: savedViewIdParamsSchema, body: updateSavedViewBodySchema }), updateSavedView);
procurementSavedViewsRouter.delete("/:savedViewId", validateRequest({ params: savedViewIdParamsSchema, query: deleteSavedViewQuerySchema }), deleteSavedView);
procurementSavedViewsRouter.post("/:savedViewId/duplicate", validateRequest({ params: savedViewIdParamsSchema, body: duplicateSavedViewBodySchema }), duplicateSavedView);
procurementSavedViewsRouter.post("/:savedViewId/default", validateRequest({ params: savedViewIdParamsSchema }), setDefaultSavedView);
