import path from "node:path";

import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { accessPermissionsRepository } from "../access-permissions/access-permissions.repository.js";
import type { AccessPermission, ContractAccessScope } from "../access-permissions/access-permissions.types.js";
import { suppliersRepository } from "../suppliers/suppliers.repository.js";
import {
  readContractAttachment,
  removeStoredContractAttachment,
  storeContractAttachment,
} from "./contract-attachment-storage.js";
import {
  requireContractAttachmentManagement,
  requireContractOwner,
  resolveContractResourceAccess,
} from "./contracts-access.policy.js";
import { mapActivity, mapContract, mapContractAttachment, mapSummary } from "./contracts.mapper.js";
import { contractsRepository } from "./contracts.repository.js";
import type {
  Contract,
  ContractActivity,
  ContractAttachment,
  ContractInput,
  ContractList,
  ContractListQuery,
  ContractScope,
  ContractUserSettings,
  RowVersionInput,
  UpdateContractInput,
} from "./contracts.types.js";

function notFound(entity: "Contract" | "Supplier"): AppError {
  return new AppError({
    statusCode: 404,
    code: `${entity.toUpperCase()}_NOT_FOUND`,
    message: `${entity} was not found.`,
  });
}

function stale(entity: "Contract" | "Contract settings"): AppError {
  return new AppError({
    statusCode: 409,
    code: entity === "Contract" ? "CONTRACT_CHANGED" : "CONTRACT_SETTINGS_CHANGED",
    message: `${entity} changed after it was loaded. Reload the latest version and try again.`,
  });
}

function normalizeContract(input: ContractInput): ContractInput {
  return {
    ...input,
    contractNumber: input.contractNumber?.trim() || null,
    title: input.title.trim(),
    renewalTermMonths: input.isAutoRenewal ? input.renewalTermMonths : null,
    noticePeriodDays: input.isAutoRenewal ? input.noticePeriodDays : null,
    contractValueSar: input.valueType === "FIXED" ? input.contractValueSar : null,
    notes: input.notes?.trim() || null,
  };
}

async function getSettings(ownerUserId: number): Promise<ContractUserSettings> {
  await contractsRepository.ensureContractSettings(ownerUserId);
  const row = await contractsRepository.getContractSettings(ownerUserId);
  if (!row) {
    throw new AppError({
      statusCode: 500,
      code: "CONTRACT_SETTINGS_UNAVAILABLE",
      message: "Contract settings could not be initialized.",
    });
  }
  return {
    expiringSoonDays: row.expiringSoonDays,
    expirationEmailEnabled: row.expirationEmailEnabled,
    expirationReminderLeadDays: row.expirationReminderLeadDays,
    noticeEmailEnabled: row.noticeEmailEnabled,
    noticeReminderLeadDays: row.noticeReminderLeadDays,
    rowVersion: row.rowVersion,
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return left === right || (left === null && right === undefined) || (left === undefined && right === null);
}

function contractChanges(
  current: Contract,
  input: ContractInput,
  nextSupplierName: string,
): Record<string, { from: unknown; to: unknown }> {
  const pairs: Record<string, [unknown, unknown]> = {
    supplierName: [current.supplierName, nextSupplierName],
    contractNumber: [current.contractNumber, input.contractNumber],
    title: [current.title, input.title],
    startDate: [current.startDate, input.startDate],
    endDate: [current.endDate, input.endDate],
    isAutoRenewal: [current.isAutoRenewal, input.isAutoRenewal],
    renewalTermMonths: [current.renewalTermMonths, input.renewalTermMonths],
    noticePeriodDays: [current.noticePeriodDays, input.noticePeriodDays],
    valueType: [current.valueType, input.valueType],
    contractValueSar: [current.contractValueSar, input.contractValueSar],
    paymentFrequency: [current.paymentFrequency, input.paymentFrequency],
    paymentTiming: [current.paymentTiming, input.paymentTiming],
    notes: [current.notes, input.notes],
  };

  return Object.fromEntries(
    Object.entries(pairs)
      .filter(([, [from, to]]) => !valuesEqual(from, to))
      .map(([key, [from, to]]) => [key, { from, to }]),
  );
}

function contractAttachmentNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "CONTRACT_ATTACHMENT_NOT_FOUND",
    message: "Contract file was not found.",
  });
}

function cleanAttachmentName(rawName: string): string {
  const value = Array.from(path.basename(rawName))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, 260);
  if (!value) {
    throw new AppError({
      statusCode: 400,
      code: "CONTRACT_ATTACHMENT_NAME_INVALID",
      message: "Contract file name is invalid.",
    });
  }
  return value;
}

function attachmentMimeType(extension: string): string {
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  return "image/jpeg";
}

