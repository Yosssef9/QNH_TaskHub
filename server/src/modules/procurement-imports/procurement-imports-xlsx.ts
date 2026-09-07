import { inflateRawSync } from "node:zlib";

import { AppError } from "../../shared/errors/app-error.js";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const MAX_ZIP_ENTRIES = 2000;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;

export type ExcelCellValue = string | number | boolean | null;

export interface ParsedExcelCell {
  value: ExcelCellValue;
  formula: string | null;
}

export interface ParsedExcelSheet {
  name: string;
  rows: ParsedExcelCell[][];
}

export interface ParsedExcelWorkbook {
  sheets: ParsedExcelSheet[];
}

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function invalidWorkbook(message: string, details?: unknown): AppError {
  return new AppError({
    statusCode: 400,
    code: "PROCUREMENT_IMPORT_WORKBOOK_INVALID",
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function safeCodePoint(value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : "�";
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, digits: string) => safeCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, digits: string) => safeCodePoint(Number.parseInt(digits, 16)));
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw invalidWorkbook("The uploaded XLSX file is not a valid ZIP-based Excel workbook.");
}

function readZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  if (buffer.length < 22) throw invalidWorkbook("The uploaded XLSX file is incomplete.");

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    throw invalidWorkbook("ZIP64 XLSX workbooks are not supported for Procurement imports.");
  }
  if (entryCount > MAX_ZIP_ENTRIES) {
    throw invalidWorkbook("The workbook contains too many ZIP entries.");
  }
  if (centralDirectoryOffset + centralDirectorySize > buffer.length) {
    throw invalidWorkbook("The workbook ZIP directory is corrupt.");
  }

  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_FILE_HEADER) {
      throw invalidWorkbook("The workbook ZIP directory contains an invalid file entry.");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;

    if (nameEnd > buffer.length) throw invalidWorkbook("The workbook ZIP directory contains a truncated file name.");
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8").replace(/\\/g, "/");

    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throw invalidWorkbook("The workbook contains an entry that is too large to import safely.", { entry: name });
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw invalidWorkbook("The workbook expands beyond the allowed import size.");
    }

    entries.set(name, { name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER) {
    throw invalidWorkbook("The workbook contains an invalid local ZIP entry.", { entry: entry.name });
  }
  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw invalidWorkbook("The workbook contains a truncated ZIP entry.", { entry: entry.name });

  const compressed = buffer.subarray(dataStart, dataEnd);
  let output: Buffer;
  if (entry.compressionMethod === 0) {
    output = Buffer.from(compressed);
  } else if (entry.compressionMethod === 8) {
    try {
      output = inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_UNCOMPRESSED_BYTES });
    } catch {
      throw invalidWorkbook("An XLSX workbook entry could not be decompressed.", { entry: entry.name });
    }
  } else {
    throw invalidWorkbook("The workbook uses an unsupported ZIP compression method.", {
      entry: entry.name,
      method: entry.compressionMethod,
    });
  }

  if (output.length > MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw invalidWorkbook("The workbook contains an entry that is too large to import safely.", { entry: entry.name });
  }
  return output;
}

function requireXml(buffer: Buffer, entries: Map<string, ZipEntry>, name: string): string {
  const entry = entries.get(name);
  if (!entry) throw invalidWorkbook(`The XLSX workbook is missing ${name}.`);
  return readZipEntry(buffer, entry).toString("utf8");
}

function optionalXml(buffer: Buffer, entries: Map<string, ZipEntry>, name: string): string | null {
  const entry = entries.get(name);
  return entry ? readZipEntry(buffer, entry).toString("utf8") : null;
}

function attribute(fragment: string, name: string): string | null {
  const expression = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "i");
  const match = expression.exec(fragment);
  return match ? decodeXml(match[1] ?? "") : null;
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  const siExpression = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let siMatch: RegExpExecArray | null;
  while ((siMatch = siExpression.exec(xml)) !== null) {
    const body = siMatch[1] ?? "";
    const textParts: string[] = [];
    const textExpression = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
    let textMatch: RegExpExecArray | null;
    while ((textMatch = textExpression.exec(body)) !== null) {
      textParts.push(decodeXml(textMatch[1] ?? ""));
    }
    strings.push(textParts.join(""));
  }
  return strings;
}

function normalizeTarget(target: string): string {
  const clean = target.replace(/\\/g, "/");
  if (clean.startsWith("/")) return clean.slice(1);
  const parts = ["xl", ...clean.split("/")];
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return normalized.join("/");
}

