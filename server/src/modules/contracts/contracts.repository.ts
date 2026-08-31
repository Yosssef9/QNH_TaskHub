import type { DatabaseTransaction } from "../../database/types.js";
import { getDatabasePool, sql } from "../../database/sql.js";
import { normalizeSqlRowVersion, rowVersionToBuffer } from "./contracts-row-version.js";
import type {
  ContractInput,
  ContractListQuery,
  ContractPaymentFrequency,
  ContractPaymentTiming,
  ContractTrackingState,
  ContractValueType,
  SupplierInput,
  SupplierListQuery,
} from "./contracts.types.js";

export interface SupplierRecord {
  id: number | string;
  name: string;
  commercialRegistrationNo: string | null;
  taxNumber: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  addressText: string | null;
  notes: string | null;
  isActive: boolean;
  currentContractCount: number | string;
  expiringSoonContractCount: number | string;
  createdAtUtc: Date;
  updatedAtUtc: Date | null;
  rowVersion: Buffer;
}

export interface ContractRecord {
  id: number | string;
  supplierId: number | string;
  supplierName: string;
  supplierIsActive: boolean;
  contractNumber: string | null;
  title: string;
  startDate: Date;
  endDate: Date | null;
  durationDays: number | null;
  daysRemaining: number | null;
  trackingState: ContractTrackingState;
  isAutoRenewal: boolean;
  renewalTermMonths: number | null;
  noticePeriodDays: number | null;
  noticeDeadline: Date | null;
  valueType: ContractValueType;
  contractValueSar: number | null;
  paymentFrequency: ContractPaymentFrequency | null;
  paymentTiming: ContractPaymentTiming | null;
  notes: string | null;
  isActive: boolean;
  createdAtUtc: Date;
  updatedAtUtc: Date | null;
  rowVersion: Buffer;
  fileCount: number | string;
}

export interface ContractAttachmentRecord {
  id: string;
  contractId: number | string;
  originalFileName: string;
  storageKey: string;
  mimeType: string;
  fileExtension: string;
  sizeBytes: number | string;
  createdAtUtc: Date;
}

export interface ActivityRecord {
  id: number | string;
  activityType: string;
  changesJson: string | null;
  actorUserId: number;
  actorName: string;
  createdAtUtc: Date;
}

export interface SettingsRecord {
  expiringSoonDays: number;
  expirationEmailEnabled: boolean;
  expirationReminderLeadDays: number;
  noticeEmailEnabled: boolean;
  noticeReminderLeadDays: number;
  rowVersion: string;
}

interface CountRecord {
  total: number | string;
}

interface SummaryRecord {
  total: number | string;
  active: number | string;
  expiringSoon: number | string;
  expired: number | string;
  upcoming: number | string;
}

interface IdRecord {
  id: number | string;
}

function bindRowVersion(request: import("mssql").Request, value: string): void {
  const bytes = rowVersionToBuffer(value);
  if (!bytes) throw new TypeError("Invalid SQL Server rowversion token.");
  request.input("rowVersion", sql.VarBinary(8), bytes);
}

function contractDerivedSql(): string {
  return `
    CROSS APPLY (
      SELECT
        DATEDIFF(DAY, contract.start_date, contract.end_date) AS durationDays,
        CASE
          WHEN contract.end_date IS NULL THEN NULL
          ELSE DATEDIFF(DAY, @today, contract.end_date)
        END AS daysRemaining,
        CASE
          WHEN contract.start_date > @today THEN 'UPCOMING'
          WHEN contract.end_date IS NOT NULL AND contract.end_date < @today THEN 'EXPIRED'
          WHEN contract.end_date IS NOT NULL
            AND DATEDIFF(DAY, @today, contract.end_date) BETWEEN 0 AND @expiringSoonDays
            THEN 'EXPIRING_SOON'
          ELSE 'ACTIVE'
        END AS trackingState,
        CASE
          WHEN contract.is_auto_renewal = 1
            THEN DATEADD(DAY, -contract.notice_period_days, contract.end_date)
          ELSE NULL
        END AS noticeDeadline
    ) AS derived
  `;
}

