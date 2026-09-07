import { createHash } from "node:crypto";

import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { mapSavedView } from "../procurement-saved-views/procurement-saved-views.mapper.js";
import { procurementSavedViewsRepository as savedViewsRepository } from "../procurement-saved-views/procurement-saved-views.repository.js";
import type { ProcurementSavedViewInput } from "../procurement-saved-views/procurement-saved-views.types.js";
import { procurementImportsRepository as repository } from "./procurement-imports.repository.js";
import type {
  ImportMasterRecord,
  ImportQuoteCandidate,
  ImportQuoteHistoryRecord,
  ImportSupplierNameMatchRecord,
  ProcurementImportApplyInput,
  ProcurementImportApplyResult,
  ProcurementImportedQuoteCandidate,
  ProcurementImportItemPreview,
  ProcurementImportPreview,
  ProcurementImportPreviewSummary,
  ProcurementImportQuotePreview,
  ProcurementImportSheetInfo,
  ProcurementImportSupplierPreview,
} from "./procurement-imports.types.js";
import {
  parseXlsxWorkbook,
  type ExcelCellValue,
  type ParsedExcelCell,
  type ParsedExcelSheet,
} from "./procurement-imports-xlsx.js";

const MAX_HEADER_SCAN_ROWS = 20;
const MAX_ITEM_ROWS = 1000;
const MAX_SUPPLIER_COLUMNS = 100;
const MAX_QUOTE_PRICE_CELLS = 20_000;
const MAX_SAVED_VIEW_ITEMS = 1000;
const MAX_SAVED_VIEW_SUPPLIERS = 500;
const MAX_PRICE = 9_999_999_999_999;

const ITEM_CODE_HEADERS = new Set(["CODE", "ITEMCODE", "ITEMNO", "ITEMNUMBER"]);
const ITEM_NAME_HEADERS = new Set(["ITEMNAME", "NAME", "DESCRIPTION", "ITEMDESCRIPTION"]);
const UNIT_HEADERS = new Set(["UNIT", "UOM", "UNITNAME", "UNITOFMEASURE", "UNITMEASURE"]);
const QTY_HEADERS = new Set(["QTY", "QUANTITY"]);
const INDEX_HEADERS = new Set(["#", "NO", "NUMBER", "SN", "SNO", "SRNO", "SERIAL"]);

interface SheetLayout {
  sheet: ParsedExcelSheet;
  headerRowIndex: number;
  itemCodeIndex: number;
  itemNameIndex: number | null;
  unitIndex: number | null;
  supplierColumns: Array<{ index: number; code: string }>;
  dataRows: number;
}

interface PreparedQuote {
  key: string;
  previewIndex: number;
  candidate: ImportQuoteCandidate;
}