function signatureMatches(extension: string, buffer: Buffer): boolean {
  if (extension === ".pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => buffer[index] === value);
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return false;
}

async function scopeContext(
  actorUserId: number,
  permissions: readonly AccessPermission[],
  ownerUserId: number,
): Promise<ContractScope> {
  const owner = await contractsRepository.findContractOwnerIdentity(ownerUserId);
  if (!owner) throw notFound("Contract");
  const access = resolveContractResourceAccess(actorUserId, permissions, ownerUserId);
  return {
    ownerUserId,
    ownerUserName: owner.ownerUserName,
    isOwn: access.isOwner,
    canManageAttachments: access.canManageAttachments,
  };
}

function mapWithScope(
  row: Parameters<typeof mapContract>[0],
  scope: ContractScope,
): Contract {
  return mapContract(row, {
    ownerUserId: scope.ownerUserId,
    ownerUserName: scope.ownerUserName,
    isOwner: scope.isOwn,
    canManageAttachments: scope.canManageAttachments,
  });
}

export const contractsService = {
  async listAccessScopes(actorUserId: number): Promise<ContractAccessScope[]> {
    return accessPermissionsRepository.listContractAccessScopes(actorUserId);
  },

  async listContracts(
    actorUserId: number,
    permissions: readonly AccessPermission[],
    query: ContractListQuery,
  ): Promise<ContractList> {
    const ownerUserId = query.ownerUserId ?? actorUserId;
    const scope = await scopeContext(actorUserId, permissions, ownerUserId);
    const settings = await getSettings(ownerUserId);
    const today = getCurrentDateInAppTimeZone();
    const [page, summary] = await Promise.all([
      contractsRepository.listContracts(ownerUserId, query, today, settings.expiringSoonDays),
      contractsRepository.getContractSummary(ownerUserId, today, settings.expiringSoonDays),
    ]);
    return {
      scope,
      items: page.records.map((row) => mapWithScope(row, scope)),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
      summary: mapSummary(summary),
    };
  },

  async getContract(
    actorUserId: number,
    permissions: readonly AccessPermission[],
    contractId: number,
  ): Promise<Contract> {
    const owner = await contractsRepository.findContractOwner(contractId);
    if (!owner) throw notFound("Contract");
    const scope = await scopeContext(actorUserId, permissions, Number(owner.ownerUserId));
    const settings = await getSettings(scope.ownerUserId);
    const row = await contractsRepository.findOwnedContract(
      scope.ownerUserId,
      contractId,
      getCurrentDateInAppTimeZone(),
      settings.expiringSoonDays,
    );
    if (!row) throw notFound("Contract");
    return mapWithScope(row, scope);
  },

  async createContract(
    actorUserId: number,
    permissions: readonly AccessPermission[],
    rawInput: ContractInput,
  ): Promise<Contract> {
    const input = normalizeContract(rawInput);
    const contractId = await withTransaction(async (transaction) => {
      const supplier = await suppliersRepository.findSupplierIdentity(input.supplierId, transaction);
      if (!supplier) throw notFound("Supplier");
      const id = await contractsRepository.createContract(transaction, actorUserId, input);
      await contractsRepository.addContractActivity(
        transaction,
        actorUserId,
        id,
        "CREATED",
        actorUserId,
        null,
      );
      return id;
    });
    return this.getContract(actorUserId, permissions, contractId);
  },

  async updateContract(
    actorUserId: number,
    permissions: readonly AccessPermission[],
    contractId: number,
    rawInput: UpdateContractInput,
  ): Promise<Contract> {
    const owner = await contractsRepository.findContractOwner(contractId);
    if (!owner) throw notFound("Contract");
    const scope = await scopeContext(actorUserId, permissions, Number(owner.ownerUserId));
    requireContractOwner({ isOwner: scope.isOwn, canManageAttachments: scope.canManageAttachments });

    const input = normalizeContract(rawInput);
    const settings = await getSettings(scope.ownerUserId);
    const today = getCurrentDateInAppTimeZone();
    await withTransaction(async (transaction) => {
      const currentRow = await contractsRepository.findOwnedContractForUpdate(
        transaction,
        scope.ownerUserId,
        contractId,
        today,
        settings.expiringSoonDays,
      );
      if (!currentRow) throw notFound("Contract");
      const current = mapWithScope(currentRow, scope);
      if (current.rowVersion.toUpperCase() !== rawInput.rowVersion.toUpperCase()) throw stale("Contract");
      if (!current.isActive) {
        throw new AppError({
          statusCode: 409,
          code: "ARCHIVED_CONTRACT_READ_ONLY",
          message: "Restore the contract before editing it.",
        });
      }

      const selectedSupplier = await suppliersRepository.findSupplierIdentity(input.supplierId, transaction);
      if (!selectedSupplier) throw notFound("Supplier");
      const changes = contractChanges(current, input, selectedSupplier.name);
      if (Object.keys(changes).length === 0) return;

      const updated = await contractsRepository.updateContract(
        transaction,
        scope.ownerUserId,
        contractId,
        rawInput.rowVersion,
        input,
      );
      if (!updated) throw stale("Contract");
      await contractsRepository.addContractActivity(
        transaction,
        scope.ownerUserId,
        contractId,
        "UPDATED",
        actorUserId,
        changes,
      );
    });

    return this.getContract(actorUserId, permissions, contractId);
  },

  async setContractArchived(
    actorUserId: number,
    permissions: readonly AccessPermission[],
    contractId: number,
    input: RowVersionInput,
    archived: boolean,
  ): Promise<Contract> {
    const owner = await contractsRepository.findContractOwner(contractId);
    if (!owner) throw notFound("Contract");
    const scope = await scopeContext(actorUserId, permissions, Number(owner.ownerUserId));
    requireContractOwner({ isOwner: scope.isOwn, canManageAttachments: scope.canManageAttachments });
    const settings = await getSettings(scope.ownerUserId);

    await withTransaction(async (transaction) => {
      const currentRow = await contractsRepository.findOwnedContractForUpdate(
        transaction,
        scope.ownerUserId,
        contractId,
        getCurrentDateInAppTimeZone(),
        settings.expiringSoonDays,
      );
      if (!currentRow) throw notFound("Contract");
      const current = mapWithScope(currentRow, scope);
      if (current.rowVersion.toUpperCase() !== input.rowVersion.toUpperCase()) throw stale("Contract");
      if (current.isActive === !archived) return;

      const changed = await contractsRepository.setContractActive(
        transaction,
        scope.ownerUserId,
        contractId,
        input.rowVersion,
        !archived,
      );
      if (!changed) throw stale("Contract");
      await contractsRepository.addContractActivity(
        transaction,
        scope.ownerUserId,
        contractId,
        archived ? "ARCHIVED" : "RESTORED",
        actorUserId,
        null,
      );
    });
    return this.getContract(actorUserId, permissions, contractId);
  },

  async listActivity(
    actorUserId: number,
    permissions: readonly AccessPermission[],
    contractId: number,
  ): Promise<ContractActivity[]> {
    const contract = await this.getContract(actorUserId, permissions, contractId);
    const rows = await contractsRepository.listContractActivity(contract.ownerUserId, contractId);
    return rows.map(mapActivity);
  },

  async listAttachments(
    actorUserId: number,
    permissions: readonly AccessPermission[],
    contractId: number,
  ): Promise<ContractAttachment[]> {
    const contract = await this.getContract(actorUserId, permissions, contractId);
    const rows = await contractsRepository.listContractAttachments(contract.ownerUserId, contractId);
    return rows.map(mapContractAttachment);
  },

  async uploadAttachment(
    actorUserId: number,
    permissions: readonly AccessPermission[],
    contractId: number,
    file: Express.Multer.File,
  ): Promise<ContractAttachment> {
    const owner = await contractsRepository.findContractOwner(contractId);
    if (!owner) throw notFound("Contract");
    const scope = await scopeContext(actorUserId, permissions, Number(owner.ownerUserId));
    requireContractAttachmentManagement({
      isOwner: scope.isOwn,
      canManageAttachments: scope.canManageAttachments,
    });

    const originalFileName = cleanAttachmentName(file.originalname);
    const extension = path.extname(originalFileName).toLowerCase();
    if (!['.pdf', '.png', '.jpg', '.jpeg'].includes(extension) || !signatureMatches(extension, file.buffer)) {
      throw new AppError({
        statusCode: 400,
        code: "CONTRACT_ATTACHMENT_CONTENT_INVALID",
        message: "The uploaded file does not match an allowed PDF, JPG, JPEG, or PNG format.",
      });
    }

    const storageKey = await storeContractAttachment(file.buffer, extension);
    try {
      const settings = await getSettings(scope.ownerUserId);
      const created = await withTransaction(async (transaction) => {
        const currentRow = await contractsRepository.findOwnedContractForUpdate(
          transaction,
          scope.ownerUserId,
          contractId,
          getCurrentDateInAppTimeZone(),
          settings.expiringSoonDays,
        );
        if (!currentRow) throw notFound("Contract");
        const current = mapWithScope(currentRow, scope);
        if (!current.isActive) {
          throw new AppError({
            statusCode: 409,
            code: "ARCHIVED_CONTRACT_READ_ONLY",
            message: "Archived Contracts are read-only.",
          });
        }

        const fileCount = await contractsRepository.countActiveContractAttachments(
          transaction,
          scope.ownerUserId,
          contractId,
        );
        if (fileCount >= 10) {
          throw new AppError({
            statusCode: 409,
            code: "CONTRACT_ATTACHMENT_LIMIT_REACHED",
            message: "A Contract can contain up to 10 active files.",
          });
        }

        const record = await contractsRepository.createContractAttachment(transaction, {
          ownerUserId: scope.ownerUserId,
          contractId,
          originalFileName,
          storageKey,
          mimeType: attachmentMimeType(extension),
          fileExtension: extension,
          sizeBytes: file.size,
          uploadedByUserId: actorUserId,
        });
        if (!record) {
          throw new AppError({
            statusCode: 500,
            code: "CONTRACT_ATTACHMENT_CREATE_FAILED",
            message: "Contract file metadata could not be saved.",
          });
        }

        await contractsRepository.addContractActivity(
          transaction,
          scope.ownerUserId,
          contractId,
          "ATTACHMENT_ADDED",
          actorUserId,
          {
            attachmentId: { from: null, to: record.id },
            fileName: { from: null, to: originalFileName },
            sizeBytes: { from: null, to: file.size },
          },
        );
        return record;
      });
      return mapContractAttachment(created);
    } catch (error) {
      await removeStoredContractAttachment(storageKey);
      throw error;
    }
  },

  async readAttachment(
    actorUserId: number,
    permissions: readonly AccessPermission[],
    attachmentId: string,
  ) {
    const owner = await contractsRepository.findContractAttachmentOwner(attachmentId);
    if (!owner) throw contractAttachmentNotFound();
    resolveContractResourceAccess(actorUserId, permissions, owner.ownerUserId);
    const attachment = await contractsRepository.findOwnedContractAttachment(
      owner.ownerUserId,
      attachmentId,
    );
    if (!attachment) throw contractAttachmentNotFound();
    return {
      attachment: mapContractAttachment(attachment),
      buffer: await readContractAttachment(attachment.storageKey),
    };
  },

  async removeAttachment(
    actorUserId: number,
    permissions: readonly AccessPermission[],
    attachmentId: string,
  ): Promise<void> {
    const owner = await contractsRepository.findContractAttachmentOwner(attachmentId);
    if (!owner) throw contractAttachmentNotFound();
    const scope = await scopeContext(actorUserId, permissions, owner.ownerUserId);
    requireContractAttachmentManagement({
      isOwner: scope.isOwn,
      canManageAttachments: scope.canManageAttachments,
    });
    const settings = await getSettings(scope.ownerUserId);

    const removed = await withTransaction(async (transaction) => {
      const attachment = await contractsRepository.findOwnedContractAttachment(
        scope.ownerUserId,
        attachmentId,
        transaction,
      );
      if (!attachment) throw contractAttachmentNotFound();

      const currentRow = await contractsRepository.findOwnedContractForUpdate(
        transaction,
        scope.ownerUserId,
        Number(attachment.contractId),
        getCurrentDateInAppTimeZone(),
        settings.expiringSoonDays,
      );
      if (!currentRow) throw notFound("Contract");
      const contract = mapWithScope(currentRow, scope);
      if (!contract.isActive) {
        throw new AppError({
          statusCode: 409,
          code: "ARCHIVED_CONTRACT_READ_ONLY",
          message: "Archived Contracts are read-only.",
        });
      }

      const changed = await contractsRepository.deactivateContractAttachment(
        transaction,
        scope.ownerUserId,
        attachmentId,
      );
      if (!changed) throw contractAttachmentNotFound();

      await contractsRepository.addContractActivity(
        transaction,
        scope.ownerUserId,
        Number(attachment.contractId),
        "ATTACHMENT_REMOVED",
        actorUserId,
        {
          attachmentId: { from: attachment.id, to: null },
          fileName: { from: attachment.originalFileName, to: null },
          sizeBytes: { from: Number(attachment.sizeBytes), to: null },
        },
      );
      return attachment;
    });

    await removeStoredContractAttachment(removed.storageKey);
  },

  async getSettings(ownerUserId: number): Promise<ContractUserSettings> {
    return getSettings(ownerUserId);
  },

  async updateSettings(
    ownerUserId: number,
    input: ContractUserSettings,
  ): Promise<ContractUserSettings> {
    const updated = await contractsRepository.updateContractSettings(
      ownerUserId,
      input.rowVersion,
      input,
    );
    if (!updated) throw stale("Contract settings");
    return getSettings(ownerUserId);
  },
};