function contractSelectSql(includeFileCount = false): string {
  const fileCountSql = includeFileCount
    ? `
    (
      SELECT COUNT(1)
      FROM dbo.TM_contract_attachments AS attachment
      WHERE attachment.owner_user_id = contract.owner_user_id
        AND attachment.contract_id = contract.id
        AND attachment.is_active = 1
    ) AS fileCount`
    : `CAST(0 AS BIGINT) AS fileCount`;

  return `
    contract.id,
    contract.supplier_id AS supplierId,
    supplier.name AS supplierName,
    CAST(supplier.is_active AS BIT) AS supplierIsActive,
    contract.contract_number AS contractNumber,
    contract.title,
    contract.start_date AS startDate,
    contract.end_date AS endDate,
    derived.durationDays,
    derived.daysRemaining,
    derived.trackingState,
    CAST(contract.is_auto_renewal AS BIT) AS isAutoRenewal,
    contract.renewal_term_months AS renewalTermMonths,
    contract.notice_period_days AS noticePeriodDays,
    derived.noticeDeadline,
    contract.value_type AS valueType,
    contract.contract_value_sar AS contractValueSar,
    contract.payment_frequency AS paymentFrequency,
    contract.payment_timing AS paymentTiming,
    contract.notes,
    CAST(contract.is_active AS BIT) AS isActive,
    contract.created_at_utc AS createdAtUtc,
    contract.updated_at_utc AS updatedAtUtc,
    contract.row_version AS rowVersion,
    ${fileCountSql}
  `;
}

function bindContractFilters(
  request: import("mssql").Request,
  ownerUserId: number,
  query: ContractListQuery,
  today: string,
  expiringSoonDays: number,
): void {
  request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("today", sql.Date, today)
    .input("expiringSoonDays", sql.Int, expiringSoonDays)
    .input("isActive", sql.Bit, !query.archived)
    .input("search", sql.NVarChar(100), query.search?.trim() || null)
    .input("status", sql.VarChar(20), query.status ?? null)
    .input("supplierId", sql.BigInt, query.supplierId ?? null)
    .input("autoRenewal", sql.Bit, query.autoRenewal ?? null)
    .input("valueType", sql.VarChar(20), query.valueType ?? null)
    .input("paymentFrequency", sql.VarChar(20), query.paymentFrequency ?? null)
    .input("paymentTiming", sql.VarChar(20), query.paymentTiming ?? null)
    .input("startFrom", sql.Date, query.startFrom ?? null)
    .input("startTo", sql.Date, query.startTo ?? null)
    .input("endFrom", sql.Date, query.endFrom ?? null)
    .input("endTo", sql.Date, query.endTo ?? null);
}

function contractFilterSql(): string {
  return `
    contract.owner_user_id = @ownerUserId
    AND contract.is_active = @isActive
    AND (
      @search IS NULL
      OR contract.title LIKE N'%' + @search + N'%'
      OR contract.contract_number LIKE N'%' + @search + N'%'
      OR supplier.name LIKE N'%' + @search + N'%'
    )
    AND (@status IS NULL OR derived.trackingState = @status)
    AND (@supplierId IS NULL OR contract.supplier_id = @supplierId)
    AND (@autoRenewal IS NULL OR contract.is_auto_renewal = @autoRenewal)
    AND (@valueType IS NULL OR contract.value_type = @valueType)
    AND (@paymentFrequency IS NULL OR contract.payment_frequency = @paymentFrequency)
    AND (@paymentTiming IS NULL OR contract.payment_timing = @paymentTiming)
    AND (@startFrom IS NULL OR contract.start_date >= @startFrom)
    AND (@startTo IS NULL OR contract.start_date <= @startTo)
    AND (@endFrom IS NULL OR contract.end_date >= @endFrom)
    AND (@endTo IS NULL OR contract.end_date <= @endTo)
  `;
}

const sortColumns: Record<ContractListQuery["sortBy"], string> = {
  title: "contract.title",
  supplier: "supplier.name",
  startDate: "contract.start_date",
  endDate: "contract.end_date",
  value: "contract.contract_value_sar",
};

