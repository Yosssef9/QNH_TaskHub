import { z } from "zod";

import type { EmailLanguage } from "../email.types.js";
import { escapeHtml } from "./email-template.helpers.js";

export const meetingScheduleConflictSchema = z.object({
  conflictCount: z.number().int().positive(),
  overlaps: z.array(z.object({
    startAtUtc: z.string().datetime(),
    endAtUtc: z.string().datetime(),
  })).max(3),
});

export type MeetingScheduleConflictEmailData = z.infer<typeof meetingScheduleConflictSchema>;

export interface MeetingScheduleConflictWarningItem {
  label?: string;
  conflict: MeetingScheduleConflictEmailData;
}

function pluralMeetings(count: number, language: EmailLanguage): string {
  if (language === "ar") return count === 1 ? "اجتماع متعارض" : `${count} اجتماعات متعارضة`;
  return count === 1 ? "1 overlapping Meeting" : `${count} overlapping Meetings`;
}

export function renderMeetingScheduleConflictWarning(input: {
  items: readonly MeetingScheduleConflictWarningItem[];
  language: EmailLanguage;
  formatDateTime: (value: string) => string;
}): { html: string; text: string } {
  if (input.items.length === 0) return { html: "", text: "" };

  const ar = input.language === "ar";
  const align = ar ? "right" : "left";
  const heading = ar ? "تعارض في الموعد" : "Schedule conflict";
  const intro = input.items.length === 1
    ? ar
      ? "لديك اجتماع مجدول آخر يتداخل مع هذا الموعد."
      : "You already have another scheduled Meeting that overlaps this time."
    : ar
      ? `${input.items.length} من اجتماعات هذه السلسلة تتداخل مع اجتماع آخر في جدولك.`
      : `${input.items.length} Meetings in this Series overlap another Meeting in your schedule.`;
  const informational = ar
    ? "هذا التنبيه للمعلومية فقط ولا يلغي الاجتماع أو يغيّر موعده."
    : "This warning is informational only and does not cancel or change the Meeting.";

  const itemHtml = input.items.map((item, itemIndex) => {
    const visible = item.conflict.overlaps;
    const hidden = Math.max(0, item.conflict.conflictCount - visible.length);
    const rows = visible.map((overlap, index) => {
      const label = ar
        ? `الموعد المتعارض${visible.length > 1 ? ` ${index + 1}` : ""}`
        : `Conflicting time${visible.length > 1 ? ` ${index + 1}` : ""}`;
      return `<div style="margin-top:6px;font-size:13px;line-height:20px;color:#7A5616;">${escapeHtml(label)}: <strong>${escapeHtml(input.formatDateTime(overlap.startAtUtc))} → ${escapeHtml(input.formatDateTime(overlap.endAtUtc))}</strong></div>`;
    }).join("");
    const extra = hidden > 0
      ? `<div style="margin-top:6px;font-size:12px;line-height:18px;color:#8B691D;">${escapeHtml(ar ? `وهناك ${pluralMeetings(hidden, "ar")} إضافية.` : `And ${pluralMeetings(hidden, "en")} more.`)}</div>`
      : "";
    const label = item.label
      ? `<div style="font-size:13px;line-height:20px;font-weight:700;color:#6F4E13;">${escapeHtml(item.label)}</div>`
      : "";
    return `<div style="${itemIndex ? "margin-top:12px;padding-top:12px;border-top:1px solid #F1D9A6;" : ""}">${label}${rows}${extra}</div>`;
  }).join("");

  const html = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;border:1px solid #E8C878;border-radius:14px;background:#FFF8E8;">
      <tr>
        <td dir="${ar ? "rtl" : "ltr"}" style="padding:16px;text-align:${align};">
          <div style="font-size:14px;line-height:22px;font-weight:700;color:#8A5A00;">⚠ ${escapeHtml(heading)}</div>
          <div style="margin-top:5px;font-size:13px;line-height:21px;color:#7A5616;">${escapeHtml(intro)}</div>
          ${itemHtml}
          <div style="margin-top:12px;font-size:12px;line-height:19px;color:#8B691D;">${escapeHtml(informational)}</div>
        </td>
      </tr>
    </table>`;

  const lines: string[] = [`⚠ ${heading}`, intro];
  for (const item of input.items) {
    if (item.label) lines.push(item.label);
    item.conflict.overlaps.forEach((overlap, index) => {
      const label = ar
        ? `الموعد المتعارض${item.conflict.overlaps.length > 1 ? ` ${index + 1}` : ""}`
        : `Conflicting time${item.conflict.overlaps.length > 1 ? ` ${index + 1}` : ""}`;
      lines.push(`${label}: ${input.formatDateTime(overlap.startAtUtc)} → ${input.formatDateTime(overlap.endAtUtc)}`);
    });
    const hidden = Math.max(0, item.conflict.conflictCount - item.conflict.overlaps.length);
    if (hidden > 0) lines.push(ar ? `وهناك ${pluralMeetings(hidden, "ar")} إضافية.` : `And ${pluralMeetings(hidden, "en")} more.`);
  }
  lines.push(informational);

  return { html, text: lines.join("\n") };
}
