import { TextDecoder } from "node:util";

/**
 * Some multipart parsers decode a UTF-8 filename header as Latin-1. SQL Server
 * then faithfully persists the *already corrupted* Unicode string. This
 * reverses that specific, lossless decoding error; it does not guess at names
 * containing replacement characters or other irreversible damage.
 */
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

// Some proxies turn the 0x80-0x9F Latin-1 range into Windows-1252 symbols.
const windows1252Bytes = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function decodeMojibakeOnce(value: string): string | null {
  const bytes: number[] = [];
  for (const character of value) {
    const point = character.codePointAt(0)!;
    const byte = point <= 0xff ? point : windows1252Bytes.get(point);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  try {
    const recovered = utf8Decoder.decode(Uint8Array.from(bytes));
    // An actual UTF-8 mojibake layer expands one Unicode character into
    // multiple byte-shaped characters. Do not alter correct UTF-8 names.
    if (recovered.length >= value.length || recovered === value) return null;
    const hasMojibakeMarker = /[ÃÂØÙÛÐÑâð]/u.test(value);
    const hasRecoveredUnicode = Array.from(recovered).some(
      (character) => character.codePointAt(0)! > 0xff,
    );
    if (!hasMojibakeMarker && !hasRecoveredUnicode) return null;
    return recovered;
  } catch {
    return null;
  }
}

/**
 * Used for both legacy database reads and new uploads. Deliberately read-only:
 * legacy DB metadata is not mutated, and existing file bytes/storage keys stay
 * unchanged. Supports up to two reversible layers of double encoding.
 */
export function recoverAttachmentFileName(value: string): string {
  let recovered = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decodeMojibakeOnce(recovered);
    if (!next) break;
    recovered = next;
  }
  return recovered;
}

/** Strip path fragments and control characters only after UTF-8 recovery. */
export function cleanUploadedAttachmentFileName(rawName: string, maxLength = 260): string {
  const recovered = recoverAttachmentFileName(rawName);
  const name = recovered.replaceAll("\\", "/").split("/").pop() ?? "";
  let cleaned = "";
  for (const character of name.trim()) {
    const point = character.codePointAt(0)!;
    if (point < 32 || (point >= 127 && point <= 159)) continue;
    if (cleaned.length + character.length > maxLength) break;
    cleaned += character;
  }
  return cleaned.trim();
}
