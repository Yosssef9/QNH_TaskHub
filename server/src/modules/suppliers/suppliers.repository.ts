import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { PROCUREMENT_DB_OBJECTS } from "../procurement/procurement.config.js";
import type { SupplierInput, SupplierListQuery, SupplierOptionQuery } from "./suppliers.types.js";

const suppliersTable = PROCUREMENT_DB_OBJECTS.suppliersTable;
const transactionsTable = PROCUREMENT_DB_OBJECTS.transactionsTable;

export interface SupplierRecord {
  id: number | string;
  code: string;
  manualFileNo: string | null;
  name: string;
  nameSecondary: string | null;
  taxRegistrationNo: string | null;
  countryName: string | null;
  cityName: string | null;
  currency: string | null;
  contactJobTel: string | null;
  extensionNo: string | null;
  mobileNo: string | null;
  homePhone: string | null;
  email: string | null;
  source: string;
  currentContractCount: number | string;
  expiringSoonContractCount: number | string;
  purchasedItemCount: number | string;
  transactionCount: number | string;
  lastPurchaseDate: Date | null;
}

export interface SupplierActivityRecord {
  id: number | string;
  actionType: string;
  actorUserId: number;
  actorName: string;
  beforeValues: string | null;
  afterValues: string | null;
  createdAtUtc: Date;
}

interface CountRecord {
  total: number | string;
}

interface IdRecord {
  id: number | string;
}

export interface SupplierIdentityRecord {
  id: number | string;
  name: string;
  code: string;
}

export interface SupplierOptionRecord {
  id: number | string;
  code: string;
  name: string;
}

function sourceSql(alias = "supplier"): string {
  return `CASE WHEN CONVERT(BIGINT, ${alias}.SUPPLIER_ID) < 0 OR CONVERT(NVARCHAR(100), ${alias}.SUPPLIER_CODE) LIKE N'USR-SUP-%' THEN 'MANUAL' ELSE 'ORACLE' END`;
}

function supplierSelectSql(ownerUserIdBound = true): string {
  const ownerFilter = ownerUserIdBound ? "AND contract.owner_user_id = @ownerUserId" : "";
  return `
    CONVERT(BIGINT, supplier.SUPPLIER_ID) AS id,
    CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) AS code,
    CONVERT(NVARCHAR(100), supplier.MANUAL_FILE_NO) AS manualFileNo,
    CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME) AS name,
    CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME_S) AS nameSecondary,
    CONVERT(NVARCHAR(100), supplier.TAX_REGISTRATION_NO) AS taxRegistrationNo,
    CONVERT(NVARCHAR(150), supplier.COUNTRY_NAME) AS countryName,
    CONVERT(NVARCHAR(150), supplier.CITY_NAME) AS cityName,
    CONVERT(NVARCHAR(50), supplier.CURRENCY) AS currency,
    CONVERT(NVARCHAR(100), supplier.CONTACT_JOB_TEL) AS contactJobTel,
    CONVERT(NVARCHAR(50), supplier.EXTENSION_NO) AS extensionNo,
    CONVERT(NVARCHAR(100), supplier.MOBILE_NO) AS mobileNo,
    CONVERT(NVARCHAR(100), supplier.HOME_PHONE) AS homePhone,
    CONVERT(NVARCHAR(320), supplier.EMAIL) AS email,
    ${sourceSql()} AS source,
    (
      SELECT COUNT_BIG(1)
      FROM dbo.TM_contracts AS contract
      WHERE contract.supplier_id = CONVERT(BIGINT, supplier.SUPPLIER_ID)
        ${ownerFilter}
        AND contract.is_active = 1
    ) AS currentContractCount,
    (
      SELECT COUNT_BIG(1)
      FROM dbo.TM_contracts AS contract
      LEFT JOIN dbo.TM_contract_user_settings AS settings
        ON settings.owner_user_id = contract.owner_user_id
      WHERE contract.supplier_id = CONVERT(BIGINT, supplier.SUPPLIER_ID)
        ${ownerFilter}
        AND contract.is_active = 1
        AND contract.start_date <= @today
        AND contract.end_date IS NOT NULL
        AND contract.end_date >= @today
        AND DATEDIFF(DAY, @today, contract.end_date) <= COALESCE(settings.expiring_soon_days, 90)
    ) AS expiringSoonContractCount,
    (
      SELECT COUNT(DISTINCT TRY_CONVERT(BIGINT, tx.ITEM_NO))
      FROM ${transactionsTable} AS tx
      WHERE TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) = CONVERT(BIGINT, supplier.SUPPLIER_ID)
        AND TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) IS NOT NULL
        AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) IS NOT NULL
    ) AS purchasedItemCount,
    (
      SELECT COUNT_BIG(1)
      FROM ${transactionsTable} AS tx
      WHERE TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) = CONVERT(BIGINT, supplier.SUPPLIER_ID)
        AND TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) IS NOT NULL
        AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) IS NOT NULL
    ) AS transactionCount,
    (
      SELECT MAX(TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE))
      FROM ${transactionsTable} AS tx
      WHERE TRY_CONVERT(BIGINT, tx.SUPPLIER_ID) = CONVERT(BIGINT, supplier.SUPPLIER_ID)
        AND TRY_CONVERT(DATE, tx.DELIVERY_NOTE_DATE) IS NOT NULL
        AND TRY_CONVERT(DECIMAL(19,6), tx.UNIT_COST) IS NOT NULL
    ) AS lastPurchaseDate
  `;
}