export async function listContracts(
  ownerUserId: number,
  query: ContractListQuery,
  today: string,
  expiringSoonDays: number,
): Promise<{ records: ContractRecord[]; total: number }> {
  const pool = await getDatabasePool();
  const offset = (query.page - 1) * query.pageSize;
  const request = pool.request();
  bindContractFilters(request, ownerUserId, query, today, expiringSoonDays);
  request.input("offset", sql.Int, offset).input("pageSize", sql.Int, query.pageSize);

  const orderColumn = sortColumns[query.sortBy];
  const orderDirection = query.sortDirection === "desc" ? "DESC" : "ASC";
  const nullOrder = query.sortBy === "endDate" || query.sortBy === "value"
    ? `CASE WHEN ${orderColumn} IS NULL THEN 1 ELSE 0 END,`
    : "";

  const result = await request.query<ContractRecord>(`
    SELECT ${contractSelectSql(true)}
    FROM dbo.TM_contracts AS contract
    INNER JOIN dbo.TM_contract_suppliers AS supplier
      ON supplier.id = contract.supplier_id
      AND supplier.owner_user_id = contract.owner_user_id
    ${contractDerivedSql()}
    WHERE ${contractFilterSql()}
    ORDER BY ${nullOrder} ${orderColumn} ${orderDirection}, contract.id ${orderDirection}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  const countRequest = pool.request();
  bindContractFilters(countRequest, ownerUserId, query, today, expiringSoonDays);
  const countResult = await countRequest.query<CountRecord>(`
    SELECT COUNT_BIG(1) AS total
    FROM dbo.TM_contracts AS contract
    INNER JOIN dbo.TM_contract_suppliers AS supplier
      ON supplier.id = contract.supplier_id
      AND supplier.owner_user_id = contract.owner_user_id
    ${contractDerivedSql()}
    WHERE ${contractFilterSql()};
  `);

  return {
    records: result.recordset,
    total: Number(countResult.recordset[0]?.total ?? 0),
  };
}

export async function getContractSummary(
  ownerUserId: number,
  today: string,
  expiringSoonDays: number,
): Promise<SummaryRecord> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("today", sql.Date, today)
    .input("expiringSoonDays", sql.Int, expiringSoonDays).query<SummaryRecord>(`
      SELECT
        COUNT_BIG(1) AS total,
        COALESCE(SUM(CASE WHEN derived.trackingState = 'ACTIVE' THEN 1 ELSE 0 END), 0) AS active,
        COALESCE(SUM(CASE WHEN derived.trackingState = 'EXPIRING_SOON' THEN 1 ELSE 0 END), 0) AS expiringSoon,
        COALESCE(SUM(CASE WHEN derived.trackingState = 'EXPIRED' THEN 1 ELSE 0 END), 0) AS expired,
        COALESCE(SUM(CASE WHEN derived.trackingState = 'UPCOMING' THEN 1 ELSE 0 END), 0) AS upcoming
      FROM dbo.TM_contracts AS contract
      ${contractDerivedSql()}
      WHERE contract.owner_user_id = @ownerUserId
        AND contract.is_active = 1;
    `);

  return (
    result.recordset[0] ?? { total: 0, active: 0, expiringSoon: 0, expired: 0, upcoming: 0 }
  );
}

export async function findOwnedContract(
  ownerUserId: number,
  contractId: number,
  today: string,
  expiringSoonDays: number,
): Promise<ContractRecord | null> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("contractId", sql.BigInt, contractId)
    .input("today", sql.Date, today)
    .input("expiringSoonDays", sql.Int, expiringSoonDays).query<ContractRecord>(`
      SELECT TOP (1) ${contractSelectSql()}
      FROM dbo.TM_contracts AS contract
      INNER JOIN dbo.TM_contract_suppliers AS supplier
        ON supplier.id = contract.supplier_id
        AND supplier.owner_user_id = contract.owner_user_id
      ${contractDerivedSql()}
      WHERE contract.id = @contractId
        AND contract.owner_user_id = @ownerUserId;
    `);
  return result.recordset[0] ?? null;
}

export async function findOwnedContractForUpdate(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  contractId: number,
  today: string,
  expiringSoonDays: number,
): Promise<ContractRecord | null> {
  const result = await transaction
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("contractId", sql.BigInt, contractId)
    .input("today", sql.Date, today)
    .input("expiringSoonDays", sql.Int, expiringSoonDays).query<ContractRecord>(`
      SELECT TOP (1) ${contractSelectSql()}
      FROM dbo.TM_contracts AS contract WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN dbo.TM_contract_suppliers AS supplier
        ON supplier.id = contract.supplier_id
        AND supplier.owner_user_id = contract.owner_user_id
      ${contractDerivedSql()}
      WHERE contract.id = @contractId
        AND contract.owner_user_id = @ownerUserId;
    `);
  return result.recordset[0] ?? null;
}

function bindContractInput(
  request: import("mssql").Request,
  ownerUserId: number,
  input: ContractInput,
): void {
  request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("supplierId", sql.BigInt, input.supplierId)
    .input("contractNumber", sql.NVarChar(120), input.contractNumber)
    .input("title", sql.NVarChar(250), input.title)
    .input("startDate", sql.Date, input.startDate)
    .input("endDate", sql.Date, input.endDate)
    .input("isAutoRenewal", sql.Bit, input.isAutoRenewal)
    .input("renewalTermMonths", sql.Int, input.renewalTermMonths)
    .input("noticePeriodDays", sql.Int, input.noticePeriodDays)
    .input("valueType", sql.VarChar(20), input.valueType)
    .input("contractValueSar", sql.Decimal(19, 2), input.contractValueSar)
    .input("paymentFrequency", sql.VarChar(20), input.paymentFrequency)
    .input("paymentTiming", sql.VarChar(20), input.paymentTiming)
    .input("notes", sql.NVarChar(sql.MAX), input.notes);
}

export async function createContract(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  input: ContractInput,
): Promise<number> {
  const request = transaction.request();
  bindContractInput(request, ownerUserId, input);
  const result = await request.query<IdRecord>(`
    INSERT INTO dbo.TM_contracts (
      owner_user_id,
      supplier_id,
      contract_number,
      title,
      start_date,
      end_date,
      is_auto_renewal,
      renewal_term_months,
      notice_period_days,
      value_type,
      contract_value_sar,
      payment_frequency,
      payment_timing,
      notes
    )
    OUTPUT inserted.id
    VALUES (
      @ownerUserId,
      @supplierId,
      @contractNumber,
      @title,
      @startDate,
      @endDate,
      @isAutoRenewal,
      @renewalTermMonths,
      @noticePeriodDays,
      @valueType,
      @contractValueSar,
      @paymentFrequency,
      @paymentTiming,
      @notes
    );
  `);
  return Number(result.recordset[0]?.id);
}

export async function updateContract(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  contractId: number,
  rowVersion: string,
  input: ContractInput,
): Promise<boolean> {
  const request = transaction.request();
  bindContractInput(request, ownerUserId, input);
  request.input("contractId", sql.BigInt, contractId);
  bindRowVersion(request, rowVersion);
  const result = await request.query(`
    UPDATE dbo.TM_contracts
    SET
      supplier_id = @supplierId,
      contract_number = @contractNumber,
      title = @title,
      start_date = @startDate,
      end_date = @endDate,
      is_auto_renewal = @isAutoRenewal,
      renewal_term_months = @renewalTermMonths,
      notice_period_days = @noticePeriodDays,
      value_type = @valueType,
      contract_value_sar = @contractValueSar,
      payment_frequency = @paymentFrequency,
      payment_timing = @paymentTiming,
      notes = @notes,
      updated_at_utc = SYSUTCDATETIME()
    WHERE id = @contractId
      AND owner_user_id = @ownerUserId
      AND row_version = @rowVersion;
  `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export async function setContractActive(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  contractId: number,
  rowVersion: string,
  isActive: boolean,
): Promise<boolean> {
  const request = transaction
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("contractId", sql.BigInt, contractId);
  bindRowVersion(request, rowVersion);
  const result = await request.input("isActive", sql.Bit, isActive).query(`
    UPDATE dbo.TM_contracts
    SET is_active = @isActive, updated_at_utc = SYSUTCDATETIME()
    WHERE id = @contractId
      AND owner_user_id = @ownerUserId
      AND row_version = @rowVersion;
  `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export async function addContractActivity(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  contractId: number,
  activityType: string,
  changes?: Record<string, { from: unknown; to: unknown }> | null,
): Promise<void> {
  await transaction
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("contractId", sql.BigInt, contractId)
    .input("activityType", sql.VarChar(30), activityType)
    .input("changesJson", sql.NVarChar(sql.MAX), changes ? JSON.stringify(changes) : null)
    .query(`
      INSERT INTO dbo.TM_contract_activity (
        owner_user_id,
        contract_id,
        activity_type,
        changes_json,
        actor_user_id
      )
      VALUES (@ownerUserId, @contractId, @activityType, @changesJson, @ownerUserId);
    `);
}

export async function listContractActivity(
  ownerUserId: number,
  contractId: number,
): Promise<ActivityRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("contractId", sql.BigInt, contractId).query<ActivityRecord>(`
      SELECT
        activity.id,
        activity.activity_type AS activityType,
        activity.changes_json AS changesJson,
        activity.actor_user_id AS actorUserId,
        portal.USER_NAME AS actorName,
        activity.created_at_utc AS createdAtUtc
      FROM dbo.TM_contract_activity AS activity
      INNER JOIN dbo.users AS portal ON portal.USER_ID = activity.actor_user_id
      WHERE activity.owner_user_id = @ownerUserId
        AND activity.contract_id = @contractId
      ORDER BY activity.created_at_utc DESC, activity.id DESC;
    `);
  return result.recordset;
}

function supplierSelectSql(): string {
  return `
    supplier.id,
    supplier.name,
    supplier.commercial_registration_no AS commercialRegistrationNo,
    supplier.tax_number AS taxNumber,
    supplier.primary_contact_name AS primaryContactName,
    supplier.primary_contact_email AS primaryContactEmail,
    supplier.primary_contact_phone AS primaryContactPhone,
    supplier.address_text AS addressText,
    supplier.notes,
    CAST(supplier.is_active AS BIT) AS isActive,
    COUNT_BIG(CASE WHEN contract.is_active = 1 THEN contract.id END) AS currentContractCount,
    COALESCE(SUM(CASE
      WHEN contract.is_active = 1
       AND contract.start_date <= @today
       AND contract.end_date IS NOT NULL
       AND contract.end_date >= @today
       AND DATEDIFF(DAY, @today, contract.end_date) <= @expiringSoonDays
      THEN 1 ELSE 0 END), 0) AS expiringSoonContractCount,
    supplier.created_at_utc AS createdAtUtc,
    supplier.updated_at_utc AS updatedAtUtc,
    supplier.row_version AS rowVersion
  `;
}

export async function listSuppliers(
  ownerUserId: number,
  query: SupplierListQuery,
  today: string,
  expiringSoonDays: number,
): Promise<{ records: SupplierRecord[]; total: number }> {
  const pool = await getDatabasePool();
  const offset = (query.page - 1) * query.pageSize;
  const search = query.search?.trim() || null;
  const request = pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("isActive", sql.Bit, !query.archived)
    .input("search", sql.NVarChar(100), search)
    .input("today", sql.Date, today)
    .input("expiringSoonDays", sql.Int, expiringSoonDays)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize);

  const result = await request.query<SupplierRecord>(`
    SELECT ${supplierSelectSql()}
    FROM dbo.TM_contract_suppliers AS supplier
    LEFT JOIN dbo.TM_contracts AS contract
      ON contract.supplier_id = supplier.id
      AND contract.owner_user_id = supplier.owner_user_id
    WHERE supplier.owner_user_id = @ownerUserId
      AND supplier.is_active = @isActive
      AND (@search IS NULL OR supplier.name LIKE N'%' + @search + N'%')
    GROUP BY
      supplier.id,
      supplier.name,
      supplier.commercial_registration_no,
      supplier.tax_number,
      supplier.primary_contact_name,
      supplier.primary_contact_email,
      supplier.primary_contact_phone,
      supplier.address_text,
      supplier.notes,
      supplier.is_active,
      supplier.created_at_utc,
      supplier.updated_at_utc,
      supplier.row_version
    ORDER BY supplier.name, supplier.id
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  const countResult = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("isActive", sql.Bit, !query.archived)
    .input("search", sql.NVarChar(100), search).query<CountRecord>(`
      SELECT COUNT_BIG(1) AS total
      FROM dbo.TM_contract_suppliers AS supplier
      WHERE supplier.owner_user_id = @ownerUserId
        AND supplier.is_active = @isActive
        AND (@search IS NULL OR supplier.name LIKE N'%' + @search + N'%');
    `);

  return { records: result.recordset, total: Number(countResult.recordset[0]?.total ?? 0) };
}

export async function findOwnedSupplier(
  ownerUserId: number,
  supplierId: number,
  today: string,
  expiringSoonDays: number,
): Promise<SupplierRecord | null> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("supplierId", sql.BigInt, supplierId)
    .input("today", sql.Date, today)
    .input("expiringSoonDays", sql.Int, expiringSoonDays).query<SupplierRecord>(`
      SELECT TOP (1) ${supplierSelectSql()}
      FROM dbo.TM_contract_suppliers AS supplier
      LEFT JOIN dbo.TM_contracts AS contract
        ON contract.supplier_id = supplier.id
        AND contract.owner_user_id = supplier.owner_user_id
      WHERE supplier.id = @supplierId
        AND supplier.owner_user_id = @ownerUserId
      GROUP BY
        supplier.id,
        supplier.name,
        supplier.commercial_registration_no,
        supplier.tax_number,
        supplier.primary_contact_name,
        supplier.primary_contact_email,
        supplier.primary_contact_phone,
        supplier.address_text,
        supplier.notes,
        supplier.is_active,
        supplier.created_at_utc,
        supplier.updated_at_utc,
        supplier.row_version;
    `);
  return result.recordset[0] ?? null;
}