function parseSheetTargets(workbookXml: string, relationsXml: string): Array<{ name: string; target: string }> {
  const relations = new Map<string, string>();
  const relationExpression = /<Relationship\b([^>]*?)\/?>/gi;
  let relationMatch: RegExpExecArray | null;
  while ((relationMatch = relationExpression.exec(relationsXml)) !== null) {
    const attrs = relationMatch[1] ?? "";
    const id = attribute(attrs, "Id");
    const target = attribute(attrs, "Target");
    if (id && target) relations.set(id, normalizeTarget(target));
  }

  const sheets: Array<{ name: string; target: string }> = [];
  const sheetExpression = /<sheet\b([^>]*?)\/?>/gi;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetExpression.exec(workbookXml)) !== null) {
    const attrs = sheetMatch[1] ?? "";
    const name = attribute(attrs, "name");
    const relationId = attribute(attrs, "r:id");
    if (!name || !relationId) continue;
    const target = relations.get(relationId);
    if (target) sheets.push({ name, target });
  }
  if (sheets.length === 0) throw invalidWorkbook("The workbook does not contain any readable worksheets.");
  return sheets;
}

function columnIndex(reference: string): number | null {
  const letters = /^([A-Z]+)\d+$/i.exec(reference)?.[1];
  if (!letters) return null;
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function cellInnerText(body: string, tag: "v" | "f"): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(body);
  return match ? decodeXml(match[1] ?? "") : null;
}

function inlineString(body: string): string | null {
  const parts: string[] = [];
  const expression = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(body)) !== null) parts.push(decodeXml(match[1] ?? ""));
  return parts.length ? parts.join("") : null;
}

function parseCell(attrs: string, body: string, sharedStrings: string[]): ParsedExcelCell {
  const type = attribute(attrs, "t");
  const formula = cellInnerText(body, "f");
  const rawValue = cellInnerText(body, "v");

  if (type === "inlineStr") return { value: inlineString(body), formula };
  if (type === "s") {
    const index = rawValue === null ? Number.NaN : Number(rawValue);
    return { value: Number.isInteger(index) ? (sharedStrings[index] ?? null) : null, formula };
  }
  if (type === "b") return { value: rawValue === "1", formula };
  if (type === "str") return { value: rawValue, formula };
  if (type === "e") return { value: rawValue ? `#${rawValue}` : "#ERROR", formula };
  if (rawValue === null || rawValue === "") return { value: null, formula };

  const numeric = Number(rawValue);
  return { value: Number.isFinite(numeric) ? numeric : rawValue, formula };
}

function parseWorksheet(xml: string, sharedStrings: string[]): ParsedExcelCell[][] {
  const rows = new Map<number, ParsedExcelCell[]>();
  const cellExpression = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi;
  let cellMatch: RegExpExecArray | null;
  let maxRow = 0;

  while ((cellMatch = cellExpression.exec(xml)) !== null) {
    const attrs = cellMatch[1] ?? "";
    const body = cellMatch[2] ?? "";
    const reference = attribute(attrs, "r");
    if (!reference) continue;
    const match = /^([A-Z]+)(\d+)$/i.exec(reference);
    if (!match) continue;
    const rowNumber = Number(match[2]);
    const colIndex = columnIndex(reference);
    if (!Number.isInteger(rowNumber) || rowNumber <= 0 || colIndex === null || colIndex < 0) continue;

    const row = rows.get(rowNumber) ?? [];
    while (row.length <= colIndex) row.push({ value: null, formula: null });
    row[colIndex] = parseCell(attrs, body, sharedStrings);
    rows.set(rowNumber, row);
    maxRow = Math.max(maxRow, rowNumber);
  }

  const result: ParsedExcelCell[][] = [];
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    result.push(rows.get(rowNumber) ?? []);
  }
  return result;
}

export function parseXlsxWorkbook(buffer: Buffer): ParsedExcelWorkbook {
  const entries = readZipEntries(buffer);
  const workbookXml = requireXml(buffer, entries, "xl/workbook.xml");
  const relationsXml = requireXml(buffer, entries, "xl/_rels/workbook.xml.rels");
  const sharedStrings = parseSharedStrings(optionalXml(buffer, entries, "xl/sharedStrings.xml"));
  const sheetTargets = parseSheetTargets(workbookXml, relationsXml);

  const sheets = sheetTargets.map(({ name, target }) => ({
    name,
    rows: parseWorksheet(requireXml(buffer, entries, target), sharedStrings),
  }));

  return { sheets };
}
