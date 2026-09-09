import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { hasAccessPermission } from "../access-permissions/access-permissions.policy.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type {
  SupplierAnalyticsQueryInput,
  SupplierItemsQueryInput,
} from "../procurement-transactions/procurement-transactions.schemas.js";
import type {
  SupplierItemPriceList,
  SupplierPriceAnalytics,
} from "../procurement-transactions/procurement-transactions.types.js";
import type {
  CreateSupplierBody,
  SupplierIdParams,
  SupplierListQueryInput,
  SupplierOptionsQueryInput,
  UpdateSupplierBody,
} from "./suppliers.schemas.js";
import { suppliersService } from "./suppliers.service.js";
import type { Supplier, SupplierActivity, SupplierList, SupplierOptionList } from "./suppliers.types.js";

function userId(req: Request): number {
  const value = req.authContext?.user.userId;
  if (!value) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return value;
}

function canAccessContracts(req: Request): boolean {
  const access = req.authContext?.access;
  if (!access) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return hasAccessPermission(access.permissions, "CONTRACTS", "ACCESS");
}

export const listSuppliers: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<SupplierListQueryInput>(req, "query");
  const data = await suppliersService.listSuppliers(userId(req), query, canAccessContracts(req));
  const body: ApiSuccessResponse<SupplierList> = { success: true, data };
  res.status(200).json(body);
};

export const listSupplierOptions: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<SupplierOptionsQueryInput>(req, "query");
  const data = await suppliersService.listOptions(query);
  const body: ApiSuccessResponse<SupplierOptionList> = { success: true, data };
  res.status(200).json(body);
};

export const getSupplier: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<SupplierIdParams>(req, "params");
  const data = await suppliersService.getSupplier(userId(req), params.supplierId, canAccessContracts(req));
  const body: ApiSuccessResponse<Supplier> = { success: true, data };
  res.status(200).json(body);
};

export const createSupplier: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateSupplierBody>(req, "body");
  const data = await suppliersService.createSupplier(userId(req), input, canAccessContracts(req));
  const body: ApiSuccessResponse<Supplier> = { success: true, data };
  res.status(201).json(body);
};

export const updateSupplier: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<SupplierIdParams>(req, "params");
  const input = getValidatedRequestPart<UpdateSupplierBody>(req, "body");
  const data = await suppliersService.updateSupplier(
    userId(req),
    params.supplierId,
    input,
    canAccessContracts(req),
  );
  const body: ApiSuccessResponse<Supplier> = { success: true, data };
  res.status(200).json(body);
};

export const listSupplierActivity: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<SupplierIdParams>(req, "params");
  const items = await suppliersService.listActivity(userId(req), params.supplierId);
  const body: ApiSuccessResponse<{ items: SupplierActivity[] }> = {
    success: true,
    data: { items },
  };
  res.status(200).json(body);
};


export const getSupplierAnalytics: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<SupplierIdParams>(req, "params");
  const query = getValidatedRequestPart<SupplierAnalyticsQueryInput>(req, "query");
  const data = await suppliersService.getPriceAnalytics(userId(req), params.supplierId, query);
  const body: ApiSuccessResponse<SupplierPriceAnalytics> = { success: true, data };
  res.status(200).json(body);
};

export const listSupplierItems: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<SupplierIdParams>(req, "params");
  const query = getValidatedRequestPart<SupplierItemsQueryInput>(req, "query");
  const data = await suppliersService.listItemPrices(userId(req), params.supplierId, query);
  const body: ApiSuccessResponse<SupplierItemPriceList> = { success: true, data };
  res.status(200).json(body);
};
