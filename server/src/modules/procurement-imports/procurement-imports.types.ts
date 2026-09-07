export type ImportMatchStatus = "MATCHED" | "NOT_FOUND" | "AMBIGUOUS";
export type ImportQuoteStatus =
  | "NEW_QUOTE"
  | "REPEATED_PRICE_NEW_DATE"
  | "PRICE_CHANGED"
  | "DUPLICATE_TODAY"
  | "INVALID_PRICE"
  | "ITEM_NOT_FOUND"
  | "ITEM_AMBIGUOUS"
  | "SUPPLIER_NOT_FOUND"
  | "SUPPLIER_AMBIGUOUS"
  | "UOM_MISSING"
  | "UOM_INVALID"
  | "DUPLICATE_ITEM_ROW"
  | "DUPLICATE_SUPPLIER_COLUMN";

export interface ProcurementImportSheetInfo {
  name: string;
  headerRow: number | null;
  itemCodeColumn: string | null;
  unitColumn: string | null;
  candidateSupplierColumns: number;
  dataRows: number;
  importable: boolean;
}

export interface ProcurementImportItemPreview {
  rowNumber: number;
  code: string;
  excelName: string | null;
  excelUnit: string | null;
  status: ImportMatchStatus;
  itemId: number | null;
  matchedCode: string | null;
  matchedName: string | null;
  duplicateInFile: boolean;
}

export interface ProcurementImportSupplierPreview {
  columnIndex: number;
  columnLetter: string;
  code: string;
  status: ImportMatchStatus;
  supplierId: number | null;
  matchedCode: string | null;
  matchedName: string | null;
  duplicateInFile: boolean;
}

export interface ProcurementImportQuotePreview {
  rowNumber: number;
  itemCode: string;
  supplierCode: string;
  itemId: number | null;
  supplierId: number | null;
  unitName: string | null;
  matchedUnitName: string | null;
  excelPrice: number | null;
  rawPrice: string | null;
  status: ImportQuoteStatus;
  existingQuoteId: number | null;
  existingQuoteDate: string | null;
  existingQuotedUnitCost: number | null;
}

export interface ProcurementImportPreviewSummary {
  itemRows: number;
  uniqueItemCodes: number;
  matchedItems: number;
  unmatchedItems: number;
  ambiguousItems: number;
  duplicateItemRows: number;
  supplierColumns: number;
  matchedSuppliers: number;
  unmatchedSuppliers: number;
  ambiguousSuppliers: number;
  duplicateSupplierColumns: number;
  quotePriceCells: number;
  newQuotes: number;
  repeatedPriceQuotes: number;
  changedPriceQuotes: number;
  duplicateTodayQuotes: number;
  invalidQuotes: number;
}

export interface ProcurementImportPreview {
  phase: "PREVIEW_ONLY";
  fileName: string;
  fileSizeBytes: number;
  fileSha256: string;
  availableSheets: ProcurementImportSheetInfo[];
  selectedSheet: string;
  headerRow: number;
  quoteDate: string;
  currencyCode: "SAR";
  items: ProcurementImportItemPreview[];
  suppliers: ProcurementImportSupplierPreview[];
  quotes: ProcurementImportQuotePreview[];
  summary: ProcurementImportPreviewSummary;
}

export interface ImportMasterRecord {
  id: number | string;
  code: string;
  name: string;
}

export interface ImportSupplierNameMatchRecord extends ImportMasterRecord {
  requestedName: string;
}

export interface ImportAllowedUnitRecord {
  itemId: number | string;
  unitName: string;
}

export interface ImportQuoteCandidate {
  key: string;
  itemId: number;
  supplierId: number;
  unitName: string;
  quotedUnitCost: number;
}

export interface ImportQuoteHistoryRecord {
  key: string;
  duplicateQuoteId: number | string | null;
  latestQuoteId: number | string | null;
  latestQuoteDate: Date | null;
  latestQuotedUnitCost: number | string | null;
  latestPriceMatches: boolean | number | null;
}

export type ProcurementImportTargetMode = "EXISTING_VIEW" | "NEW_VIEW";

export interface ProcurementImportApplyInput {
  sheetName?: string;
  targetMode: ProcurementImportTargetMode;
  targetSavedViewId?: number;
  newViewName?: string;
}

export interface ProcurementImportApplyResult {
  phase: "APPLIED";
  importBatchId: number;
  targetMode: ProcurementImportTargetMode;
  savedViewId: number;
  savedViewName: string;
  quoteDate: string;
  currencyCode: "SAR";
  fileName: string;
  fileSha256: string;
  matchedItems: number;
  addedItems: number;
  matchedSuppliers: number;
  addedSuppliers: number;
  createdQuotes: number;
  duplicateQuotesSkipped: number;
  invalidQuotesSkipped: number;
}

export interface ProcurementImportBatchInput {
  ownerUserId: number;
  sourceFileName: string;
  sourceFileSha256: string;
  sourceFileSizeBytes: number;
  sourceSheetName: string;
  targetMode: ProcurementImportTargetMode;
  targetSavedViewId: number;
  targetViewNameSnapshot: string;
  quoteDate: string;
  matchedItemCount: number;
  addedItemCount: number;
  matchedSupplierCount: number;
  addedSupplierCount: number;
  duplicateQuoteCount: number;
  skippedInvalidCount: number;
}

export interface ProcurementImportedQuoteCandidate {
  itemId: number;
  supplierId: number;
  unitName: string;
  quotedUnitCost: number;
}

