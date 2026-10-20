import { describe, expect, it } from "vitest";

import {
  cleanUploadedAttachmentFileName,
  recoverAttachmentFileName,
} from "../../src/shared/utils/attachment-filename.js";

const corruptAsLatin1 = (value: string) => Buffer.from(value, "utf8").toString("latin1");

const corruptAsWindows1252 = (value: string) =>
  new TextDecoder("windows-1252").decode(Buffer.from(value, "utf8"));

describe("attachment filename Unicode recovery", () => {
  it("recovers historic Arabic names encoded as Latin-1", () => {
    for (const name of ["صورة المريض 2.png", "الشكوى.pdf", "ملف جديد.docx"]) {
      expect(recoverAttachmentFileName(corruptAsLatin1(name))).toBe(name);
    }
  });

  it("recovers Windows-1252 and double-encoded legacy filenames", () => {
    const original = "نموذج اختبار (2).pdf";
    expect(recoverAttachmentFileName(corruptAsWindows1252(original))).toBe(original);
    expect(recoverAttachmentFileName(corruptAsLatin1(corruptAsLatin1(original)))).toBe(original);
  });

  it("preserves correctly encoded Arabic, English, and accented filenames", () => {
    for (const name of ["تقرير جديد.pdf", "report.pdf", "résumé.docx", "File-123.PNG", "北京.pdf"]) {
      expect(recoverAttachmentFileName(name)).toBe(name);
    }
  });

  it("does not guess irreversibly damaged filenames", () => {
    expect(recoverAttachmentFileName("Ø� broken.pdf")).toBe("Ø� broken.pdf");
  });

  it("repairs new uploads before sanitizing paths and control characters", () => {
    const raw = `C:\\fake\\${corruptAsLatin1("مرفق 01.pdf")}`;
    expect(cleanUploadedAttachmentFileName(raw)).toBe("مرفق 01.pdf");
    expect(cleanUploadedAttachmentFileName("nested/English File.pdf")).toBe("English File.pdf");
    expect(cleanUploadedAttachmentFileName(`${corruptAsLatin1("الصورة")}.png\u0000`)).toBe("الصورة.png");
  });

  it("does not truncate a surrogate pair in a bounded filename", () => {
    expect(cleanUploadedAttachmentFileName("📄.pdf", 2)).toBe("📄");
    expect(cleanUploadedAttachmentFileName("📄.pdf", 1)).toBe("");
  });
});
