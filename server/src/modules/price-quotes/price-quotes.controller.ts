import type { Request, RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type {
  CreatePriceQuoteBody,
  LifecyclePriceQuoteBody,
  PriceQuoteAnalyticsQueryInput,
  PriceQuoteIdParams,
  PriceQuoteListQueryInput,
  PriceQuoteSummaryBody,
  UpdatePriceQuoteBody,
} from "./price-quotes.schemas.js";
import { priceQuotesService } from "./price-quotes.service.js";
import type { PriceQuote, PriceQuoteActivity, PriceQuoteAnalytics, PriceQuoteList, PriceQuoteSummary } from "./price-quotes.types.js";

function userId(req: Request): number {
  const value = req.authContext?.user.userId;
  if (!value) throw new AppError({ statusCode: 500, code: "AUTH_CONTEXT_MISSING", message: "Authenticated TaskHub access was not resolved." });
  return value;
}

export const listPriceQuotes: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<PriceQuoteListQueryInput>(req, "query");
  const body: ApiSuccessResponse<PriceQuoteList> = { success: true, data: await priceQuotesService.list(userId(req), query) };
  res.status(200).json(body);
};
export const getPriceQuote: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<PriceQuoteIdParams>(req, "params");
  const body: ApiSuccessResponse<PriceQuote> = { success: true, data: await priceQuotesService.get(userId(req), params.quoteId) };
  res.status(200).json(body);
};
export const createPriceQuote: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreatePriceQuoteBody>(req, "body");
  const body: ApiSuccessResponse<PriceQuote> = { success: true, data: await priceQuotesService.create(userId(req), input) };
  res.status(201).json(body);
};
export const updatePriceQuote: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<PriceQuoteIdParams>(req, "params");
  const input = getValidatedRequestPart<UpdatePriceQuoteBody>(req, "body");
  const { rowVersion, ...quoteInput } = input;
  const body: ApiSuccessResponse<PriceQuote> = { success: true, data: await priceQuotesService.update(userId(req), params.quoteId, quoteInput, rowVersion) };
  res.status(200).json(body);
};
export const deactivatePriceQuote: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<PriceQuoteIdParams>(req, "params");
  const input = getValidatedRequestPart<LifecyclePriceQuoteBody>(req, "body");
  const body: ApiSuccessResponse<PriceQuote> = { success: true, data: await priceQuotesService.setActive(userId(req), params.quoteId, false, input.rowVersion) };
  res.status(200).json(body);
};
export const reactivatePriceQuote: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<PriceQuoteIdParams>(req, "params");
  const input = getValidatedRequestPart<LifecyclePriceQuoteBody>(req, "body");
  const body: ApiSuccessResponse<PriceQuote> = { success: true, data: await priceQuotesService.setActive(userId(req), params.quoteId, true, input.rowVersion) };
  res.status(200).json(body);
};
export const listPriceQuoteActivity: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<PriceQuoteIdParams>(req, "params");
  const data = { items: await priceQuotesService.activity(userId(req), params.quoteId) };
  const body: ApiSuccessResponse<{ items: PriceQuoteActivity[] }> = { success: true, data };
  res.status(200).json(body);
};
export const getPriceQuoteAnalytics: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<PriceQuoteAnalyticsQueryInput>(req, "query");
  const body: ApiSuccessResponse<PriceQuoteAnalytics> = { success: true, data: await priceQuotesService.analytics(userId(req), query) };
  res.status(200).json(body);
};
export const getPriceQuoteSummary: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<PriceQuoteSummaryBody>(req, "body");
  const body: ApiSuccessResponse<PriceQuoteSummary> = { success: true, data: await priceQuotesService.summary(userId(req), input) };
  res.status(200).json(body);
};
