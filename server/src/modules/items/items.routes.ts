import { Router, type Router as ExpressRouter } from "express";

import {
  requireItemOptionsAccess,
  requireProcurementEntityAccess,
} from "../../middleware/requireAccessPermission.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  createItem,
  getItem,
  getItemAnalytics,
  getItemPriceHistory,
  getItemPriceSummaries,
  getItemSupplierMatrix,
  getItemsOverview,
  listItemActivity,
  listItemOptions,
  listItemSupplierComparison,
  listItemTransactions,
  listItems,
  updateItem,
} from "./items.controller.js";
import {
  createItemBodySchema,
  itemIdParamsSchema,
  itemListQuerySchema,
  itemOptionsQuerySchema,
  itemOverviewQuerySchema,
  itemPriceSummariesQuerySchema,
  itemSupplierMatrixQuerySchema,
  updateItemBodySchema,
} from "./items.schemas.js";
import {
  itemAnalyticsQuerySchema,
  itemPriceHistoryQuerySchema,
  itemSupplierComparisonQuerySchema,
  itemTransactionsQuerySchema,
} from "../procurement-transactions/procurement-transactions.schemas.js";

export const itemsRouter: ExpressRouter = Router();
itemsRouter.use(verifyPortalJwt, resolveTaskHubAccess);
itemsRouter.get(
  "/options",
  requireItemOptionsAccess,
  validateRequest({ query: itemOptionsQuerySchema }),
  listItemOptions,
);
itemsRouter.use(requireProcurementEntityAccess("ITEMS"));
itemsRouter.get("/", validateRequest({ query: itemListQuerySchema }), listItems);
itemsRouter.get("/price-summaries", validateRequest({ query: itemPriceSummariesQuerySchema }), getItemPriceSummaries);
itemsRouter.get("/supplier-matrix", validateRequest({ query: itemSupplierMatrixQuerySchema }), getItemSupplierMatrix);
itemsRouter.get("/overview", validateRequest({ query: itemOverviewQuerySchema }), getItemsOverview);
itemsRouter.post("/", validateRequest({ body: createItemBodySchema }), createItem);
itemsRouter.get(
  "/:itemId/transactions",
  validateRequest({ params: itemIdParamsSchema, query: itemTransactionsQuerySchema }),
  listItemTransactions,
);
itemsRouter.get(
  "/:itemId/suppliers",
  validateRequest({ params: itemIdParamsSchema, query: itemSupplierComparisonQuerySchema }),
  listItemSupplierComparison,
);
itemsRouter.get(
  "/:itemId/price-history",
  validateRequest({ params: itemIdParamsSchema, query: itemPriceHistoryQuerySchema }),
  getItemPriceHistory,
);
itemsRouter.get(
  "/:itemId/analytics",
  validateRequest({ params: itemIdParamsSchema, query: itemAnalyticsQuerySchema }),
  getItemAnalytics,
);
itemsRouter.get("/:itemId/activity", validateRequest({ params: itemIdParamsSchema }), listItemActivity);
itemsRouter.get("/:itemId", validateRequest({ params: itemIdParamsSchema }), getItem);
itemsRouter.patch("/:itemId", validateRequest({ params: itemIdParamsSchema, body: updateItemBodySchema }), updateItem);

