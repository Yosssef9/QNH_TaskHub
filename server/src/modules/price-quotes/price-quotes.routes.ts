import { Router, type Router as ExpressRouter } from "express";
import { requireProcurementAccess } from "../../middleware/requireProcurementAccess.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  createPriceQuote,
  deactivatePriceQuote,
  getPriceQuote,
  getPriceQuoteAnalytics,
  getPriceQuoteSummary,
  listPriceQuoteActivity,
  listPriceQuotes,
  reactivatePriceQuote,
  updatePriceQuote,
} from "./price-quotes.controller.js";
import {
  createPriceQuoteBodySchema,
  lifecyclePriceQuoteBodySchema,
  priceQuoteAnalyticsQuerySchema,
  priceQuoteIdParamsSchema,
  priceQuoteListQuerySchema,
  priceQuoteSummaryBodySchema,
  updatePriceQuoteBodySchema,
} from "./price-quotes.schemas.js";

export const priceQuotesRouter: ExpressRouter = Router();
priceQuotesRouter.use(verifyPortalJwt, resolveTaskHubAccess, requireProcurementAccess);

priceQuotesRouter.get("/", validateRequest({ query: priceQuoteListQuerySchema }), listPriceQuotes);
priceQuotesRouter.post("/", validateRequest({ body: createPriceQuoteBodySchema }), createPriceQuote);
priceQuotesRouter.get("/analytics", validateRequest({ query: priceQuoteAnalyticsQuerySchema }), getPriceQuoteAnalytics);
priceQuotesRouter.post("/summary", validateRequest({ body: priceQuoteSummaryBodySchema }), getPriceQuoteSummary);
priceQuotesRouter.get("/:quoteId/activity", validateRequest({ params: priceQuoteIdParamsSchema }), listPriceQuoteActivity);
priceQuotesRouter.post("/:quoteId/deactivate", validateRequest({ params: priceQuoteIdParamsSchema, body: lifecyclePriceQuoteBodySchema }), deactivatePriceQuote);
priceQuotesRouter.post("/:quoteId/reactivate", validateRequest({ params: priceQuoteIdParamsSchema, body: lifecyclePriceQuoteBodySchema }), reactivatePriceQuote);
priceQuotesRouter.get("/:quoteId", validateRequest({ params: priceQuoteIdParamsSchema }), getPriceQuote);
priceQuotesRouter.patch("/:quoteId", validateRequest({ params: priceQuoteIdParamsSchema, body: updatePriceQuoteBodySchema }), updatePriceQuote);