export async function findOwnedSupplierForUpdate(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  supplierId: number,
): Promise<{ id: number; name: string; isActive: boolean; rowVersion: string } | null> {
  const result = await transaction
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("supplierId", sql.BigInt, supplierId).query<{
      id: number | string;
      name: string;
      isActive: boolean;
      rowVersion: Buffer;
    }>(`
      SELECT TOP (1)
        id,
        name,
        CAST(is_active AS BIT) AS isActive,
        row_version AS rowVersion
      FROM dbo.TM_contract_suppliers WITH (UPDLOCK, HOLDLOCK)
      WHERE id = @supplierId AND owner_user_id = @ownerUserId;
    `);
  const row = result.recordset[0];
  if (!row) return null;
  const rowVersion = normalizeSqlRowVersion(row.rowVersion);
  if (!rowVersion) throw new Error("SQL Server returned an invalid supplier rowversion token.");
  return { ...row, id: Number(row.id), rowVersion };
}

export async function activeSupplierExists(
  ownerUserId: number,
  supplierId: number,
  transaction?: DatabaseTransaction,
): Promise<boolean> {
  const request = transaction ? transaction.request() : (await getDatabasePool()).request();
  const result = await request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("supplierId", sql.BigInt, supplierId).query<IdRecord>(`
      SELECT TOP (1) id
      FROM dbo.TM_contract_suppliers ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
      WHERE id = @supplierId
        AND owner_user_id = @ownerUserId
        AND is_active = 1;
    `);
  return Boolean(result.recordset[0]);
}

