import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type {
  CreateItemBody,
  ItemIdParams,
  ItemListQueryInput,
  ItemOptionsQueryInput,
  ItemOverviewQueryInput,
  ItemPriceSummariesQueryInput,
  ItemSupplierMatrixQueryInput,
  UpdateItemBody,
} from "./items.schemas.js";
import type {
  ItemAnalyticsQueryInput,
  ItemPriceHistoryQueryInput,
  ItemSupplierComparisonQueryInput,
  ItemTransactionsQueryInput,
} from "../procurement-transactions/procurement-transactions.schemas.js";
import type {
  ItemPriceAnalytics,
  ItemPriceHistory,
  ItemSupplierPriceList,
  ItemTransactionList,
} from "../procurement-transactions/procurement-transactions.types.js";
import { itemsService } from "./items.service.js";
import type {
  Item,
  ItemActivity,
  ItemList,
  ItemOptionList,
  ItemPriceSummaryBatch,
  ItemSupplierMatrixBatch,
  ItemsOverview,
} from "./items.types.js";

function userId(req: Request): number {
  const value = req.authContext?.user.userId;
  if (!value) throw new AppError({ statusCode: 500, code: "AUTH_CONTEXT_MISSING", message: "Authenticated TaskHub access was not resolved." });
  return value;
}

export const listItems: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<ItemListQueryInput>(req, "query");
  const data = await itemsService.listItems(query);
  const body: ApiSuccessResponse<ItemList> = { success: true, data };
  res.status(200).json(body);
};

export const listItemOptions: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<ItemOptionsQueryInput>(req, "query");
  const data = await itemsService.listOptions(query);
  const body: ApiSuccessResponse<ItemOptionList> = { success: true, data };
  res.status(200).json(body);
};

export const getItemPriceSummaries: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<ItemPriceSummariesQueryInput>(req, "query");
  const data = await itemsService.getPriceSummaries(query);
  const body: ApiSuccessResponse<ItemPriceSummaryBatch> = { success: true, data };
  res.status(200).json(body);
};

export const getItemSupplierMatrix: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<ItemSupplierMatrixQueryInput>(req, "query");
  const data = await itemsService.getSupplierMatrix(userId(req), query);
  const body: ApiSuccessResponse<ItemSupplierMatrixBatch> = { success: true, data };
  res.status(200).json(body);
};

export const getItemsOverview: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<ItemOverviewQueryInput>(req, "query");
  const data = await itemsService.getOverview(query);
  const body: ApiSuccessResponse<ItemsOverview> = { success: true, data };
  res.status(200).json(body);
};

export const getItem: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ItemIdParams>(req, "params");
  const data = await itemsService.getItem(params.itemId);
  const body: ApiSuccessResponse<Item> = { success: true, data };
  res.status(200).json(body);
};

export const createItem: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateItemBody>(req, "body");
  const data = await itemsService.createItem(userId(req), input);
  const body: ApiSuccessResponse<Item> = { success: true, data };
  res.status(201).json(body);
};

export const updateItem: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ItemIdParams>(req, "params");
  const input = getValidatedRequestPart<UpdateItemBody>(req, "body");
  const data = await itemsService.updateItem(userId(req), params.itemId, input);
  const body: ApiSuccessResponse<Item> = { success: true, data };
  res.status(200).json(body);
};

export const listItemActivity: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ItemIdParams>(req, "params");
  const items = await itemsService.listActivity(params.itemId);
  const body: ApiSuccessResponse<{ items: ItemActivity[] }> = { success: true, data: { items } };
  res.status(200).json(body);
};

export const listItemTransactions: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ItemIdParams>(req, "params");
  const query = getValidatedRequestPart<ItemTransactionsQueryInput>(req, "query");
  const data = await itemsService.listTransactions(params.itemId, query);
  const body: ApiSuccessResponse<ItemTransactionList> = { success: true, data };
  res.status(200).json(body);
};

export const getItemPriceHistory: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ItemIdParams>(req, "params");
  const query = getValidatedRequestPart<ItemPriceHistoryQueryInput>(req, "query");
  const data = await itemsService.listPriceHistory(params.itemId, query);
  const body: ApiSuccessResponse<ItemPriceHistory> = { success: true, data };
  res.status(200).json(body);
};

export const getItemAnalytics: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ItemIdParams>(req, "params");
  const query = getValidatedRequestPart<ItemAnalyticsQueryInput>(req, "query");
  const data = await itemsService.getAnalytics(params.itemId, query);
  const body: ApiSuccessResponse<ItemPriceAnalytics> = { success: true, data };
  res.status(200).json(body);
};

export const listItemSupplierComparison: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ItemIdParams>(req, "params");
  const query = getValidatedRequestPart<ItemSupplierComparisonQueryInput>(req, "query");
  const data = await itemsService.listSupplierComparison(params.itemId, query);
  const body: ApiSuccessResponse<ItemSupplierPriceList> = { success: true, data };
  res.status(200).json(body);
};

