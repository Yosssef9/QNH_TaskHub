import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type {
  ContractIdParams,
  ContractListQueryInput,
  ContractSettingsBody,
  CreateContractBody,
  CreateSupplierBody,
  RowVersionBody,
  SupplierIdParams,
  SupplierListQueryInput,
  UpdateContractBody,
  UpdateSupplierBody,
} from "./contracts.schemas.js";
import { contractsService } from "./contracts.service.js";
import type {
  Contract,
  ContractActivity,
  ContractAttachment,
  ContractList,
  ContractUserSettings,
  Supplier,
  SupplierList,
} from "./contracts.types.js";

function ownerId(req: Request): number {
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

export const listContracts: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<ContractListQueryInput>(req, "query");
  const data = await contractsService.listContracts(ownerId(req), query);
  const body: ApiSuccessResponse<ContractList> = { success: true, data };
  res.status(200).json(body);
};

export const getContract: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const data = await contractsService.getContract(ownerId(req), params.contractId);
  const body: ApiSuccessResponse<Contract> = { success: true, data };
  res.status(200).json(body);
};

export const createContract: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateContractBody>(req, "body");
  const data = await contractsService.createContract(ownerId(req), input);
  const body: ApiSuccessResponse<Contract> = { success: true, data };
  res.status(201).json(body);
};

export const updateContract: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const input = getValidatedRequestPart<UpdateContractBody>(req, "body");
  const data = await contractsService.updateContract(ownerId(req), params.contractId, input);
  const body: ApiSuccessResponse<Contract> = { success: true, data };
  res.status(200).json(body);
};

export const archiveContract: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const input = getValidatedRequestPart<RowVersionBody>(req, "body");
  const data = await contractsService.setContractArchived(ownerId(req), params.contractId, input, true);
  const body: ApiSuccessResponse<Contract> = { success: true, data };
  res.status(200).json(body);
};

export const restoreContract: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const input = getValidatedRequestPart<RowVersionBody>(req, "body");
  const data = await contractsService.setContractArchived(ownerId(req), params.contractId, input, false);
  const body: ApiSuccessResponse<Contract> = { success: true, data };
  res.status(200).json(body);
};

export const listContractActivity: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const data = await contractsService.listActivity(ownerId(req), params.contractId);
  const body: ApiSuccessResponse<{ items: ContractActivity[] }> = {
    success: true,
    data: { items: data },
  };
  res.status(200).json(body);
};

function requireContractFile(req: Request): Express.Multer.File {
  if (!req.file) {
    throw new AppError({
      statusCode: 400,
      code: "CONTRACT_ATTACHMENT_REQUIRED",
      message: "Choose a Contract file to upload.",
    });
  }
  return req.file;
}

export const listContractAttachments: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const items = await contractsService.listAttachments(ownerId(req), params.contractId);
  const body: ApiSuccessResponse<{ items: ContractAttachment[] }> = {
    success: true,
    data: { items },
  };
  res.status(200).json(body);
};

export const uploadContractAttachment: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const attachment = await contractsService.uploadAttachment(
    ownerId(req),
    params.contractId,
    requireContractFile(req),
  );
  const body: ApiSuccessResponse<{ attachment: ContractAttachment }> = {
    success: true,
    data: { attachment },
  };
  res.status(201).json(body);
};

export const previewContractAttachment: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<{ attachmentId: string }>(req, "params");
  const { attachment, buffer } = await contractsService.readAttachment(
    ownerId(req),
    params.attachmentId,
  );
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalFileName)}`,
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(buffer);
};

export const downloadContractAttachment: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<{ attachmentId: string }>(req, "params");
  const { attachment, buffer } = await contractsService.readAttachment(
    ownerId(req),
    params.attachmentId,
  );
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalFileName)}`,
  );
  res.status(200).send(buffer);
};

export const removeContractAttachment: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<{ attachmentId: string }>(req, "params");
  await contractsService.removeAttachment(ownerId(req), params.attachmentId);
  res.status(204).send();
};

export const listSuppliers: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<SupplierListQueryInput>(req, "query");
  const data = await contractsService.listSuppliers(ownerId(req), query);
  const body: ApiSuccessResponse<SupplierList> = { success: true, data };
  res.status(200).json(body);
};

export const getSupplier: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<SupplierIdParams>(req, "params");
  const data = await contractsService.getSupplier(ownerId(req), params.supplierId);
  const body: ApiSuccessResponse<Supplier> = { success: true, data };
  res.status(200).json(body);
};

export const createSupplier: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateSupplierBody>(req, "body");
  const data = await contractsService.createSupplier(ownerId(req), input);
  const body: ApiSuccessResponse<Supplier> = { success: true, data };
  res.status(201).json(body);
};

export const updateSupplier: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<SupplierIdParams>(req, "params");
  const input = getValidatedRequestPart<UpdateSupplierBody>(req, "body");
  const data = await contractsService.updateSupplier(ownerId(req), params.supplierId, input);
  const body: ApiSuccessResponse<Supplier> = { success: true, data };
  res.status(200).json(body);
};

export const archiveSupplier: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<SupplierIdParams>(req, "params");
  const input = getValidatedRequestPart<RowVersionBody>(req, "body");
  const data = await contractsService.setSupplierArchived(ownerId(req), params.supplierId, input, true);
  const body: ApiSuccessResponse<Supplier> = { success: true, data };
  res.status(200).json(body);
};

export const restoreSupplier: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<SupplierIdParams>(req, "params");
  const input = getValidatedRequestPart<RowVersionBody>(req, "body");
  const data = await contractsService.setSupplierArchived(ownerId(req), params.supplierId, input, false);
  const body: ApiSuccessResponse<Supplier> = { success: true, data };
  res.status(200).json(body);
};

export const getContractSettings: RequestHandler = async (req, res) => {
  const data = await contractsService.getSettings(ownerId(req));
  const body: ApiSuccessResponse<ContractUserSettings> = { success: true, data };
  res.status(200).json(body);
};

export const updateContractSettings: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<ContractSettingsBody>(req, "body");
  const data = await contractsService.updateSettings(ownerId(req), input);
  const body: ApiSuccessResponse<ContractUserSettings> = { success: true, data };
  res.status(200).json(body);
};
