import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { procurementTransactionsService } from "../procurement-transactions/procurement-transactions.service.js";
import type {
  SupplierItemPriceList,
  SupplierItemPriceListQuery,
  SupplierPriceAnalytics,
  SupplierPriceFilter,
} from "../procurement-transactions/procurement-transactions.types.js";
import { mapSupplier, mapSupplierActivity, mapSupplierOption } from "./suppliers.mapper.js";
import { suppliersRepository } from "./suppliers.repository.js";
import type {
  Supplier,
  SupplierActivity,
  SupplierInput,
  SupplierList,
  SupplierListQuery,
  SupplierOptionList,
  SupplierOptionQuery,
} from "./suppliers.types.js";

function notFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "SUPPLIER_NOT_FOUND",
    message: "Supplier was not found.",
  });
}

function normalize(input: SupplierInput): SupplierInput {
  const clean = (value: string | null): string | null => value?.trim() || null;
  return {
    manualFileNo: clean(input.manualFileNo),
    name: input.name.trim(),
    nameSecondary: clean(input.nameSecondary),
    taxRegistrationNo: clean(input.taxRegistrationNo),
    countryName: clean(input.countryName),
    cityName: clean(input.cityName),
    currency: clean(input.currency),
    contactJobTel: clean(input.contactJobTel),
    extensionNo: clean(input.extensionNo),
    mobileNo: clean(input.mobileNo),
    homePhone: clean(input.homePhone),
    email: clean(input.email),
  };
}

function supplierSnapshot(supplier: Supplier): Record<string, unknown> {
  return {
    code: supplier.code,
    manualFileNo: supplier.manualFileNo,
    name: supplier.name,
    nameSecondary: supplier.nameSecondary,
    taxRegistrationNo: supplier.taxRegistrationNo,
    countryName: supplier.countryName,
    cityName: supplier.cityName,
    currency: supplier.currency,
    contactJobTel: supplier.contactJobTel,
    extensionNo: supplier.extensionNo,
    mobileNo: supplier.mobileNo,
    homePhone: supplier.homePhone,
    email: supplier.email,
    source: supplier.source,
  };
}

function inputSnapshot(input: SupplierInput): Record<string, unknown> {
  return {
    manualFileNo: input.manualFileNo,
    name: input.name,
    nameSecondary: input.nameSecondary,
    taxRegistrationNo: input.taxRegistrationNo,
    countryName: input.countryName,
    cityName: input.cityName,
    currency: input.currency,
    contactJobTel: input.contactJobTel,
    extensionNo: input.extensionNo,
    mobileNo: input.mobileNo,
    homePhone: input.homePhone,
    email: input.email,
  };
}

function changed(current: Supplier, input: SupplierInput): boolean {
  const currentEditable = supplierSnapshot(current);
  const next = inputSnapshot(input);
  return Object.entries(next).some(([key, value]) => currentEditable[key] !== value);
}

export const suppliersService = {
  async listSuppliers(ownerUserId: number, query: SupplierListQuery): Promise<SupplierList> {
    const page = await suppliersRepository.listSuppliers(
      ownerUserId,
      query,
      getCurrentDateInAppTimeZone(),
    );
    return {
      items: page.records.map(mapSupplier),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
    };
  },

  async listOptions(query: SupplierOptionQuery): Promise<SupplierOptionList> {
    const page = await suppliersRepository.listSupplierOptions(query);
    return {
      items: page.records.map(mapSupplierOption),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
    };
  },

  async getSupplier(ownerUserId: number, supplierId: number): Promise<Supplier> {
    const row = await suppliersRepository.findSupplier(
      ownerUserId,
      supplierId,
      getCurrentDateInAppTimeZone(),
    );
    if (!row) throw notFound();
    return mapSupplier(row);
  },

  async createSupplier(actorUserId: number, rawInput: SupplierInput): Promise<Supplier> {
    const input = normalize(rawInput);
    const supplierId = await withTransaction(async (transaction) => {
      const id = await suppliersRepository.createManualSupplier(transaction, input);
      const createdRow = await suppliersRepository.findSupplier(
        actorUserId,
        id,
        getCurrentDateInAppTimeZone(),
        transaction,
      );
      if (!createdRow) {
        throw new AppError({
          statusCode: 500,
          code: "SUPPLIER_CREATE_FAILED",
          message: "The created Supplier could not be loaded.",
        });
      }
      const created = mapSupplier(createdRow);
      await suppliersRepository.addActivity(transaction, {
        supplierId: id,
        actorUserId,
        actionType: "CREATED",
        beforeValues: null,
        afterValues: supplierSnapshot(created),
      });
      return id;
    });
    return this.getSupplier(actorUserId, supplierId);
  },

  async updateSupplier(
    actorUserId: number,
    supplierId: number,
    rawInput: SupplierInput,
  ): Promise<Supplier> {
    const input = normalize(rawInput);
    await withTransaction(async (transaction) => {
      const currentRow = await suppliersRepository.findSupplier(
        actorUserId,
        supplierId,
        getCurrentDateInAppTimeZone(),
        transaction,
      );
      if (!currentRow) throw notFound();
      const current = mapSupplier(currentRow);
      if (!changed(current, input)) return;

      const updated = await suppliersRepository.updateSupplier(transaction, supplierId, input);
      if (!updated) throw notFound();

      const nextRow = await suppliersRepository.findSupplier(
        actorUserId,
        supplierId,
        getCurrentDateInAppTimeZone(),
        transaction,
      );
      if (!nextRow) throw notFound();
      const next = mapSupplier(nextRow);

      await suppliersRepository.addActivity(transaction, {
        supplierId,
        actorUserId,
        actionType: "UPDATED",
        beforeValues: supplierSnapshot(current),
        afterValues: supplierSnapshot(next),
      });
    });
    return this.getSupplier(actorUserId, supplierId);
  },

  async listActivity(ownerUserId: number, supplierId: number): Promise<SupplierActivity[]> {
    await this.getSupplier(ownerUserId, supplierId);
    const records = await suppliersRepository.listActivity(supplierId);
    return records.map(mapSupplierActivity);
  },

  async getPriceAnalytics(
    ownerUserId: number,
    supplierId: number,
    filter: SupplierPriceFilter,
  ): Promise<SupplierPriceAnalytics> {
    await this.getSupplier(ownerUserId, supplierId);
    return procurementTransactionsService.getSupplierPriceAnalytics(supplierId, filter);
  },

  async listItemPrices(
    ownerUserId: number,
    supplierId: number,
    query: SupplierItemPriceListQuery,
  ): Promise<SupplierItemPriceList> {
    await this.getSupplier(ownerUserId, supplierId);
    return procurementTransactionsService.listSupplierItemPriceSummaries(supplierId, query);
  },
};