function importError(code: string, message: string, details?: unknown): AppError {
  return new AppError({
    statusCode: 400,
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cellText(value: ExcelCellValue): string | null {
  if (value === null) return null;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  const normalized = normalizeWhitespace(value);
  return normalized || null;
}

function normalizeCode(value: string): string {
  return normalizeWhitespace(value).toUpperCase();
}

function oneLeadingZeroItemCodeFallback(value: string): string | null {
  const normalized = normalizeCode(value);
  if (!/^\d+$/.test(normalized) || normalized.startsWith("0")) return null;
  return `0${normalized}`;
}

function codeFromCell(cell: ParsedExcelCell | undefined): string | null {
  const text = cellText(cell?.value ?? null);
  if (!text) return null;
  const decimalInteger = /^([+-]?\d+)\.0+$/.exec(text);
  return normalizeWhitespace(decimalInteger?.[1] ?? text);
}

function normalizeHeader(value: string): string {
  const trimmed = normalizeWhitespace(value).toUpperCase();
  if (trimmed === "#") return "#";
  return trimmed.replace(/[\s._\-/:()]+/g, "");
}

function columnLetter(index: number): string {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function rowAt(sheet: ParsedExcelSheet, index: number): ParsedExcelCell[] {
  return sheet.rows[index] ?? [];
}

function analyzeSheet(sheet: ParsedExcelSheet): SheetLayout | null {
  const scanLimit = Math.min(sheet.rows.length, MAX_HEADER_SCAN_ROWS);
  let best: SheetLayout | null = null;

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = rowAt(sheet, rowIndex);
    let itemCodeIndex: number | null = null;
    let itemNameIndex: number | null = null;
    let unitIndex: number | null = null;
    const recognized = new Set<number>();

    for (let index = 0; index < row.length; index += 1) {
      const text = cellText(row[index]?.value ?? null);
      if (!text) continue;
      const header = normalizeHeader(text);
      if (ITEM_CODE_HEADERS.has(header) && itemCodeIndex === null) {
        itemCodeIndex = index;
        recognized.add(index);
      } else if ((ITEM_NAME_HEADERS.has(header) || header.startsWith("ITEMNAME")) && itemNameIndex === null) {
        itemNameIndex = index;
        recognized.add(index);
      } else if (UNIT_HEADERS.has(header) && unitIndex === null) {
        unitIndex = index;
        recognized.add(index);
      } else if (QTY_HEADERS.has(header) || INDEX_HEADERS.has(header)) {
        recognized.add(index);
      }
    }

    if (itemCodeIndex === null) continue;

    const supplierColumns: Array<{ index: number; code: string }> = [];
    for (let index = 0; index < row.length; index += 1) {
      if (recognized.has(index)) continue;
      const code = codeFromCell(row[index]);
      if (code) supplierColumns.push({ index, code });
    }

    let dataRows = 0;
    for (let dataIndex = rowIndex + 1; dataIndex < sheet.rows.length; dataIndex += 1) {
      if (codeFromCell(rowAt(sheet, dataIndex)[itemCodeIndex])) dataRows += 1;
    }

    const candidate: SheetLayout = {
      sheet,
      headerRowIndex: rowIndex,
      itemCodeIndex,
      itemNameIndex,
      unitIndex,
      supplierColumns,
      dataRows,
    };

    if (
      best === null
      || candidate.supplierColumns.length > best.supplierColumns.length
      || (
        candidate.supplierColumns.length === best.supplierColumns.length
        && candidate.dataRows > best.dataRows
      )
    ) {
      best = candidate;
    }
  }

  return best;
}

function sheetInfo(sheet: ParsedExcelSheet): ProcurementImportSheetInfo {
  const layout = analyzeSheet(sheet);
  return {
    name: sheet.name,
    headerRow: layout ? layout.headerRowIndex + 1 : null,
    itemCodeColumn: layout ? columnLetter(layout.itemCodeIndex) : null,
    unitColumn: layout?.unitIndex === null || layout?.unitIndex === undefined ? null : columnLetter(layout.unitIndex),
    candidateSupplierColumns: layout?.supplierColumns.length ?? 0,
    dataRows: layout?.dataRows ?? 0,
    importable: Boolean(layout && layout.supplierColumns.length > 0 && layout.dataRows > 0),
  };
}

function chooseLayout(sheets: ParsedExcelSheet[], requestedSheetName?: string): {
  layout: SheetLayout;
  availableSheets: ProcurementImportSheetInfo[];
} {
  const availableSheets = sheets.map(sheetInfo);
  if (requestedSheetName) {
    const requested = sheets.find((sheet) => sheet.name === requestedSheetName);
    if (!requested) {
      throw importError("PROCUREMENT_IMPORT_SHEET_NOT_FOUND", "The requested worksheet does not exist in this workbook.", {
        requestedSheetName,
        availableSheets: availableSheets.map((entry) => entry.name),
      });
    }
    const layout = analyzeSheet(requested);
    if (!layout || layout.supplierColumns.length === 0 || layout.dataRows === 0) {
      throw importError(
        "PROCUREMENT_IMPORT_SHEET_NOT_IMPORTABLE",
        "The selected worksheet must contain an Item Code column, at least one Supplier-reference column, and Item rows.",
      );
    }
    return { layout, availableSheets };
  }

  const layouts = sheets
    .map((sheet) => analyzeSheet(sheet))
    .filter((layout): layout is SheetLayout => Boolean(layout && layout.supplierColumns.length > 0 && layout.dataRows > 0))
    .sort((left, right) => (
      right.supplierColumns.length - left.supplierColumns.length
      || right.dataRows - left.dataRows
      || left.headerRowIndex - right.headerRowIndex
    ));

  const layout = layouts[0];
  if (!layout) {
    throw importError(
      "PROCUREMENT_IMPORT_NO_IMPORTABLE_SHEET",
      "No worksheet contains an Item Code column, Supplier-reference columns, and Item rows.",
      { availableSheets },
    );
  }
  return { layout, availableSheets };
}

function groupMatches(records: ImportMasterRecord[]): Map<string, ImportMasterRecord[]> {
  const grouped = new Map<string, ImportMasterRecord[]>();
  for (const record of records) {
    const key = normalizeCode(record.code);
    const current = grouped.get(key) ?? [];
    current.push(record);
    grouped.set(key, current);
  }
  return grouped;
}

function groupSupplierNameMatches(records: ImportSupplierNameMatchRecord[]): Map<string, ImportMasterRecord[]> {
  const grouped = new Map<string, ImportMasterRecord[]>();
  for (const record of records) {
    const key = normalizeCode(record.requestedName);
    const current = grouped.get(key) ?? [];
    current.push(record);
    grouped.set(key, current);
  }
  return grouped;
}

function matchedItem(
  rowNumber: number,
  code: string,
  excelName: string | null,
  excelUnit: string | null,
  duplicateInFile: boolean,
  matches: ImportMasterRecord[],
): ProcurementImportItemPreview {
  if (matches.length === 1) {
    const record = matches[0]!;
    return {
      rowNumber,
      code,
      excelName,
      excelUnit,
      status: "MATCHED",
      itemId: Number(record.id),
      matchedCode: record.code,
      matchedName: record.name,
      duplicateInFile,
    };
  }
  return {
    rowNumber,
    code,
    excelName,
    excelUnit,
    status: matches.length === 0 ? "NOT_FOUND" : "AMBIGUOUS",
    itemId: null,
    matchedCode: null,
    matchedName: null,
    duplicateInFile,
  };
}

function matchedSupplier(
  index: number,
  code: string,
  duplicateInFile: boolean,
  matches: ImportMasterRecord[],
): ProcurementImportSupplierPreview {
  if (matches.length === 1) {
    const record = matches[0]!;
    return {
      columnIndex: index + 1,
      columnLetter: columnLetter(index),
      code,
      status: "MATCHED",
      supplierId: Number(record.id),
      matchedCode: record.code,
      matchedName: record.name,
      duplicateInFile,
    };
  }
  return {
    columnIndex: index + 1,
    columnLetter: columnLetter(index),
    code,
    status: matches.length === 0 ? "NOT_FOUND" : "AMBIGUOUS",
    supplierId: null,
    matchedCode: null,
    matchedName: null,
    duplicateInFile,
  };
}

function cleanUnit(value: string | null): string | null {
  if (!value) return null;
  const unit = normalizeWhitespace(value);
  return unit || null;
}

function priceFromCell(cell: ParsedExcelCell | undefined): {
  blank: boolean;
  price: number | null;
  rawPrice: string | null;
} {
  if (!cell) return { blank: true, price: null, rawPrice: null };
  if (cell.value === null) {
    return cell.formula
      ? { blank: false, price: null, rawPrice: `=${cell.formula}` }
      : { blank: true, price: null, rawPrice: null };
  }

  const rawPrice = cellText(cell.value);
  if (!rawPrice) return { blank: true, price: null, rawPrice: null };
  if (["-", "—", "–"].includes(rawPrice)) return { blank: true, price: null, rawPrice };

  if (
    typeof cell.value === "number"
    && cell.value === 0
    && cell.formula
    && /IFERROR/i.test(cell.formula)
    && /["']-["']/.test(cell.formula)
  ) {
    return { blank: true, price: null, rawPrice };
  }

  const numeric = typeof cell.value === "number"
    ? cell.value
    : /^[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(rawPrice)
      ? Number(rawPrice.replace(/,/g, ""))
      : Number.NaN;

  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_PRICE) {
    return { blank: false, price: null, rawPrice };
  }

  return { blank: false, price: Number(numeric.toFixed(6)), rawPrice };
}

function invalidQuoteStatus(item: ProcurementImportItemPreview, supplier: ProcurementImportSupplierPreview, unit: string | null): ProcurementImportQuotePreview["status"] | null {
  if (item.duplicateInFile) return "DUPLICATE_ITEM_ROW";
  if (supplier.duplicateInFile) return "DUPLICATE_SUPPLIER_COLUMN";
  if (item.status === "NOT_FOUND") return "ITEM_NOT_FOUND";
  if (item.status === "AMBIGUOUS") return "ITEM_AMBIGUOUS";
  if (supplier.status === "NOT_FOUND") return "SUPPLIER_NOT_FOUND";
  if (supplier.status === "AMBIGUOUS") return "SUPPLIER_AMBIGUOUS";
  if (!unit) return "UOM_MISSING";
  return null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function historyByKey(records: ImportQuoteHistoryRecord[]): Map<string, ImportQuoteHistoryRecord> {
  return new Map(records.map((record) => [record.key, record]));
}

function buildSummary(
  items: ProcurementImportItemPreview[],
  suppliers: ProcurementImportSupplierPreview[],
  quotes: ProcurementImportQuotePreview[],
  quotePriceCells: number,
): ProcurementImportPreviewSummary {
  const uniqueItemCodes = new Set(items.map((item) => normalizeCode(item.code))).size;
  const validCreateStatuses = new Set(["NEW_QUOTE", "REPEATED_PRICE_NEW_DATE", "PRICE_CHANGED"]);
  return {
    itemRows: items.length,
    uniqueItemCodes,
    matchedItems: new Set(items.filter((item) => item.status === "MATCHED").map((item) => item.itemId)).size,
    unmatchedItems: new Set(items.filter((item) => item.status === "NOT_FOUND").map((item) => normalizeCode(item.code))).size,
    ambiguousItems: new Set(items.filter((item) => item.status === "AMBIGUOUS").map((item) => normalizeCode(item.code))).size,
    duplicateItemRows: items.filter((item) => item.duplicateInFile).length,
    supplierColumns: suppliers.length,
    matchedSuppliers: new Set(suppliers.filter((supplier) => supplier.status === "MATCHED").map((supplier) => supplier.supplierId)).size,
    unmatchedSuppliers: new Set(suppliers.filter((supplier) => supplier.status === "NOT_FOUND").map((supplier) => normalizeCode(supplier.code))).size,
    ambiguousSuppliers: new Set(suppliers.filter((supplier) => supplier.status === "AMBIGUOUS").map((supplier) => normalizeCode(supplier.code))).size,
    duplicateSupplierColumns: suppliers.filter((supplier) => supplier.duplicateInFile).length,
    quotePriceCells,
    newQuotes: quotes.filter((quote) => quote.status === "NEW_QUOTE").length,
    repeatedPriceQuotes: quotes.filter((quote) => quote.status === "REPEATED_PRICE_NEW_DATE").length,
    changedPriceQuotes: quotes.filter((quote) => quote.status === "PRICE_CHANGED").length,
    duplicateTodayQuotes: quotes.filter((quote) => quote.status === "DUPLICATE_TODAY").length,
    invalidQuotes: quotes.filter((quote) => !validCreateStatuses.has(quote.status) && quote.status !== "DUPLICATE_TODAY").length,
  };
}

const APPLYABLE_QUOTE_STATUSES = new Set<ProcurementImportQuotePreview["status"]>([
  "NEW_QUOTE",
  "REPEATED_PRICE_NEW_DATE",
  "PRICE_CHANGED",
]);

function uniqueMatchedItemIds(preview: ProcurementImportPreview): number[] {
  return [...new Set(preview.items.flatMap((item) => (
    item.status === "MATCHED" && item.itemId !== null ? [item.itemId] : []
  )))];
}

function uniqueMatchedSupplierIds(preview: ProcurementImportPreview): number[] {
  return [...new Set(preview.suppliers.flatMap((supplier) => (
    supplier.status === "MATCHED" && supplier.supplierId !== null ? [supplier.supplierId] : []
  )))];
}

function applyableQuoteCandidates(preview: ProcurementImportPreview): ProcurementImportedQuoteCandidate[] {
  const unique = new Map<string, ProcurementImportedQuoteCandidate>();

  for (const quote of preview.quotes) {
    if (
      !APPLYABLE_QUOTE_STATUSES.has(quote.status)
      || quote.itemId === null
      || quote.supplierId === null
      || quote.matchedUnitName === null
      || quote.excelPrice === null
    ) {
      continue;
    }

    const candidate: ProcurementImportedQuoteCandidate = {
      itemId: quote.itemId,
      supplierId: quote.supplierId,
      unitName: quote.matchedUnitName,
      quotedUnitCost: quote.excelPrice,
    };
    const key = [
      candidate.itemId,
      candidate.supplierId,
      normalizeCode(candidate.unitName),
      candidate.quotedUnitCost.toFixed(6),
    ].join("|");
    if (!unique.has(key)) unique.set(key, candidate);
  }

  return [...unique.values()];
}

function mergedIds(existing: number[], imported: number[]): number[] {
  return [...new Set([...existing, ...imported])];
}

function newSavedViewInput(itemIds: number[], supplierIds: number[], name: string): ProcurementSavedViewInput {
  return {
    name,
    config: {
      itemIds,
      supplierIds,
      period: "1Y",
      category: null,
      source: null,
      statusCode: null,
      sortBy: "name",
      sortDirection: "asc",
      columns: [],
      matrixPriceSource: "actual",
      matrixMetric: "latest",
    },
    isDefault: false,
  };
}

export const procurementImportsService = {
  async preview(
    ownerUserId: number,
    file: Express.Multer.File,
    requestedSheetName?: string,
  ): Promise<ProcurementImportPreview> {
    const workbook = parseXlsxWorkbook(file.buffer);
    const { layout, availableSheets } = chooseLayout(workbook.sheets, requestedSheetName);

    if (layout.dataRows > MAX_ITEM_ROWS) {
      throw importError("PROCUREMENT_IMPORT_TOO_MANY_ITEMS", `A Procurement import can contain at most ${MAX_ITEM_ROWS} Item rows.`);
    }
    if (layout.supplierColumns.length > MAX_SUPPLIER_COLUMNS) {
      throw importError("PROCUREMENT_IMPORT_TOO_MANY_SUPPLIERS", `A Procurement import can contain at most ${MAX_SUPPLIER_COLUMNS} Supplier columns.`);
    }

    const rawRows: Array<{
      rowNumber: number;
      code: string;
      excelName: string | null;
      excelUnit: string | null;
      row: ParsedExcelCell[];
      duplicateInFile: boolean;
    }> = [];
    const seenItemCodes = new Set<string>();

    for (let rowIndex = layout.headerRowIndex + 1; rowIndex < layout.sheet.rows.length; rowIndex += 1) {
      const row = rowAt(layout.sheet, rowIndex);
      const code = codeFromCell(row[layout.itemCodeIndex]);
      if (!code) continue;
      const key = normalizeCode(code);
      const duplicateInFile = seenItemCodes.has(key);
      seenItemCodes.add(key);
      rawRows.push({
        rowNumber: rowIndex + 1,
        code,
        excelName: layout.itemNameIndex === null ? null : cellText(row[layout.itemNameIndex]?.value ?? null),
        excelUnit: layout.unitIndex === null ? null : cellText(row[layout.unitIndex]?.value ?? null),
        row,
        duplicateInFile,
      });
    }

    const itemCodes = [...new Set(rawRows.flatMap((row) => {
      const exactCode = normalizeCode(row.code);
      const fallbackCode = oneLeadingZeroItemCodeFallback(exactCode);
      return fallbackCode ? [exactCode, fallbackCode] : [exactCode];
    }))];
    const supplierReferences = [...new Set(layout.supplierColumns.map((supplier) => normalizeCode(supplier.code)))];
    const [itemRecords, supplierCodeRecords] = await Promise.all([
      repository.resolveItemsByCodes(itemCodes),
      repository.resolveSuppliersByCodes(supplierReferences),
    ]);
    const itemMatches = groupMatches(itemRecords);
    const supplierCodeMatches = groupMatches(supplierCodeRecords);
    const unresolvedSupplierReferences = supplierReferences.filter(
      (reference) => (supplierCodeMatches.get(reference) ?? []).length === 0,
    );
    const supplierNameMatches = groupSupplierNameMatches(
      await repository.resolveSuppliersByNames(unresolvedSupplierReferences),
    );

    const items = rawRows.map((row) => {
      const exactCode = normalizeCode(row.code);
      const exactMatches = itemMatches.get(exactCode) ?? [];
      const fallbackCode = exactMatches.length === 0
        ? oneLeadingZeroItemCodeFallback(exactCode)
        : null;
      const matches = exactMatches.length > 0
        ? exactMatches
        : fallbackCode
          ? (itemMatches.get(fallbackCode) ?? [])
          : [];

      return matchedItem(
        row.rowNumber,
        row.code,
        row.excelName,
        row.excelUnit,
        row.duplicateInFile,
        matches,
      );
    });
    const seenSupplierReferences = new Set<string>();
    const suppliers = layout.supplierColumns.map((supplier) => {
      const key = normalizeCode(supplier.code);
      const duplicateInFile = seenSupplierReferences.has(key);
      seenSupplierReferences.add(key);
      const exactCodeMatches = supplierCodeMatches.get(key) ?? [];
      const matches = exactCodeMatches.length > 0
        ? exactCodeMatches
        : (supplierNameMatches.get(key) ?? []);
      return matchedSupplier(
        supplier.index,
        supplier.code,
        duplicateInFile,
        matches,
      );
    });

    const matchedItemIds = [...new Set(items.flatMap((item) => item.itemId === null ? [] : [item.itemId]))];
    const allowedUnitRows = await repository.listAllowedUnits(matchedItemIds);
    const allowedUnits = new Map<number, Map<string, string>>();
    for (const row of allowedUnitRows) {
      const itemId = Number(row.itemId);
      const unit = cleanUnit(row.unitName);
      if (!unit) continue;
      const itemUnits = allowedUnits.get(itemId) ?? new Map<string, string>();
      const normalized = normalizeCode(unit);
      if (!itemUnits.has(normalized)) itemUnits.set(normalized, unit);
      allowedUnits.set(itemId, itemUnits);
    }

    const itemByRow = new Map(items.map((item) => [item.rowNumber, item]));
    const supplierByColumn = new Map(suppliers.map((supplier) => [supplier.columnIndex - 1, supplier]));
    const quotes: ProcurementImportQuotePreview[] = [];
    const prepared: PreparedQuote[] = [];
    let quotePriceCells = 0;

    for (const rawRow of rawRows) {
      const item = itemByRow.get(rawRow.rowNumber)!;
      const excelUnit = cleanUnit(rawRow.excelUnit);

      for (const supplierColumn of layout.supplierColumns) {
        const priceResult = priceFromCell(rawRow.row[supplierColumn.index]);
        if (priceResult.blank) continue;
        quotePriceCells += 1;
        if (quotePriceCells > MAX_QUOTE_PRICE_CELLS) {
          throw importError("PROCUREMENT_IMPORT_TOO_MANY_QUOTES", `A Procurement import can contain at most ${MAX_QUOTE_PRICE_CELLS} non-empty Quote price cells.`);
        }

        const supplier = supplierByColumn.get(supplierColumn.index)!;
        let status = invalidQuoteStatus(item, supplier, excelUnit);
        let matchedUnitName: string | null = null;

        if (!status && priceResult.price === null) status = "INVALID_PRICE";
        if (!status && item.itemId !== null && excelUnit) {
          matchedUnitName = allowedUnits.get(item.itemId)?.get(normalizeCode(excelUnit)) ?? null;
          if (!matchedUnitName) status = "UOM_INVALID";
        }

        const previewIndex = quotes.length;
        quotes.push({
          rowNumber: rawRow.rowNumber,
          itemCode: item.code,
          supplierCode: supplier.code,
          itemId: item.itemId,
          supplierId: supplier.supplierId,
          unitName: excelUnit,
          matchedUnitName,
          excelPrice: priceResult.price,
          rawPrice: priceResult.rawPrice,
          status: status ?? "NEW_QUOTE",
          existingQuoteId: null,
          existingQuoteDate: null,
          existingQuotedUnitCost: null,
        });

        if (
          !status
          && priceResult.price !== null
          && item.itemId !== null
          && supplier.supplierId !== null
          && matchedUnitName
        ) {
          const key = `Q${prepared.length + 1}`;
          prepared.push({
            key,
            previewIndex,
            candidate: {
              key,
              itemId: item.itemId,
              supplierId: supplier.supplierId,
              unitName: matchedUnitName,
              quotedUnitCost: priceResult.price,
            },
          });
        }
      }
    }

    const quoteDate = getCurrentDateInAppTimeZone();
    const histories = historyByKey(await repository.inspectQuoteHistory(
      ownerUserId,
      quoteDate,
      prepared.map((entry) => entry.candidate),
    ));

    for (const entry of prepared) {
      const quote = quotes[entry.previewIndex];
      if (!quote) continue;
      const history = histories.get(entry.key);
      if (!history) continue;

      quote.existingQuoteId = history.duplicateQuoteId !== null
        ? Number(history.duplicateQuoteId)
        : history.latestQuoteId !== null
          ? Number(history.latestQuoteId)
          : null;
      quote.existingQuoteDate = history.duplicateQuoteId !== null
        ? quoteDate
        : dateOnly(history.latestQuoteDate);
      quote.existingQuotedUnitCost = history.duplicateQuoteId !== null
        ? entry.candidate.quotedUnitCost
        : history.latestQuotedUnitCost === null
          ? null
          : Number(history.latestQuotedUnitCost);

      if (history.duplicateQuoteId !== null) {
        quote.status = "DUPLICATE_TODAY";
      } else if (history.latestQuoteId === null || history.latestQuotedUnitCost === null) {
        quote.status = "NEW_QUOTE";
      } else if (Boolean(history.latestPriceMatches)) {
        quote.status = "REPEATED_PRICE_NEW_DATE";
      } else {
        quote.status = "PRICE_CHANGED";
      }
    }

    return {
      phase: "PREVIEW_ONLY",
      fileName: file.originalname,
      fileSizeBytes: file.size,
      fileSha256: createHash("sha256").update(file.buffer).digest("hex"),
      availableSheets,
      selectedSheet: layout.sheet.name,
      headerRow: layout.headerRowIndex + 1,
      quoteDate,
      currencyCode: "SAR",
      items,
      suppliers,
      quotes,
      summary: buildSummary(items, suppliers, quotes, quotePriceCells),
    };
  },

  async apply(
    ownerUserId: number,
    file: Express.Multer.File,
    input: ProcurementImportApplyInput,
  ): Promise<ProcurementImportApplyResult> {
    if (!(await repository.isApplyFoundationReady())) {
      throw new AppError({
        statusCode: 503,
        code: "PROCUREMENT_IMPORT_FOUNDATION_NOT_READY",
        message: "Apply migration 032_add_procurement_excel_import_foundation.sql before using Excel Import.",
      });
    }

    const preview = await this.preview(ownerUserId, file, input.sheetName);
    const importedItemIds = uniqueMatchedItemIds(preview);
    const importedSupplierIds = uniqueMatchedSupplierIds(preview);
    const quoteCandidates = applyableQuoteCandidates(preview);

    if (importedItemIds.length === 0 && importedSupplierIds.length === 0) {
      throw importError(
        "PROCUREMENT_IMPORT_NOTHING_TO_APPLY",
        "No Item codes or Supplier references in this workbook matched TaskHub master data.",
      );
    }

    return withTransaction(async (transaction) => {
      let savedViewId: number;
      let savedViewName: string;
      let addedItems = importedItemIds.length;
      let addedSuppliers = importedSupplierIds.length;

      if (input.targetMode === "EXISTING_VIEW") {
        if (input.targetSavedViewId === undefined) {
          throw importError("PROCUREMENT_IMPORT_TARGET_VIEW_REQUIRED", "Choose an existing Saved View.");
        }

        const currentRecord = await savedViewsRepository.findSavedView(
          ownerUserId,
          input.targetSavedViewId,
          transaction,
        );
        if (!currentRecord) {
          throw new AppError({
            statusCode: 404,
            code: "SAVED_VIEW_NOT_FOUND",
            message: "Saved View was not found.",
          });
        }

        const current = mapSavedView(currentRecord);
        const existingItemIds = new Set(current.config.itemIds);
        const existingSupplierIds = new Set(current.config.supplierIds);
        addedItems = importedItemIds.filter((id) => !existingItemIds.has(id)).length;
        addedSuppliers = importedSupplierIds.filter((id) => !existingSupplierIds.has(id)).length;

        const nextItemIds = mergedIds(current.config.itemIds, importedItemIds);
        const nextSupplierIds = mergedIds(current.config.supplierIds, importedSupplierIds);
        if (nextItemIds.length > MAX_SAVED_VIEW_ITEMS || nextSupplierIds.length > MAX_SAVED_VIEW_SUPPLIERS) {
          throw importError(
            "PROCUREMENT_IMPORT_SAVED_VIEW_LIMIT_EXCEEDED",
            `The import would exceed the Saved View limit of ${MAX_SAVED_VIEW_ITEMS} Items or ${MAX_SAVED_VIEW_SUPPLIERS} Suppliers.`,
          );
        }

        const nextInput: ProcurementSavedViewInput = {
          name: current.name,
          isDefault: current.isDefault,
          config: {
            ...current.config,
            itemIds: nextItemIds,
            supplierIds: nextSupplierIds,
          },
        };

        if (addedItems > 0 || addedSuppliers > 0) {
          const updated = await savedViewsRepository.updateSavedView(
            transaction,
            ownerUserId,
            current.id,
            nextInput,
            current.rowVersion,
          );
          if (!updated) {
            throw new AppError({
              statusCode: 409,
              code: "SAVED_VIEW_STALE",
              message: "Saved View changed while the Excel import was being applied. Reload and try again.",
            });
          }
        }

        savedViewId = current.id;
        savedViewName = current.name;
      } else {
        const viewName = input.newViewName?.trim();
        if (!viewName) {
          throw importError("PROCUREMENT_IMPORT_NEW_VIEW_NAME_REQUIRED", "Enter a name for the new Saved View.");
        }
        const viewInput = newSavedViewInput(importedItemIds, importedSupplierIds, viewName);
        savedViewId = await savedViewsRepository.createSavedView(
          transaction,
          ownerUserId,
          viewInput,
        );
        savedViewName = viewName;
      }

      const batchId = await repository.createImportBatch(transaction, {
        ownerUserId,
        sourceFileName: file.originalname.trim().slice(0, 260) || "Procurement Import.xlsx",
        sourceFileSha256: preview.fileSha256,
        sourceFileSizeBytes: file.size,
        sourceSheetName: preview.selectedSheet,
        targetMode: input.targetMode,
        targetSavedViewId: savedViewId,
        targetViewNameSnapshot: savedViewName,
        quoteDate: preview.quoteDate,
        matchedItemCount: importedItemIds.length,
        addedItemCount: addedItems,
        matchedSupplierCount: importedSupplierIds.length,
        addedSupplierCount: addedSuppliers,
        duplicateQuoteCount: preview.summary.duplicateTodayQuotes,
        skippedInvalidCount: preview.summary.invalidQuotes,
      });

      const createdQuotes = await repository.createImportedQuotes(
        transaction,
        ownerUserId,
        batchId,
        preview.quoteDate,
        quoteCandidates,
      );
      const concurrentDuplicates = Math.max(0, quoteCandidates.length - createdQuotes);
      const duplicateQuotesSkipped = preview.summary.duplicateTodayQuotes + concurrentDuplicates;

      await repository.updateImportBatchCounts(
        transaction,
        batchId,
        ownerUserId,
        createdQuotes,
        duplicateQuotesSkipped,
      );

      return {
        phase: "APPLIED",
        importBatchId: batchId,
        targetMode: input.targetMode,
        savedViewId,
        savedViewName,
        quoteDate: preview.quoteDate,
        currencyCode: "SAR",
        fileName: preview.fileName,
        fileSha256: preview.fileSha256,
        matchedItems: importedItemIds.length,
        addedItems,
        matchedSuppliers: importedSupplierIds.length,
        addedSuppliers,
        createdQuotes,
        duplicateQuotesSkipped,
        invalidQuotesSkipped: preview.summary.invalidQuotes,
      };
    });
  },
};

