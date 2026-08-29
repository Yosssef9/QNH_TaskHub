import type { EmailLanguage } from "../email.types.js";
import { escapeHtml, getDirection, normalizeAbsoluteUrl } from "./email-template.helpers.js";

interface EmailMetric {
  label: string;
  value: string;
}

interface EmailCta {
  label: string;
  href: string;
}

interface EmailLayoutInput {
  language: EmailLanguage;
  logoUrl: string;
  preheader: string;
  eyebrow?: string;
  title: string;
  intro: string;
  accent: "primary" | "success" | "warning" | "danger";
  bodyHtml?: string;
  metrics?: EmailMetric[];
  cta?: EmailCta;
  footerNote?: string;
}

const colors = {
  page: "#F3F7FA",
  card: "#FFFFFF",
  foreground: "#16324A",
  muted: "#64798B",
  border: "#D9E5ED",
  primary: "#0878B8",
  primarySoft: "#EAF6FC",
  success: "#138A62",
  successSoft: "#E9F7F1",
  warning: "#B7791F",
  warningSoft: "#FFF6E5",
  danger: "#C53A3A",
  dangerSoft: "#FFF0F0",
} as const;

function getAccent(accent: EmailLayoutInput["accent"]): { color: string; soft: string } {
  switch (accent) {
    case "success":
      return { color: colors.success, soft: colors.successSoft };
    case "warning":
      return { color: colors.warning, soft: colors.warningSoft };
    case "danger":
      return { color: colors.danger, soft: colors.dangerSoft };
    case "primary":
      return { color: colors.primary, soft: colors.primarySoft };
  }
}

function renderMetrics(metrics: EmailMetric[] | undefined, direction: "rtl" | "ltr"): string {
  if (!metrics?.length) {
    return "";
  }

  const cells = metrics
    .map(
      (metric) => `
        <td class="qnh-metric-cell" width="${Math.floor(100 / metrics.length)}%" valign="top" style="padding:8px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid ${colors.border};border-radius:12px;background:${colors.page};">
            <tr>
              <td dir="${direction}" style="padding:14px 12px;text-align:${direction === "rtl" ? "right" : "left"};">
                <div style="font-size:12px;line-height:18px;color:${colors.muted};margin-bottom:5px;">${escapeHtml(metric.label)}</div>
                <div style="font-size:19px;line-height:26px;font-weight:700;color:${colors.foreground};">${escapeHtml(metric.value)}</div>
              </td>
            </tr>
          </table>
        </td>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:10px -8px 4px;width:calc(100% + 16px);">
      <tr>${cells}</tr>
    </table>`;
}

function renderCta(cta: EmailCta | undefined): string {
  if (!cta) {
    return "";
  }

  const href = escapeHtml(normalizeAbsoluteUrl(cta.href));
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
      <tr>
        <td bgcolor="${colors.primary}" style="border-radius:10px;">
          <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 20px;font-size:14px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a>
        </td>
      </tr>
    </table>`;
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  const direction = getDirection(input.language);
  const accent = getAccent(input.accent);
  const align = direction === "rtl" ? "right" : "left";
  const logoUrl = input.logoUrl.toLowerCase().startsWith("cid:")
    ? escapeHtml(input.logoUrl)
    : escapeHtml(normalizeAbsoluteUrl(input.logoUrl));
  const preheader = escapeHtml(input.preheader);

  return `<!doctype html>
<html lang="${input.language}" dir="${direction}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(input.title)}</title>
  <style>
    @media only screen and (max-width: 640px) {
      .qnh-container { width: 100% !important; }
      .qnh-card { border-radius: 0 !important; }
      .qnh-pad { padding-left: 22px !important; padding-right: 22px !important; }
      .qnh-metric-cell { display:block !important; width:100% !important; box-sizing:border-box !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${colors.page};font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:${colors.foreground};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.page}">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="620" class="qnh-container qnh-card" cellspacing="0" cellpadding="0" border="0" style="width:620px;max-width:620px;background:${colors.card};border:1px solid ${colors.border};border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(27,70,96,.09);">
          <tr>
            <td class="qnh-pad" style="padding:24px 34px 20px;border-bottom:1px solid ${colors.border};background:#FBFDFE;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle" style="text-align:${align};">
                    <img src="${logoUrl}" width="230" alt="Qassim National Hospital" style="display:block;max-width:230px;width:100%;height:auto;border:0;outline:none;">
                  </td>
                  <td valign="middle" style="text-align:${direction === "rtl" ? "left" : "right"};white-space:nowrap;padding-${direction === "rtl" ? "right" : "left"}:16px;">
                    <div style="font-size:12px;line-height:16px;color:${colors.muted};">QNH</div>
                    <div style="font-size:17px;line-height:22px;font-weight:700;color:${colors.primary};">TaskHub</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="qnh-pad" dir="${direction}" style="padding:34px;text-align:${align};">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:18px;">
                <tr>
                  <td style="width:42px;height:42px;border-radius:12px;background:${accent.soft};text-align:center;vertical-align:middle;color:${accent.color};font-size:20px;font-weight:700;">•</td>
                </tr>
              </table>
              ${input.eyebrow ? `<div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:.02em;color:${accent.color};margin-bottom:7px;">${escapeHtml(input.eyebrow)}</div>` : ""}
              <h1 style="margin:0 0 12px;font-size:26px;line-height:36px;font-weight:700;color:${colors.foreground};">${escapeHtml(input.title)}</h1>
              <p style="margin:0 0 18px;font-size:15px;line-height:26px;color:${colors.muted};">${escapeHtml(input.intro)}</p>
              ${input.bodyHtml ?? ""}
              <div class="qnh-metrics">${renderMetrics(input.metrics, direction)}</div>
              ${renderCta(input.cta)}
            </td>
          </tr>
          <tr>
            <td class="qnh-pad" dir="${direction}" style="padding:20px 34px 24px;border-top:1px solid ${colors.border};background:#FBFDFE;text-align:${align};">
              <div style="font-size:12px;line-height:20px;color:${colors.muted};">${escapeHtml(input.footerNote ?? (input.language === "ar" ? "هذه رسالة آلية من QNH TaskHub." : "This is an automated message from QNH TaskHub."))}</div>
              <div style="font-size:12px;line-height:20px;color:${colors.muted};margin-top:4px;">© ${new Date().getUTCFullYear()} Qassim National Hospital · QNH TaskHub</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