const sortColumns: Record<SupplierListQuery["sortBy"], string> = {
  code: "supplier.SUPPLIER_CODE",
  name: "supplier.SUPPLIER_NAME",
  country: "supplier.COUNTRY_NAME",
  city: "supplier.CITY_NAME",
  currency: "supplier.CURRENCY",
  contracts: "currentContractCount",
  purchasedItems: "purchasedItemCount",
  transactions: "transactionCount",
  lastPurchase: "lastPurchaseDate",
};

export async function listSuppliers(
  ownerUserId: number,
  query: SupplierListQuery,
  today: string,
): Promise<{ records: SupplierRecord[]; total: number }> {
  const pool = await getDatabasePool();
  const offset = (query.page - 1) * query.pageSize;
  const search = query.search?.trim() || null;
  const source = query.source ?? null;
  const orderColumn = sortColumns[query.sortBy];
  const orderDirection = query.sortDirection === "desc" ? "DESC" : "ASC";

  const request = pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("today", sql.Date, today)
    .input("search", sql.NVarChar(100), search)
    .input("source", sql.VarChar(10), source)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize);

  const records = await request.query<SupplierRecord>(`
    SELECT ${supplierSelectSql()}
    FROM ${suppliersTable} AS supplier
    WHERE (
      @search IS NULL
      OR CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME_S) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(100), supplier.TAX_REGISTRATION_NO) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(320), supplier.EMAIL) LIKE N'%' + @search + N'%'
    )
    AND (
      @source IS NULL
      OR @source = ${sourceSql()}
    )
    ORDER BY ${orderColumn} ${orderDirection}, CONVERT(BIGINT, supplier.SUPPLIER_ID) ${orderDirection}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  const count = await pool
    .request()
    .input("search", sql.NVarChar(100), search)
    .input("source", sql.VarChar(10), source).query<CountRecord>(`
      SELECT COUNT_BIG(1) AS total
      FROM ${suppliersTable} AS supplier
      WHERE (
        @search IS NULL
        OR CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) LIKE N'%' + @search + N'%'
        OR CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME) LIKE N'%' + @search + N'%'
        OR CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME_S) LIKE N'%' + @search + N'%'
        OR CONVERT(NVARCHAR(100), supplier.TAX_REGISTRATION_NO) LIKE N'%' + @search + N'%'
        OR CONVERT(NVARCHAR(320), supplier.EMAIL) LIKE N'%' + @search + N'%'
      )
      AND (
        @source IS NULL
        OR @source = ${sourceSql()}
      );
    `);

  return {
    records: records.recordset,
    total: Number(count.recordset[0]?.total ?? 0),
  };
}


export async function listSupplierOptions(
  query: SupplierOptionQuery,
): Promise<{ records: SupplierOptionRecord[]; total: number }> {
  const pool = await getDatabasePool();
  const offset = (query.page - 1) * query.pageSize;
  const search = query.search?.trim() || null;
  const source = query.source ?? null;

  const request = pool
    .request()
    .input("search", sql.NVarChar(100), search)
    .input("source", sql.VarChar(10), source)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize);

  const records = await request.query<SupplierOptionRecord>(`
    SELECT
      CONVERT(BIGINT, supplier.SUPPLIER_ID) AS id,
      CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) AS code,
      CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME) AS name
    FROM ${suppliersTable} AS supplier
    WHERE (
      @search IS NULL
      OR CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME_S) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(100), supplier.TAX_REGISTRATION_NO) LIKE N'%' + @search + N'%'
      OR CONVERT(NVARCHAR(320), supplier.EMAIL) LIKE N'%' + @search + N'%'
    )
    AND (
      @source IS NULL
      OR @source = ${sourceSql()}
    )
    ORDER BY
      supplier.SUPPLIER_NAME ASC,
      supplier.SUPPLIER_CODE ASC,
      CONVERT(BIGINT, supplier.SUPPLIER_ID) ASC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  const count = await pool
    .request()
    .input("search", sql.NVarChar(100), search)
    .input("source", sql.VarChar(10), source)
    .query<CountRecord>(`
      SELECT COUNT_BIG(1) AS total
      FROM ${suppliersTable} AS supplier
      WHERE (
        @search IS NULL
        OR CONVERT(NVARCHAR(100), supplier.SUPPLIER_CODE) LIKE N'%' + @search + N'%'
        OR CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME) LIKE N'%' + @search + N'%'
        OR CONVERT(NVARCHAR(250), supplier.SUPPLIER_NAME_S) LIKE N'%' + @search + N'%'
        OR CONVERT(NVARCHAR(100), supplier.TAX_REGISTRATION_NO) LIKE N'%' + @search + N'%'
        OR CONVERT(NVARCHAR(320), supplier.EMAIL) LIKE N'%' + @search + N'%'
      )
      AND (
        @source IS NULL
        OR @source = ${sourceSql()}
      );
    `);

  return {
    records: records.recordset,
    total: Number(count.recordset[0]?.total ?? 0),
  };
}

