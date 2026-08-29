import type { EmailLanguage } from "../email.types.js";
import { escapeHtml } from "./email-template.helpers.js";

export function formatEmailDate(value: string, language: EmailLanguage): string {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatEmailNumber(value: number, language: EmailLanguage, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits,
  }).format(value);
}

export function formatMeasurement(
  value: number | null,
  unit: "PERCENT" | "NUMBER" | null,
  language: EmailLanguage,
): string {
  if (value === null) return language === "ar" ? "لا توجد بيانات" : "No data";
  const formatted = formatEmailNumber(value, language, unit === "PERCENT" ? 1 : 2);
  return unit === "PERCENT" ? `${formatted}%` : formatted;
}

export function infoPanel(
  rows: Array<{ label: string; value: string }>,
  language: EmailLanguage,
): string {
  const align = language === "ar" ? "right" : "left";
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;border:1px solid #D9E5ED;border-radius:14px;background:#F8FBFD;">
      ${rows
        .map(
          (row, index) => `<tr>
            <td style="padding:13px 16px;${index ? "border-top:1px solid #E6EEF3;" : ""}font-size:13px;line-height:20px;color:#64798B;text-align:${align};width:38%;">${escapeHtml(row.label)}</td>
            <td style="padding:13px 16px;${index ? "border-top:1px solid #E6EEF3;" : ""}font-size:14px;line-height:20px;font-weight:700;color:#16324A;text-align:${align};">${escapeHtml(row.value)}</td>
          </tr>`,
        )
        .join("")}
    </table>`;
}

export function progressPanel(
  value: number,
  language: EmailLanguage,
  label: string,
): string {
  const bounded = Math.max(0, Math.min(100, value));
  const shown = formatEmailNumber(bounded, language, 0);
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 10px;">
      <tr>
        <td style="font-size:13px;line-height:20px;color:#64798B;padding-bottom:8px;">${escapeHtml(label)}</td>
        <td dir="ltr" style="font-size:16px;line-height:20px;font-weight:800;color:#16324A;text-align:right;padding-bottom:8px;">${shown}%</td>
      </tr>
      <tr>
        <td colspan="2">
          <div style="height:10px;border-radius:999px;background:#E6EEF3;overflow:hidden;">
            <div style="height:10px;width:${bounded}%;border-radius:999px;background:#0878B8;"></div>
          </div>
        </td>
      </tr>
    </table>`;
}

export function kpiComparisonPanel(input: {
  actual: number;
  target: number;
  unit: "PERCENT" | "NUMBER";
  language: EmailLanguage;
}): string {
  const difference = input.actual - input.target;
  const actual = formatMeasurement(input.actual, input.unit, input.language);
  const target = formatMeasurement(input.target, input.unit, input.language);
  const diffAbs = formatMeasurement(Math.abs(difference), input.unit, input.language);
  const diff = difference === 0 ? diffAbs : `${difference > 0 ? "+" : "−"}${diffAbs}`;
  const actualLabel = input.language === "ar" ? "النتيجة الحالية" : "Current result";
  const targetLabel = input.language === "ar" ? "الهدف" : "Target";
  const differenceLabel = input.language === "ar" ? "الفارق" : "Difference";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 12px;">
      <tr>
        <td width="33.33%" style="padding:7px;vertical-align:top;">
          <div style="padding:16px 12px;border-radius:12px;background:#FFF0F0;border:1px solid #F4CCCC;text-align:center;">
            <div style="font-size:12px;color:#64798B;margin-bottom:6px;">${escapeHtml(actualLabel)}</div>
            <div dir="ltr" style="font-size:22px;font-weight:800;color:#C53A3A;">${escapeHtml(actual)}</div>
          </div>
        </td>
        <td width="33.33%" style="padding:7px;vertical-align:top;">
          <div style="padding:16px 12px;border-radius:12px;background:#F3F7FA;border:1px solid #D9E5ED;text-align:center;">
            <div style="font-size:12px;color:#64798B;margin-bottom:6px;">${escapeHtml(targetLabel)}</div>
            <div dir="ltr" style="font-size:22px;font-weight:800;color:#16324A;">${escapeHtml(target)}</div>
          </div>
        </td>
        <td width="33.33%" style="padding:7px;vertical-align:top;">
          <div style="padding:16px 12px;border-radius:12px;background:#FFF6E5;border:1px solid #F2DCB1;text-align:center;">
            <div style="font-size:12px;color:#64798B;margin-bottom:6px;">${escapeHtml(differenceLabel)}</div>
            <div dir="ltr" style="font-size:22px;font-weight:800;color:#B7791F;">${escapeHtml(diff)}</div>
          </div>
        </td>
      </tr>
    </table>`;
}