export async function supplierNameExists(
  ownerUserId: number,
  name: string,
  excludeSupplierId?: number,
  transaction?: DatabaseTransaction,
): Promise<boolean> {
  const request = transaction ? transaction.request() : (await getDatabasePool()).request();
  request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("name", sql.NVarChar(250), name)
    .input("excludeSupplierId", sql.BigInt, excludeSupplierId ?? null);
  const result = await request.query<IdRecord>(`
    SELECT TOP (1) id
    FROM dbo.TM_contract_suppliers ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
    WHERE owner_user_id = @ownerUserId
      AND name = @name
      AND (@excludeSupplierId IS NULL OR id <> @excludeSupplierId);
  `);
  return Boolean(result.recordset[0]);
}

function bindSupplierInput(
  request: import("mssql").Request,
  ownerUserId: number,
  input: SupplierInput,
): void {
  request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("name", sql.NVarChar(250), input.name)
    .input("commercialRegistrationNo", sql.NVarChar(80), input.commercialRegistrationNo)
    .input("taxNumber", sql.NVarChar(80), input.taxNumber)
    .input("primaryContactName", sql.NVarChar(200), input.primaryContactName)
    .input("primaryContactEmail", sql.NVarChar(320), input.primaryContactEmail)
    .input("primaryContactPhone", sql.NVarChar(50), input.primaryContactPhone)
    .input("addressText", sql.NVarChar(1000), input.addressText)
    .input("notes", sql.NVarChar(sql.MAX), input.notes);
}