export async function findSupplier(
  ownerUserId: number,
  supplierId: number,
  today: string,
  transaction?: DatabaseTransaction,
): Promise<SupplierRecord | null> {
  const request = transaction ? transaction.request() : (await getDatabasePool()).request();
  const result = await request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("supplierId", sql.BigInt, supplierId)
    .input("today", sql.Date, today).query<SupplierRecord>(`
      SELECT TOP (1) ${supplierSelectSql()}
      FROM ${suppliersTable} AS supplier ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
      WHERE CONVERT(BIGINT, supplier.SUPPLIER_ID) = @supplierId;
    `);
  return result.recordset[0] ?? null;
}

export async function findSupplierIdentity(
  supplierId: number,
  transaction?: DatabaseTransaction,
): Promise<SupplierIdentityRecord | null> {
  const request = transaction ? transaction.request() : (await getDatabasePool()).request();
  const result = await request.input("supplierId", sql.BigInt, supplierId).query<SupplierIdentityRecord>(`
      SELECT TOP (1)
        CONVERT(BIGINT, SUPPLIER_ID) AS id,
        CONVERT(NVARCHAR(250), SUPPLIER_NAME) AS name,
        CONVERT(NVARCHAR(100), SUPPLIER_CODE) AS code
      FROM ${suppliersTable} ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
      WHERE CONVERT(BIGINT, SUPPLIER_ID) = @supplierId;
    `);
  return result.recordset[0] ?? null;
}

function bindSupplierInput(request: import("mssql").Request, input: SupplierInput): void {
  request
    .input("manualFileNo", sql.NVarChar(100), input.manualFileNo)
    .input("name", sql.NVarChar(250), input.name)
    .input("nameSecondary", sql.NVarChar(250), input.nameSecondary)
    .input("taxRegistrationNo", sql.NVarChar(100), input.taxRegistrationNo)
    .input("countryName", sql.NVarChar(150), input.countryName)
    .input("cityName", sql.NVarChar(150), input.cityName)
    .input("currency", sql.NVarChar(50), input.currency)
    .input("contactJobTel", sql.NVarChar(100), input.contactJobTel)
    .input("extensionNo", sql.NVarChar(50), input.extensionNo)
    .input("mobileNo", sql.NVarChar(100), input.mobileNo)
    .input("homePhone", sql.NVarChar(100), input.homePhone)
    .input("email", sql.NVarChar(320), input.email);
}

