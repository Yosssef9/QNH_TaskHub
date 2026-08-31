import path from "node:path";

import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import {
  mapActivity,
  mapContract,
  mapContractAttachment,
  mapSupplier,
  mapSummary,
} from "./contracts.mapper.js";
import {
  readContractAttachment,
  removeStoredContractAttachment,
  storeContractAttachment,
} from "./contract-attachment-storage.js";
import { contractsRepository } from "./contracts.repository.js";
import type {
  Contract,
  ContractActivity,
  ContractAttachment,
  ContractInput,
  ContractList,
  ContractListQuery,
  ContractUserSettings,
  RowVersionInput,
  Supplier,
  SupplierInput,
  SupplierList,
  SupplierListQuery,
  UpdateContractInput,
  UpdateSupplierInput,
} from "./contracts.types.js";

function notFound(entity: "Contract" | "Supplier"): AppError {
  return new AppError({
    statusCode: 404,
    code: `${entity.toUpperCase()}_NOT_FOUND`,
    message: `${entity} was not found.`,
  });
}

function stale(entity: "Contract" | "Supplier" | "Contract settings"): AppError {
  return new AppError({
    statusCode: 409,
    code: entity === "Contract" ? "CONTRACT_CHANGED" : entity === "Supplier" ? "SUPPLIER_CHANGED" : "CONTRACT_SETTINGS_CHANGED",
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

function normalizeSupplier(input: SupplierInput): SupplierInput {
  const clean = (value: string | null): string | null => value?.trim() || null;
  return {
    name: input.name.trim(),
    commercialRegistrationNo: clean(input.commercialRegistrationNo),
    taxNumber: clean(input.taxNumber),
    primaryContactName: clean(input.primaryContactName),
    primaryContactEmail: clean(input.primaryContactEmail),
    primaryContactPhone: clean(input.primaryContactPhone),
    addressText: clean(input.addressText),
    notes: clean(input.notes),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("number" in error)) return false;
  const number = (error as { number?: unknown }).number;
  return number === 2601 || number === 2627;
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

export const contractsService = {
  async listContracts(ownerUserId: number, query: ContractListQuery): Promise<ContractList> {
    const settings = await getSettings(ownerUserId);
    const today = getCurrentDateInAppTimeZone();
    const [page, summary] = await Promise.all([
      contractsRepository.listContracts(ownerUserId, query, today, settings.expiringSoonDays),
      contractsRepository.getContractSummary(ownerUserId, today, settings.expiringSoonDays),
    ]);
    return {
      items: page.records.map(mapContract),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
      summary: mapSummary(summary),
    };
  },

  async getContract(ownerUserId: number, contractId: number): Promise<Contract> {
    const settings = await getSettings(ownerUserId);
    const row = await contractsRepository.findOwnedContract(
      ownerUserId,
      contractId,
      getCurrentDateInAppTimeZone(),
      settings.expiringSoonDays,
    );
    if (!row) throw notFound("Contract");
    return mapContract(row);
  },

  async createContract(ownerUserId: number, rawInput: ContractInput): Promise<Contract> {
    const input = normalizeContract(rawInput);
    const contractId = await withTransaction(async (transaction) => {
      const supplier = await contractsRepository.findOwnedSupplierForUpdate(
        transaction,
        ownerUserId,
        input.supplierId,
      );
      if (!supplier || !supplier.isActive) {
        throw new AppError({
          statusCode: 409,
          code: "ACTIVE_SUPPLIER_REQUIRED",
          message: "Choose an active supplier before creating the contract.",
        });
      }
      const id = await contractsRepository.createContract(transaction, ownerUserId, input);
      await contractsRepository.addContractActivity(transaction, ownerUserId, id, "CREATED", null);
      return id;
    });
    return this.getContract(ownerUserId, contractId);
  },

  async updateContract(
    ownerUserId: number,
    contractId: number,
    rawInput: UpdateContractInput,
  ): Promise<Contract> {
    const input = normalizeContract(rawInput);
    const settings = await getSettings(ownerUserId);
    const today = getCurrentDateInAppTimeZone();

    await withTransaction(async (transaction) => {
      const currentRow = await contractsRepository.findOwnedContractForUpdate(
        transaction,
        ownerUserId,
        contractId,
        today,
        settings.expiringSoonDays,
      );
      if (!currentRow) throw notFound("Contract");
      const current = mapContract(currentRow);
      if (current.rowVersion.toUpperCase() !== rawInput.rowVersion.toUpperCase()) {
        throw stale("Contract");
      }
      if (!current.isActive) {
        throw new AppError({
          statusCode: 409,
          code: "ARCHIVED_CONTRACT_READ_ONLY",
          message: "Restore the contract before editing it.",
        });
      }

      const selectedSupplier = await contractsRepository.findOwnedSupplierForUpdate(
        transaction,
        ownerUserId,
        input.supplierId,
      );
      if (!selectedSupplier) throw notFound("Supplier");
      if (input.supplierId !== current.supplierId && !selectedSupplier.isActive) {
        throw new AppError({
          statusCode: 409,
          code: "ACTIVE_SUPPLIER_REQUIRED",
          message: "Archived suppliers cannot be newly assigned to a contract.",
        });
      }

      const changes = contractChanges(current, input, selectedSupplier.name);
      if (Object.keys(changes).length === 0) return;

      const updated = await contractsRepository.updateContract(
        transaction,
        ownerUserId,
        contractId,
        rawInput.rowVersion,
        input,
      );
      if (!updated) throw stale("Contract");
      await contractsRepository.addContractActivity(
        transaction,
        ownerUserId,
        contractId,
        "UPDATED",
        changes,
      );
    });

    return this.getContract(ownerUserId, contractId);
  },

  async setContractArchived(
    ownerUserId: number,
    contractId: number,
    input: RowVersionInput,
    archived: boolean,
  ): Promise<Contract> {
    const settings = await getSettings(ownerUserId);
    await withTransaction(async (transaction) => {
      const currentRow = await contractsRepository.findOwnedContractForUpdate(
        transaction,
        ownerUserId,
        contractId,
        getCurrentDateInAppTimeZone(),
        settings.expiringSoonDays,
      );
      if (!currentRow) throw notFound("Contract");
      const current = mapContract(currentRow);
      if (current.rowVersion.toUpperCase() !== input.rowVersion.toUpperCase()) throw stale("Contract");
      if (current.isActive === !archived) return;

      const changed = await contractsRepository.setContractActive(
        transaction,
        ownerUserId,
        contractId,
        input.rowVersion,
        !archived,
      );
      if (!changed) throw stale("Contract");
      await contractsRepository.addContractActivity(
        transaction,
        ownerUserId,
        contractId,
        archived ? "ARCHIVED" : "RESTORED",
        null,
      );
    });
    return this.getContract(ownerUserId, contractId);
  },

  async listActivity(ownerUserId: number, contractId: number): Promise<ContractActivity[]> {
    await this.getContract(ownerUserId, contractId);
    const rows = await contractsRepository.listContractActivity(ownerUserId, contractId);
    return rows.map(mapActivity);
  },

  async listAttachments(ownerUserId: number, contractId: number): Promise<ContractAttachment[]> {
    await this.getContract(ownerUserId, contractId);
    const rows = await contractsRepository.listContractAttachments(ownerUserId, contractId);
    return rows.map(mapContractAttachment);
  },

  async uploadAttachment(
    ownerUserId: number,
    contractId: number,
    file: Express.Multer.File,
  ): Promise<ContractAttachment> {
    const originalFileName = cleanAttachmentName(file.originalname);
    const extension = path.extname(originalFileName).toLowerCase();
    if (![".pdf", ".png", ".jpg", ".jpeg"].includes(extension) || !signatureMatches(extension, file.buffer)) {
      throw new AppError({
        statusCode: 400,
        code: "CONTRACT_ATTACHMENT_CONTENT_INVALID",
        message: "The uploaded file does not match an allowed PDF, JPG, JPEG, or PNG format.",
      });
    }

    const storageKey = await storeContractAttachment(file.buffer, extension);
    try {
      const settings = await getSettings(ownerUserId);
      const created = await withTransaction(async (transaction) => {
        const currentRow = await contractsRepository.findOwnedContractForUpdate(
          transaction,
          ownerUserId,
          contractId,
          getCurrentDateInAppTimeZone(),
          settings.expiringSoonDays,
        );
        if (!currentRow) throw notFound("Contract");
        const current = mapContract(currentRow);
        if (!current.isActive) {
          throw new AppError({
            statusCode: 409,
            code: "ARCHIVED_CONTRACT_READ_ONLY",
            message: "Restore the contract before adding files.",
          });
        }

        const fileCount = await contractsRepository.countActiveContractAttachments(
          transaction,
          ownerUserId,
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
          ownerUserId,
          contractId,
          originalFileName,
          storageKey,
          mimeType: attachmentMimeType(extension),
          fileExtension: extension,
          sizeBytes: file.size,
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
          ownerUserId,
          contractId,
          "ATTACHMENT_ADDED",
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

  async readAttachment(ownerUserId: number, attachmentId: string) {
    const attachment = await contractsRepository.findOwnedContractAttachment(
      ownerUserId,
      attachmentId,
    );
    if (!attachment) throw contractAttachmentNotFound();
    return {
      attachment: mapContractAttachment(attachment),
      buffer: await readContractAttachment(attachment.storageKey),
    };
  },

  async removeAttachment(ownerUserId: number, attachmentId: string): Promise<void> {
    const settings = await getSettings(ownerUserId);
    const removed = await withTransaction(async (transaction) => {
      const attachment = await contractsRepository.findOwnedContractAttachment(
        ownerUserId,
        attachmentId,
        transaction,
      );
      if (!attachment) throw contractAttachmentNotFound();

      const currentRow = await contractsRepository.findOwnedContractForUpdate(
        transaction,
        ownerUserId,
        Number(attachment.contractId),
        getCurrentDateInAppTimeZone(),
        settings.expiringSoonDays,
      );
      if (!currentRow) throw notFound("Contract");
      const contract = mapContract(currentRow);
      if (!contract.isActive) {
        throw new AppError({
          statusCode: 409,
          code: "ARCHIVED_CONTRACT_READ_ONLY",
          message: "Restore the contract before removing files.",
        });
      }

      const changed = await contractsRepository.deactivateContractAttachment(
        transaction,
        ownerUserId,
        attachmentId,
      );
      if (!changed) throw contractAttachmentNotFound();

      await contractsRepository.addContractActivity(
        transaction,
        ownerUserId,
        Number(attachment.contractId),
        "ATTACHMENT_REMOVED",
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

  async listSuppliers(ownerUserId: number, query: SupplierListQuery): Promise<SupplierList> {
    const settings = await getSettings(ownerUserId);
    const page = await contractsRepository.listSuppliers(
      ownerUserId,
      query,
      getCurrentDateInAppTimeZone(),
      settings.expiringSoonDays,
    );
    return {
      items: page.records.map(mapSupplier),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
    };
  },

  async getSupplier(ownerUserId: number, supplierId: number): Promise<Supplier> {
    const settings = await getSettings(ownerUserId);
    const row = await contractsRepository.findOwnedSupplier(
      ownerUserId,
      supplierId,
      getCurrentDateInAppTimeZone(),
      settings.expiringSoonDays,
    );
    if (!row) throw notFound("Supplier");
    return mapSupplier(row);
  },

  async createSupplier(ownerUserId: number, rawInput: SupplierInput): Promise<Supplier> {
    const input = normalizeSupplier(rawInput);
    let supplierId: number;
    try {
      supplierId = await withTransaction(async (transaction) => {
        if (await contractsRepository.supplierNameExists(ownerUserId, input.name, undefined, transaction)) {
          throw new AppError({
            statusCode: 409,
            code: "SUPPLIER_NAME_EXISTS",
            message: "An active supplier with this name already exists.",
          });
        }
        return contractsRepository.createSupplier(transaction, ownerUserId, input);
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError({
          statusCode: 409,
          code: "SUPPLIER_NAME_EXISTS",
          message: "An active supplier with this name already exists.",
        });
      }
      throw error;
    }
    return this.getSupplier(ownerUserId, supplierId);
  },

  async updateSupplier(
    ownerUserId: number,
    supplierId: number,
    rawInput: UpdateSupplierInput,
  ): Promise<Supplier> {
    const input = normalizeSupplier(rawInput);
    try {
      await withTransaction(async (transaction) => {
        const current = await contractsRepository.findOwnedSupplierForUpdate(
          transaction,
          ownerUserId,
          supplierId,
        );
        if (!current) throw notFound("Supplier");
        if (current.rowVersion.toUpperCase() !== rawInput.rowVersion.toUpperCase()) {
          throw stale("Supplier");
        }
        if (
          await contractsRepository.supplierNameExists(
            ownerUserId,
            input.name,
            supplierId,
            transaction,
          )
        ) {
          throw new AppError({
            statusCode: 409,
            code: "SUPPLIER_NAME_EXISTS",
            message: "An active supplier with this name already exists.",
          });
        }
        const updated = await contractsRepository.updateSupplier(
          transaction,
          ownerUserId,
          supplierId,
          rawInput.rowVersion,
          input,
        );
        if (!updated) throw stale("Supplier");
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError({
          statusCode: 409,
          code: "SUPPLIER_NAME_EXISTS",
          message: "An active supplier with this name already exists.",
        });
      }
      throw error;
    }
    return this.getSupplier(ownerUserId, supplierId);
  },

  async setSupplierArchived(
    ownerUserId: number,
    supplierId: number,
    input: RowVersionInput,
    archived: boolean,
  ): Promise<Supplier> {
    try {
      await withTransaction(async (transaction) => {
        const current = await contractsRepository.findOwnedSupplierForUpdate(
          transaction,
          ownerUserId,
          supplierId,
        );
        if (!current) throw notFound("Supplier");
        if (current.rowVersion.toUpperCase() !== input.rowVersion.toUpperCase()) throw stale("Supplier");
        if (current.isActive === !archived) return;

        if (!archived) {
          const duplicate = await contractsRepository.supplierNameExists(
            ownerUserId,
            current.name,
            supplierId,
            transaction,
          );
          if (duplicate) {
            throw new AppError({
              statusCode: 409,
              code: "SUPPLIER_NAME_EXISTS",
              message: "Another active supplier already uses this name.",
            });
          }
        }

        const changed = await contractsRepository.setSupplierActive(
          transaction,
          ownerUserId,
          supplierId,
          input.rowVersion,
          !archived,
        );
        if (!changed) throw stale("Supplier");
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError({
          statusCode: 409,
          code: "SUPPLIER_NAME_EXISTS",
          message: "Another active supplier already uses this name.",
        });
      }
      throw error;
    }
    return this.getSupplier(ownerUserId, supplierId);
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