export async function createSupplier(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  input: SupplierInput,
): Promise<number> {
  const request = transaction.request();
  bindSupplierInput(request, ownerUserId, input);
  const result = await request.query<IdRecord>(`
    INSERT INTO dbo.TM_contract_suppliers (
      owner_user_id,
      name,
      commercial_registration_no,
      tax_number,
      primary_contact_name,
      primary_contact_email,
      primary_contact_phone,
      address_text,
      notes
    )
    OUTPUT inserted.id
    VALUES (
      @ownerUserId,
      @name,
      @commercialRegistrationNo,
      @taxNumber,
      @primaryContactName,
      @primaryContactEmail,
      @primaryContactPhone,
      @addressText,
      @notes
    );
  `);
  return Number(result.recordset[0]?.id);
}

export async function updateSupplier(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  supplierId: number,
  rowVersion: string,
  input: SupplierInput,
): Promise<boolean> {
  const request = transaction.request();
  bindSupplierInput(request, ownerUserId, input);
  request.input("supplierId", sql.BigInt, supplierId);
  bindRowVersion(request, rowVersion);
  const result = await request.query(`
    UPDATE dbo.TM_contract_suppliers
    SET
      name = @name,
      commercial_registration_no = @commercialRegistrationNo,
      tax_number = @taxNumber,
      primary_contact_name = @primaryContactName,
      primary_contact_email = @primaryContactEmail,
      primary_contact_phone = @primaryContactPhone,
      address_text = @addressText,
      notes = @notes,
      updated_at_utc = SYSUTCDATETIME()
    WHERE id = @supplierId
      AND owner_user_id = @ownerUserId
      AND row_version = @rowVersion;
  `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export async function setSupplierActive(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  supplierId: number,
  rowVersion: string,
  isActive: boolean,
): Promise<boolean> {
  const request = transaction
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("supplierId", sql.BigInt, supplierId);
  bindRowVersion(request, rowVersion);
  const result = await request.input("isActive", sql.Bit, isActive).query(`
      UPDATE dbo.TM_contract_suppliers
      SET is_active = @isActive, updated_at_utc = SYSUTCDATETIME()
      WHERE id = @supplierId
        AND owner_user_id = @ownerUserId
        AND row_version = @rowVersion;
    `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export async function ensureContractSettings(ownerUserId: number): Promise<void> {
  const pool = await getDatabasePool();
  await pool.request().input("ownerUserId", sql.Int, ownerUserId).query(`
    SET XACT_ABORT ON;

    BEGIN TRY
      BEGIN TRANSACTION;

      IF NOT EXISTS (
        SELECT 1
        FROM dbo.TM_contract_user_settings WITH (UPDLOCK, HOLDLOCK)
        WHERE owner_user_id = @ownerUserId
      )
      BEGIN
        INSERT INTO dbo.TM_contract_user_settings (owner_user_id)
        VALUES (@ownerUserId);
      END;

      COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
      IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
      THROW;
    END CATCH;
  `);
}

export async function getContractSettings(ownerUserId: number): Promise<SettingsRecord | null> {
  const pool = await getDatabasePool();
  const result = await pool.request().input("ownerUserId", sql.Int, ownerUserId).query<Omit<SettingsRecord, "rowVersion"> & { rowVersion: Buffer }>(`
    SELECT
      expiring_soon_days AS expiringSoonDays,
      CAST(expiration_email_enabled AS BIT) AS expirationEmailEnabled,
      expiration_reminder_lead_days AS expirationReminderLeadDays,
      CAST(notice_email_enabled AS BIT) AS noticeEmailEnabled,
      notice_reminder_lead_days AS noticeReminderLeadDays,
      row_version AS rowVersion
    FROM dbo.TM_contract_user_settings
    WHERE owner_user_id = @ownerUserId;
  `);
  const row = result.recordset[0] ?? null;
  if (!row) return null;
  const rowVersion = normalizeSqlRowVersion(row.rowVersion);
  if (!rowVersion) throw new Error("SQL Server returned an invalid contract-settings rowversion token.");
  return { ...row, rowVersion };
}

export async function updateContractSettings(
  ownerUserId: number,
  rowVersion: string,
  input: {
    expiringSoonDays: number;
    expirationEmailEnabled: boolean;
    expirationReminderLeadDays: number;
    noticeEmailEnabled: boolean;
    noticeReminderLeadDays: number;
  },
): Promise<boolean> {
  const pool = await getDatabasePool();
  const request = pool.request().input("ownerUserId", sql.Int, ownerUserId);
  bindRowVersion(request, rowVersion);
  const result = await request
    .input("expiringSoonDays", sql.Int, input.expiringSoonDays)
    .input("expirationEmailEnabled", sql.Bit, input.expirationEmailEnabled)
    .input("expirationReminderLeadDays", sql.Int, input.expirationReminderLeadDays)
    .input("noticeEmailEnabled", sql.Bit, input.noticeEmailEnabled)
    .input("noticeReminderLeadDays", sql.Int, input.noticeReminderLeadDays)
    .query(`
      UPDATE dbo.TM_contract_user_settings
      SET expiring_soon_days = @expiringSoonDays,
          expiration_email_enabled = @expirationEmailEnabled,
          expiration_reminder_lead_days = @expirationReminderLeadDays,
          notice_email_enabled = @noticeEmailEnabled,
          notice_reminder_lead_days = @noticeReminderLeadDays,
          updated_at_utc = SYSUTCDATETIME()
      WHERE owner_user_id = @ownerUserId
        AND row_version = @rowVersion;
    `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}


export async function countActiveContractAttachments(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  contractId: number,
): Promise<number> {
  const result = await transaction
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("contractId", sql.BigInt, contractId)
    .query<CountRecord>(`
      SELECT COUNT_BIG(1) AS total
      FROM dbo.TM_contract_attachments WITH (UPDLOCK, HOLDLOCK)
      WHERE owner_user_id = @ownerUserId
        AND contract_id = @contractId
        AND is_active = 1;
    `);
  return Number(result.recordset[0]?.total ?? 0);
}

export async function listContractAttachments(
  ownerUserId: number,
  contractId: number,
): Promise<ContractAttachmentRecord[]> {
  const pool = await getDatabasePool();
  const result = await pool
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("contractId", sql.BigInt, contractId)
    .query<ContractAttachmentRecord>(`
      SELECT
        attachment.id,
        attachment.contract_id AS contractId,
        attachment.original_file_name AS originalFileName,
        attachment.storage_key AS storageKey,
        attachment.mime_type AS mimeType,
        attachment.file_extension AS fileExtension,
        attachment.size_bytes AS sizeBytes,
        attachment.created_at_utc AS createdAtUtc
      FROM dbo.TM_contract_attachments AS attachment
      INNER JOIN dbo.TM_contracts AS contract
        ON contract.id = attachment.contract_id
        AND contract.owner_user_id = attachment.owner_user_id
      WHERE attachment.owner_user_id = @ownerUserId
        AND attachment.contract_id = @contractId
        AND attachment.is_active = 1
      ORDER BY attachment.created_at_utc DESC, attachment.id DESC;
    `);
  return result.recordset;
}

export async function createContractAttachment(
  transaction: DatabaseTransaction,
  values: {
    ownerUserId: number;
    contractId: number;
    originalFileName: string;
    storageKey: string;
    mimeType: string;
    fileExtension: string;
    sizeBytes: number;
  },
): Promise<ContractAttachmentRecord | null> {
  const result = await transaction
    .request()
    .input("ownerUserId", sql.Int, values.ownerUserId)
    .input("contractId", sql.BigInt, values.contractId)
    .input("originalFileName", sql.NVarChar(260), values.originalFileName)
    .input("storageKey", sql.VarChar(500), values.storageKey)
    .input("mimeType", sql.VarChar(255), values.mimeType)
    .input("fileExtension", sql.VarChar(20), values.fileExtension)
    .input("sizeBytes", sql.BigInt, values.sizeBytes)
    .query<ContractAttachmentRecord>(`
      INSERT INTO dbo.TM_contract_attachments (
        owner_user_id,
        contract_id,
        original_file_name,
        storage_key,
        mime_type,
        file_extension,
        size_bytes,
        uploaded_by_user_id
      )
      OUTPUT
        inserted.id,
        inserted.contract_id AS contractId,
        inserted.original_file_name AS originalFileName,
        inserted.storage_key AS storageKey,
        inserted.mime_type AS mimeType,
        inserted.file_extension AS fileExtension,
        inserted.size_bytes AS sizeBytes,
        inserted.created_at_utc AS createdAtUtc
      VALUES (
        @ownerUserId,
        @contractId,
        @originalFileName,
        @storageKey,
        @mimeType,
        @fileExtension,
        @sizeBytes,
        @ownerUserId
      );
    `);
  return result.recordset[0] ?? null;
}

export async function findOwnedContractAttachment(
  ownerUserId: number,
  attachmentId: string,
  transaction?: DatabaseTransaction,
): Promise<ContractAttachmentRecord | null> {
  const request = transaction ? transaction.request() : (await getDatabasePool()).request();
  const result = await request
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("attachmentId", sql.UniqueIdentifier, attachmentId)
    .query<ContractAttachmentRecord>(`
      SELECT TOP (1)
        attachment.id,
        attachment.contract_id AS contractId,
        attachment.original_file_name AS originalFileName,
        attachment.storage_key AS storageKey,
        attachment.mime_type AS mimeType,
        attachment.file_extension AS fileExtension,
        attachment.size_bytes AS sizeBytes,
        attachment.created_at_utc AS createdAtUtc
      FROM dbo.TM_contract_attachments AS attachment
      INNER JOIN dbo.TM_contracts AS contract
        ON contract.id = attachment.contract_id
        AND contract.owner_user_id = attachment.owner_user_id
      WHERE attachment.id = @attachmentId
        AND attachment.owner_user_id = @ownerUserId
        AND attachment.is_active = 1;
    `);
  return result.recordset[0] ?? null;
}

export async function deactivateContractAttachment(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  attachmentId: string,
): Promise<boolean> {
  const result = await transaction
    .request()
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("attachmentId", sql.UniqueIdentifier, attachmentId)
    .query(`
      UPDATE dbo.TM_contract_attachments
      SET is_active = 0,
          updated_at_utc = SYSUTCDATETIME()
      WHERE id = @attachmentId
        AND owner_user_id = @ownerUserId
        AND is_active = 1;
    `);
  return Number(result.rowsAffected[0] ?? 0) === 1;
}

export const contractsRepository = {
  listContracts,
  getContractSummary,
  findOwnedContract,
  findOwnedContractForUpdate,
  createContract,
  updateContract,
  setContractActive,
  addContractActivity,
  listContractActivity,
  countActiveContractAttachments,
  listContractAttachments,
  createContractAttachment,
  findOwnedContractAttachment,
  deactivateContractAttachment,
  listSuppliers,
  findOwnedSupplier,
  findOwnedSupplierForUpdate,
  activeSupplierExists,
  supplierNameExists,
  createSupplier,
  updateSupplier,
  setSupplierActive,
  ensureContractSettings,
  getContractSettings,
  updateContractSettings,
};

