import { z } from "zod";

import type { EmailLanguage, EmailRenderContext, EmailTemplateDocument } from "../email.types.js";
import { renderEmailLayout } from "./email-layout.js";
import { escapeHtml } from "./email-template.helpers.js";

const verificationPayloadSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  expiresInMinutes: z.number().int().min(1).max(60),
});

export function renderVerificationCodeEmail(
  payload: Record<string, unknown>,
  language: EmailLanguage,
  context: EmailRenderContext,
): EmailTemplateDocument {
  const parsed = verificationPayloadSchema.parse(payload);
  const isArabic = language === "ar";
  const subject = isArabic
    ? "رمز التحقق من البريد الإلكتروني — QNH TaskHub"
    : "Verify your email — QNH TaskHub";
  const preheader = isArabic
    ? `رمز التحقق صالح لمدة ${parsed.expiresInMinutes} دقائق.`
    : `Your verification code is valid for ${parsed.expiresInMinutes} minutes.`;
  const intro = isArabic
    ? "استخدم الرمز التالي لإثبات أن لديك حق الوصول إلى هذا البريد قبل استخدامه لاستقبال إشعارات TaskHub."
    : "Use the code below to prove that you can access this mailbox before it is used for TaskHub notifications.";
  const direction = isArabic ? "rtl" : "ltr";

  const codeHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0;">
      <tr>
        <td align="center" style="padding:20px;border:1px solid #BFE2F4;border-radius:14px;background:#F0FAFE;">
          <div dir="ltr" style="font-family:Consolas,'Courier New',monospace;font-size:32px;line-height:40px;font-weight:800;letter-spacing:8px;color:#0878B8;">${escapeHtml(parsed.code)}</div>
          <div dir="${direction}" style="margin-top:8px;font-size:12px;line-height:18px;color:#64798B;">${escapeHtml(
            isArabic
              ? `ينتهي الرمز خلال ${parsed.expiresInMinutes} دقائق.`
              : `This code expires in ${parsed.expiresInMinutes} minutes.`,
          )}</div>
        </td>
      </tr>
    </table>`;

  const html = renderEmailLayout({
    language,
    logoUrl: context.logoUrl,
    preheader,
    eyebrow: isArabic ? "التحقق من البريد" : "Email verification",
    title: isArabic ? "تأكيد البريد الإلكتروني" : "Confirm your email address",
    intro,
    accent: "primary",
    bodyHtml: codeHtml,
    footerNote: isArabic
      ? "إذا لم تطلب إضافة هذا البريد إلى TaskHub، يمكنك تجاهل الرسالة. لا تشارك رمز التحقق مع أي شخص."
      : "If you did not request this email for TaskHub, you can ignore this message. Do not share the verification code with anyone.",
  });

  const text = isArabic
    ? `QNH TaskHub\n\nتأكيد البريد الإلكتروني\n${intro}\n\nرمز التحقق: ${parsed.code}\nصالح لمدة ${parsed.expiresInMinutes} دقائق.\n\nإذا لم تطلب إضافة هذا البريد إلى TaskHub، يمكنك تجاهل الرسالة. لا تشارك رمز التحقق مع أي شخص.`
    : `QNH TaskHub\n\nConfirm your email address\n${intro}\n\nVerification code: ${parsed.code}\nValid for ${parsed.expiresInMinutes} minutes.\n\nIf you did not request this email for TaskHub, you can ignore this message. Do not share the verification code with anyone.`;

  return { subject, preheader, html, text };
}
