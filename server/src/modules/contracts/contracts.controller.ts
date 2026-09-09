import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type { AccessPermission, ContractAccessScope } from "../access-permissions/access-permissions.types.js";
import type {
  ContractIdParams,
  ContractListQueryInput,
  ContractSettingsBody,
  CreateContractBody,
  RowVersionBody,
  UpdateContractBody,
} from "./contracts.schemas.js";
import { contractsService } from "./contracts.service.js";
import type {
  Contract,
  ContractActivity,
  ContractAttachment,
  ContractList,
  ContractUserSettings,
} from "./contracts.types.js";

function auth(req: Request): { userId: number; permissions: AccessPermission[] } {
  const value = req.authContext;
  if (!value) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return { userId: value.user.userId, permissions: value.access.permissions };
}

export const listContractAccessScopes: RequestHandler = async (req, res) => {
  const current = auth(req);
  const items = await contractsService.listAccessScopes(current.userId);
  const body: ApiSuccessResponse<{ items: ContractAccessScope[] }> = {
    success: true,
    data: { items },
  };
  res.status(200).json(body);
};

export const listContracts: RequestHandler = async (req, res) => {
  const current = auth(req);
  const query = getValidatedRequestPart<ContractListQueryInput>(req, "query");
  const data = await contractsService.listContracts(current.userId, current.permissions, query);
  const body: ApiSuccessResponse<ContractList> = { success: true, data };
  res.status(200).json(body);
};

export const getContract: RequestHandler = async (req, res) => {
  const current = auth(req);
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const data = await contractsService.getContract(current.userId, current.permissions, params.contractId);
  const body: ApiSuccessResponse<Contract> = { success: true, data };
  res.status(200).json(body);
};

export const createContract: RequestHandler = async (req, res) => {
  const current = auth(req);
  const input = getValidatedRequestPart<CreateContractBody>(req, "body");
  const data = await contractsService.createContract(current.userId, current.permissions, input);
  const body: ApiSuccessResponse<Contract> = { success: true, data };
  res.status(201).json(body);
};

export const updateContract: RequestHandler = async (req, res) => {
  const current = auth(req);
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const input = getValidatedRequestPart<UpdateContractBody>(req, "body");
  const data = await contractsService.updateContract(
    current.userId,
    current.permissions,
    params.contractId,
    input,
  );
  const body: ApiSuccessResponse<Contract> = { success: true, data };
  res.status(200).json(body);
};

export const archiveContract: RequestHandler = async (req, res) => {
  const current = auth(req);
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const input = getValidatedRequestPart<RowVersionBody>(req, "body");
  const data = await contractsService.setContractArchived(
    current.userId,
    current.permissions,
    params.contractId,
    input,
    true,
  );
  const body: ApiSuccessResponse<Contract> = { success: true, data };
  res.status(200).json(body);
};

export const restoreContract: RequestHandler = async (req, res) => {
  const current = auth(req);
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const input = getValidatedRequestPart<RowVersionBody>(req, "body");
  const data = await contractsService.setContractArchived(
    current.userId,
    current.permissions,
    params.contractId,
    input,
    false,
  );
  const body: ApiSuccessResponse<Contract> = { success: true, data };
  res.status(200).json(body);
};

export const listContractActivity: RequestHandler = async (req, res) => {
  const current = auth(req);
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const data = await contractsService.listActivity(current.userId, current.permissions, params.contractId);
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
  const current = auth(req);
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const items = await contractsService.listAttachments(current.userId, current.permissions, params.contractId);
  const body: ApiSuccessResponse<{ items: ContractAttachment[] }> = {
    success: true,
    data: { items },
  };
  res.status(200).json(body);
};

export const uploadContractAttachment: RequestHandler = async (req, res) => {
  const current = auth(req);
  const params = getValidatedRequestPart<ContractIdParams>(req, "params");
  const attachment = await contractsService.uploadAttachment(
    current.userId,
    current.permissions,
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
  const current = auth(req);
  const params = getValidatedRequestPart<{ attachmentId: string }>(req, "params");
  const { attachment, buffer } = await contractsService.readAttachment(
    current.userId,
    current.permissions,
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
  const current = auth(req);
  const params = getValidatedRequestPart<{ attachmentId: string }>(req, "params");
  const { attachment, buffer } = await contractsService.readAttachment(
    current.userId,
    current.permissions,
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
  const current = auth(req);
  const params = getValidatedRequestPart<{ attachmentId: string }>(req, "params");
  await contractsService.removeAttachment(current.userId, current.permissions, params.attachmentId);
  res.status(204).send();
};

export const getContractSettings: RequestHandler = async (req, res) => {
  const current = auth(req);
  const data = await contractsService.getSettings(current.userId);
  const body: ApiSuccessResponse<ContractUserSettings> = { success: true, data };
  res.status(200).json(body);
};

export const updateContractSettings: RequestHandler = async (req, res) => {
  const current = auth(req);
  const input = getValidatedRequestPart<ContractSettingsBody>(req, "body");
  const data = await contractsService.updateSettings(current.userId, input);
  const body: ApiSuccessResponse<ContractUserSettings> = { success: true, data };
  res.status(200).json(body);
};