export async function createManualSupplier(
  transaction: DatabaseTransaction,
  input: SupplierInput,
): Promise<number> {
  const request = transaction.request();
  bindSupplierInput(request, input);
  const result = await request.query<IdRecord>(`
    DECLARE @supplierId BIGINT;
    DECLARE @supplierCode NVARCHAR(100);

    SELECT @supplierId = COALESCE(MIN(CONVERT(BIGINT, SUPPLIER_ID)), 0) - 1
    FROM ${suppliersTable} WITH (UPDLOCK, HOLDLOCK)
    WHERE CONVERT(BIGINT, SUPPLIER_ID) < 0;

    IF @supplierId >= 0 SET @supplierId = -1;

    SET @supplierCode = N'USR-SUP-' + RIGHT(
      N'000000' + CONVERT(NVARCHAR(30), ABS(@supplierId)),
      6
    );

    INSERT INTO ${suppliersTable} (
      SUPPLIER_ID,
      SUPPLIER_CODE,
      MANUAL_FILE_NO,
      SUPPLIER_NAME,
      SUPPLIER_NAME_S,
      TAX_REGISTRATION_NO,
      COUNTRY_NAME,
      CITY_NAME,
      CURRENCY,
      CONTACT_JOB_TEL,
      EXTENSION_NO,
      MOBILE_NO,
      HOME_PHONE,
      EMAIL
    )
    VALUES (
      @supplierId,
      @supplierCode,
      @manualFileNo,
      @name,
      @nameSecondary,
      @taxRegistrationNo,
      @countryName,
      @cityName,
      @currency,
      @contactJobTel,
      @extensionNo,
      @mobileNo,
      @homePhone,
      @email
    );

    SELECT @supplierId AS id;
  `);
  return Number(result.recordset[0]?.id);
}

export async function updateSupplier(
  transaction: DatabaseTransaction,
  supplierId: number,
  input: SupplierInput,
): Promise<boolean> {
  const request = transaction.request();
  bindSupplierInput(request, input);
  const result = await request.input("supplierId", sql.BigInt, supplierId).query(`
    UPDATE ${suppliersTable}
    SET
      MANUAL_FILE_NO = @manualFileNo,
      SUPPLIER_NAME = @name,
      SUPPLIER_NAME_S = @nameSecondary,
      TAX_REGISTRATION_NO = @taxRegistrationNo,
      COUNTRY_NAME = @countryName,
      CITY_NAME = @cityName,
      CURRENCY = @currency,
      CONTACT_JOB_TEL = @contactJobTel,
      EXTENSION_NO = @extensionNo,
      MOBILE_NO = @mobileNo,
      HOME_PHONE = @homePhone,
      EMAIL = @email
    WHERE CONVERT(BIGINT, SUPPLIER_ID) = @supplierId;
  `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export async function addActivity(
  transaction: DatabaseTransaction,
  input: {
    supplierId: number;
    actorUserId: number;
    actionType: "CREATED" | "UPDATED";
    beforeValues: Record<string, unknown> | null;
    afterValues: Record<string, unknown> | null;
  },
): Promise<void> {
  await transaction
    .request()
    .input("entityKey", sql.NVarChar(120), String(input.supplierId))
    .input("actionType", sql.VarChar(30), input.actionType)
    .input("actorUserId", sql.Int, input.actorUserId)
    .input("beforeValues", sql.NVarChar(sql.MAX), input.beforeValues ? JSON.stringify(input.beforeValues) : null)
    .input("afterValues", sql.NVarChar(sql.MAX), input.afterValues ? JSON.stringify(input.afterValues) : null)
    .query(`
      INSERT INTO dbo.TM_procurement_activity (
        entity_type,
        entity_key,
        owner_user_id,
        action_type,
        actor_user_id,
        before_values,
        after_values
      )
      VALUES (
        'SUPPLIER',
        @entityKey,
        NULL,
        @actionType,
        @actorUserId,
        @beforeValues,
        @afterValues
      );
    `);
}

export async function listActivity(supplierId: number): Promise<SupplierActivityRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("entityKey", sql.NVarChar(120), String(supplierId))
    .query<SupplierActivityRecord>(`
      SELECT
        activity.id,
        activity.action_type AS actionType,
        activity.actor_user_id AS actorUserId,
        COALESCE(portal.USER_NAME, portal.USER_CODE, CONVERT(NVARCHAR(20), activity.actor_user_id)) AS actorName,
        activity.before_values AS beforeValues,
        activity.after_values AS afterValues,
        activity.created_at_utc AS createdAtUtc
      FROM dbo.TM_procurement_activity AS activity
      LEFT JOIN dbo.users AS portal
        ON portal.USER_ID = activity.actor_user_id
      WHERE activity.entity_type = 'SUPPLIER'
        AND activity.entity_key = @entityKey
      ORDER BY activity.created_at_utc DESC, activity.id DESC;
    `);
  return result.recordset;
}

export const suppliersRepository = {
  listSuppliers,
  findSupplier,
  findSupplierIdentity,
  createManualSupplier,
  updateSupplier,
  addActivity,
  listActivity,
};

