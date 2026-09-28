import type { MeetingActivityItem, MeetingAttendanceStatus } from "../meetings/meeting-workspace.types.js";
import { meetingReportLabels } from "./meeting-report.labels.js";
import type { MeetingReportData, MeetingReportDocument } from "./meeting-report.types.js";

export function escapeMeetingReportHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

const e = escapeMeetingReportHtml;
const text = (value: unknown) => `<bdi dir="auto">${e(value)}</bdi>`;
const paragraph = (value: string) => `<p class="prose" dir="auto">${e(value)}</p>`;
const empty = (value: string) => `<p class="empty">${e(value)}</p>`;
const badge = (value: string, kind = "neutral") => `<span class="badge ${kind}">${e(value)}</span>`;
const meta = (label: string, value: string) => `<span class="meta-label">${e(label)}:</span> ${text(value)}`;
const section = (id: string, number: string, title: string, body: string, className = "") =>
  `<section id="${id}" class="report-section ${className}"><h2><span class="section-number">${number}</span>${e(title)}</h2>${body}</section>`;
function table(headers: string[], rows: string[][], widths?: number[]): string {
  return `<table>${widths ? `<colgroup>${widths.map((width) => `<col style="width:${width}%">`).join("")}</colgroup>` : ""}<thead><tr>${headers.map((header) => `<th scope="col">${e(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

export function renderMeetingReportDocument(
  data: MeetingReportData,
  options: { logoDataUrl?: string | null; sample?: boolean } = {},
): MeetingReportDocument {
  const l = meetingReportLabels(data.language);
  const rtl = data.language === "ar";
  const direction = rtl ? "rtl" : "ltr";
  const locale = rtl ? "ar-SA-u-ca-gregory" : "en-GB";
  const { meeting } = data.detail;
  const dateTime = (value: string | null | undefined): string => {
    if (!value || !Number.isFinite(Date.parse(value))) return l.notProvided;
    return new Intl.DateTimeFormat(locale, {
      timeZone: data.timeZone, numberingSystem: "latn", calendar: "gregory",
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
      hour12: data.timeFormat === "12H",
    }).format(new Date(value));
  };
  const dateOnly = (value: string | null): string => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return l.notProvided;
    return new Intl.DateTimeFormat(locale, {
      timeZone: "UTC", numberingSystem: "latn", calendar: "gregory",
      year: "numeric", month: "short", day: "2-digit",
    }).format(new Date(`${value}T12:00:00Z`));
  };
  const duration = Math.round((Date.parse(meeting.endAtUtc) - Date.parse(meeting.startAtUtc)) / 60_000);
  const roomName = (room: { nameAr: string; nameEn: string }) => rtl ? room.nameAr : room.nameEn;
  const attendanceKind = (status: MeetingAttendanceStatus) => status === "ATTENDED" ? "success" : status === "ABSENT" ? "danger" : "neutral";
  const statusKind = (status: string) => status === "DONE" || status === "APPROVED" || status === "SCHEDULED" ? "success" : status === "CANCELLED" || status === "REJECTED" ? "danger" : "neutral";
  const fileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const field = (label: string, value: string) => `<div class="info-field"><dt>${e(label)}</dt><dd>${text(value)}</dd></div>`;
  const stat = (label: string, value: number) => `<div class="stat"><strong>${value}</strong><span>${e(label)}</span></div>`;
  const noteEmpty = data.stage === "PENDING_APPROVAL" ? l.notesPending : data.stage === "BEFORE_START" ? l.notesBefore : l.noNotes;
  const attendanceEmpty = data.stage === "PENDING_APPROVAL" ? l.attendancePending : data.stage === "BEFORE_START" ? l.attendanceBefore : l.noAttendance;
  const scheduleLabel = meeting.status === "PENDING_APPROVAL" ? l.proposedSchedule : meeting.status === "REJECTED" ? l.rejectedSchedule : meeting.status === "CANCELLED" ? l.cancelledSchedule : l.approvedSchedule;
  const logo = options.logoDataUrl && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(options.logoDataUrl)
    ? `<img class="brand-logo" src="${options.logoDataUrl}" alt="QNH">`
    : '<div class="brand-mark" dir="ltr">QNH</div>';

  const information = `<p class="schedule-label">${e(scheduleLabel)}</p>
    <dl class="info-grid">
      ${field(l.organizer, meeting.organizer.userName)}
      ${field(l.status, l.statuses[meeting.status])}
      ${field(l.start, dateTime(meeting.startAtUtc))}${field(l.end, dateTime(meeting.endAtUtc))}
      ${field(l.duration, Number.isFinite(duration) && duration > 0 ? `${duration} ${l.minutes}` : l.notProvided)}
      ${field(l.organizerPlanned, meeting.organizerAttending ? l.yes : l.no)}
      ${field(l.room, roomName(meeting.room))}${field(l.location, meeting.room.locationText ?? l.notProvided)}
    </dl>
    ${data.detail.pendingReschedule ? `<p class="notice">${e(l.pendingReschedule)}</p>` : ""}
    <h3>${e(l.description)}</h3>${meeting.description?.trim() ? paragraph(meeting.description) : empty(l.noDescription)}
    <h3>${e(l.schedulingNotes)}</h3>${meeting.schedulingNotes?.trim() ? paragraph(meeting.schedulingNotes) : empty(l.noSchedulingNotes)}`;

  const a = data.attendanceSummary;
  const participants = `<div class="stats">${stat(l.invited, a.total)}${stat(l.attended, a.ATTENDED)}${stat(l.absent, a.ABSENT)}${stat(l.notMarked, a.NOT_MARKED)}</div>
    ${a.total === 0 ? empty(l.noParticipants) : table(
      [l.name, l.role, l.attendance],
      data.detail.attendance.map((item) => [
        `${text(item.participant.userName)} <span class="small muted">(${text(item.participant.userCode)})</span>`,
        e(item.role === "ORGANIZER" ? l.organizer : l.attendee),
        `${badge(l.attendanceStatuses[item.status], attendanceKind(item.status))}${item.markedAtUtc ? `<div class="small muted">${e(dateTime(item.markedAtUtc))}</div>` : ""}`,
      ]), [47, 20, 33],
    )}
    ${a.total > 0 && a.NOT_MARKED === a.total ? empty(attendanceEmpty) : ""}`;

  const agenda = data.detail.agendaItems.length ? table(["#", l.topic, l.presenter, l.plannedTime],
    [...data.detail.agendaItems].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id).map((item, index) => [
      String(index + 1), text(item.topic), text(item.presenter?.userName ?? l.notProvided),
      item.plannedDurationMinutes === null ? e(l.notProvided) : `${item.plannedDurationMinutes} ${e(l.minutes)}`,
    ]), [6, 49, 25, 20]) : empty(l.noAgenda);

  const decisions = data.followUp.decisions.length ? data.followUp.decisions.map((item, index) => `<article class="entry">
    <h3>${e(l.decisions)} ${index + 1}</h3>
    ${item.agendaTitle ? `<p class="small">${meta(l.agendaTopic, item.agendaTitle)}</p>` : ""}
    ${paragraph(item.decisionText)}
    <p class="small muted">${meta(l.recordedBy, item.createdBy.userName)} · ${meta(l.recordedAt, dateTime(item.createdAtUtc))}${item.updatedAtUtc ? ` · ${meta(l.updatedAt, dateTime(item.updatedAtUtc))}` : ""}</p>
  </article>`).join("") : empty(l.noDecisions);

  const notes = data.followUp.notes?.notesText.trim() ? `${paragraph(data.followUp.notes.notesText)}
    <p class="small muted">${meta(l.updatedBy, data.followUp.notes.updatedBy.userName)} · ${meta(l.updatedAt, dateTime(data.followUp.notes.updatedAtUtc))}</p>` : empty(noteEmpty);

  const actionItems = data.actionItems.length ? `<div class="stats stats-three">${stat(l.total, data.actionItems.length)}${stat(l.completed, data.followUp.summary.completed)}${stat(l.overdue, data.followUp.summary.overdue)}</div>
    ${table([l.title, l.assignedTo, l.due, l.status, l.subtasks], data.actionItems.map((item) => [
      `<span class="small muted" dir="ltr">#${item.taskId}</span><br>${text(item.title)}${item.agendaTitle ? `<div class="small muted">${meta(l.agendaTopic, item.agendaTitle)}</div>` : ""}`,
      text(item.assigneeName),
      `${text(dateOnly(item.dueDate))}${item.isOverdue ? `<div>${badge(l.overdue, "danger")}</div>` : ""}`,
      `${badge(l.taskStatuses[item.status], statusKind(item.status))}<div class="small muted">${e(l.priority)}: ${e(l.priorities[item.priority])}</div>`,
      `<span dir="ltr">${item.subtaskCompleted} / ${item.subtaskTotal}</span>`,
    ]), [33, 19, 17, 17, 14])}
    ${data.actionItems.map((item) => `<article class="entry task-entry"><h3><bdi dir="ltr">#${item.taskId}</bdi> — ${text(item.title)}</h3>
      <p class="small muted">${meta(l.assignedBy, item.assignedByName)} · ${meta(l.assignedAt, dateTime(item.assignedAtUtc))}${item.startDate ? ` · ${meta(l.startDate, dateOnly(item.startDate))}` : ""}</p>
      ${item.description?.trim() ? paragraph(item.description) : ""}
    </article>`).join("")}` : empty(l.noActions);

  const files = `${data.attachments.length ? table([l.fileName, l.size, l.uploadedBy, l.uploadedAt], data.attachments.map((item) => [
    `${text(item.originalFileName)}<div class="small muted">${text(item.mimeType)}</div>`,
    `<bdi dir="ltr">${e(fileSize(item.sizeBytes))}</bdi>`, text(item.uploadedBy.userName), text(dateTime(item.createdAtUtc)),
  ]), [40, 12, 23, 25]) : empty(l.noFiles)}<p class="small muted">${e(l.fileNotice)}</p>`;

  const revisions = data.detail.revisions.length ? table([l.revision, l.start + " / " + l.end, l.event],
    [...data.detail.revisions].sort((left, right) => left.revisionNumber - right.revisionNumber).map((item) => [
      `<strong>#${item.revisionNumber}</strong> · ${e(item.revisionType === "INITIAL" ? l.initial : l.reschedule)}<div>${badge(item.revisionStatus === "APPROVED" ? l.approved : item.revisionStatus === "REJECTED" ? l.rejected : l.pending, statusKind(item.revisionStatus))}</div>${item.id === meeting.revisionId ? `<div class="small muted">${e(l.current)}</div>` : ""}`,
      `<div>${meta(l.start, dateTime(item.startAtUtc))}</div><div>${meta(l.end, dateTime(item.endAtUtc))}</div><div>${meta(l.room, roomName(item.room))}</div>${item.schedulingNotes ? `<div class="small">${meta(l.schedulingNotes, item.schedulingNotes)}</div>` : ""}`,
      `<div>${meta(l.requestedBy, item.requestedBy.userName)}</div><div class="small muted">${meta(l.createdAt, dateTime(item.createdAtUtc))}</div>${item.approvedBy ? `<div>${meta(l.approvedBy, item.approvedBy.userName)}</div>` : ""}${item.rejectedBy ? `<div>${meta(l.rejectedBy, item.rejectedBy.userName)}</div>` : ""}${item.decidedAtUtc ? `<div class="small muted">${meta(l.decidedAt, dateTime(item.decidedAtUtc))}</div>` : ""}`,
    ]), [22, 40, 38]) : empty(l.noRevisions);

  // Human-readable allowlist only: never dump changes_json or storage/security identifiers.
  const eventDetails = (item: MeetingActivityItem): string => {
    const change = item.changes;
    if (!change) return "";
    const details: string[] = [];
    for (const [key, label] of [["reason", l.reason], ["schedulingNotes", l.schedulingNotes], ["participantName", l.name], ["taskTitle", l.title], ["followUpMeetingTitle", l.related], ["sourceMeetingTitle", l.related]] as const) {
      if (typeof change[key] === "string" && change[key].trim()) details.push(meta(label, change[key]));
    }
    const validAttendance = (value: unknown): value is MeetingAttendanceStatus => value === "NOT_MARKED" || value === "ATTENDED" || value === "ABSENT";
    if (validAttendance(change.fromStatus) && validAttendance(change.toStatus)) {
      details.push(`${e(l.attendanceStatuses[change.fromStatus])} → ${e(l.attendanceStatuses[change.toStatus])}`);
    } else if (validAttendance(change.toStatus)) details.push(meta(l.attendance, l.attendanceStatuses[change.toStatus]));
    const validTaskStatus = (value: unknown): value is keyof typeof l.taskStatuses =>
      value === "TODO" || value === "IN_PROGRESS" || value === "DONE" || value === "CANCELLED";
    if (validTaskStatus(change.fromTaskStatus) && validTaskStatus(change.toTaskStatus)) {
      details.push(`${e(l.taskStatuses[change.fromTaskStatus])} → ${e(l.taskStatuses[change.toTaskStatus])}`);
    }
    if (typeof change.decisionId === "number" && Number.isSafeInteger(change.decisionId)) {
      details.push(meta(l.decisions, `#${change.decisionId}`));
    }
    if (typeof change.changedCount === "number") details.push(meta(l.changedCount, String(change.changedCount)));
    for (const [key, label] of [["before", l.before], ["requested", l.requested], ["organizerRequested", l.requested], ["after", l.after], ["final", l.after]] as const) {
      const value = change[key];
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const schedule = value as Record<string, unknown>;
      if (typeof schedule.startAtUtc === "string" && typeof schedule.endAtUtc === "string") {
        details.push(meta(label, `${dateTime(schedule.startAtUtc)} → ${dateTime(schedule.endAtUtc)}`));
      }
    }
    return details.length ? `<div class="small muted event-details">${details.join("<br>")}</div>` : "";
  };
  const activity = data.detail.activity.length ? table([l.when, l.who, l.event],
    [...data.detail.activity].sort((left, right) => Date.parse(left.createdAtUtc) - Date.parse(right.createdAtUtc) || left.id - right.id).map((item) => [
      text(dateTime(item.createdAtUtc)), text(item.actor.userName), `${e(l.activityTypes[item.activityType] ?? l.unknownActivity)}${eventDetails(item)}`,
    ]), [23, 22, 55]) : empty(l.noActivity);

  const related = data.relatedMeetings.length ? table([l.meeting, l.status, l.start, l.room], data.relatedMeetings.map((item) => [
    `<span dir="ltr">#${item.id}</span> ${text(item.title)}<div class="small muted">${meta(l.organizer, item.organizer.userName)}</div>`,
    badge(l.statuses[item.status], statusKind(item.status)), text(dateTime(item.startAtUtc)), text(roomName(item.room)),
  ]), [40, 18, 24, 18]) : empty(l.noRelated);

  const html = `<!doctype html><html lang="${data.language}" dir="${direction}"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
    <title>${e(l.report)} · ${e(l.meeting)} #${meeting.id}</title><style>
    @page { size: A4; }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin:0; font:10pt/1.5 Arial,Tahoma,'Noto Sans Arabic','DejaVu Sans',sans-serif; color:#182c45; background:white; }
    body, td, th, dd, h1, h2, h3, p { overflow-wrap:anywhere; }
    bdi { unicode-bidi:isolate; }
    .topbar { display:flex; align-items:center; justify-content:space-between; gap:15px; border-bottom:2px solid #245ba3; padding-bottom:12px; }
    .brand { display:flex; gap:12px; align-items:center; min-width:0; }
    .brand-logo { max-width:165px; max-height:58px; object-fit:contain; }
    .brand-mark { width:50px; height:48px; background:#1a477d; color:#fff; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:14pt; font-weight:800; }
    .brand-name { font-size:14pt; font-weight:700; color:#163e70; }
    .small { font-size:8pt; line-height:1.5; }
    .muted, .meta-label { color:#5d6e82; }
    .document-kind { font-size:9pt; font-weight:700; color:#245ba3; }
    .hero { background:#f0f5fb; border:1px solid #d6e2ef; border-inline-start:5px solid #245ba3; border-radius:8px; padding:17px 18px; margin:18px 0 12px; }
    h1 { font-size:21pt; line-height:1.3; margin:6px 0 10px; color:#15385f; }
    h2 { font-size:13pt; color:#183f70; margin:0 0 12px; padding-bottom:6px; border-bottom:1px solid #d4e0ef; break-after:avoid-page; }
    h3 { margin:12px 0 5px; font-size:10pt; color:#203f65; break-after:avoid-page; }
    .section-number { display:inline-block; margin-inline-end:8px; color:#577da5; font-size:10pt; }
    .report-section { margin-top:23px; }
    .keep-together { break-inside:avoid-page; }
    .compact { margin-top:9px; }
    .compact h2 { margin-bottom:3px; padding-bottom:3px; font-size:11pt; }
    .compact .empty { padding:5px 10px; margin:3px 0; font-size:8.5pt; }
    .report-section > :last-child { margin-bottom:0; }
    .schedule-label { font-size:9pt; font-weight:700; color:#345c8a; margin:0 0 8px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:0 0 12px; }
    .info-field { border:1px solid #dfe6ef; border-radius:5px; background:#fafbfd; padding:8px 10px; break-inside:avoid-page; }
    dt { font-size:8pt; color:#60728a; } dd { margin:3px 0 0; font-weight:700; }
    .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:0 0 12px; break-inside:avoid-page; }
    .stats-three { grid-template-columns:repeat(3,1fr); }
    .stat { border:1px solid #d9e4f1; border-radius:5px; padding:9px; background:#f6f9fd; text-align:center; }
    .stat strong { display:block; font-size:18pt; line-height:1.2; color:#224e86; }
    .stat span { display:block; font-size:8pt; color:#536780; margin-top:4px; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; margin:6px 0 10px; font-size:9pt; }
    thead { display:table-header-group; } tr { break-inside:avoid-page; }
    th { background:#eaf1f9; color:#224976; font-weight:700; text-align:start; font-size:8pt; }
    th,td { padding:8px 7px; border:1px solid #dbe4ee; vertical-align:top; }
    tbody tr:nth-child(even) td { background:#fafcfe; }
    .badge { display:inline-block; border:1px solid #d7e0eb; border-radius:4px; padding:2px 6px; font-size:8pt; font-weight:700; background:#f1f4f8; color:#4b5c70; margin:2px 0; }
    .badge.success { color:#236340; background:#edf7f0; border-color:#c9e4d1; }
    .badge.danger { color:#963746; background:#fcf0f2; border-color:#edcbd2; }
    .prose { white-space:pre-wrap; unicode-bidi:plaintext; margin:5px 0 10px; orphans:3; widows:3; }
    p { orphans:2; widows:2; }
    .empty { background:#f7f9fc; border-inline-start:3px solid #c4d3e4; padding:10px 12px; color:#586b83; font-size:9pt; margin:8px 0 12px; }
    .notice { background:#fff9eb; border:1px solid #f0dfb3; border-radius:4px; padding:9px; font-size:9pt; }
    .entry { border-inline-start:3px solid #dae5f2; padding-inline-start:12px; margin:14px 0; }
    .entry h3 { margin-top:0; }
    .entry p { margin-top:4px; }
    .event-details { margin-top:5px; }
    .report-metadata { color:#5d6e82; font-size:8pt; margin:8px 0 0; }
    .end-note { border-top:1px solid #d5e1ed; padding-top:7px; margin-top:10px; color:#5d6e82; font-size:8pt; }
    .sample { border:1px solid #e3bdc5; background:#fff4f6; color:#963746; padding:5px 9px; border-radius:5px; font-weight:700; font-size:8pt; }
    </style></head><body>
    <header class="topbar"><div class="brand">${logo}<div><div class="brand-name" dir="ltr">${e(l.brand)}</div><div class="document-kind">${e(l.report)}</div></div></div>${options.sample ? `<div class="sample">${e(l.sample)}</div>` : `<div class="small">${e(l.meeting)} <bdi dir="ltr">#${meeting.id}</bdi></div>`}</header>
    <div class="hero"><div class="document-kind">${e(l.report)} · <bdi dir="ltr">#${meeting.id}</bdi></div><h1 dir="auto">${e(meeting.title)}</h1>${badge(l.stages[data.stage], statusKind(meeting.status))}</div>
    <p class="report-metadata">${data.generationMode === "AUTOMATIC" ? `${e(l.automaticGeneration)} · ${meta(l.preparedFor, data.generatedBy.userName)}` : meta(l.generatedBy, data.generatedBy.userName)} · ${meta(l.generatedAt, dateTime(data.generatedAtUtc))}<br>${meta(l.timeZone, data.timeZone)}</p>
    ${section("meeting-information", "01", l.information, information)}
    ${section("participants-attendance", "02", l.participants, participants, a.total <= 6 ? "keep-together" : "")}
    ${section("agenda", "03", l.agenda, agenda, !data.detail.agendaItems.length ? "compact keep-together" : "")}
    ${section("decisions", "04", l.decisions, decisions, !data.followUp.decisions.length ? "compact keep-together" : "")}
    ${section("meeting-notes", "05", l.notes, notes, !data.followUp.notes?.notesText.trim() ? "compact keep-together" : "")}
    ${section("action-items", "06", l.actions, actionItems, !data.actionItems.length ? "compact keep-together" : "")}
    ${section("meeting-files", "07", l.files, files, !data.attachments.length ? "compact keep-together" : "")}
    ${section("schedule-history", "08", l.revisions, revisions, !data.detail.revisions.length ? "compact keep-together" : "")}
    ${section("meeting-activity", "09", l.activity, activity, !data.detail.activity.length ? "compact keep-together" : "")}
    ${section("related-meetings", "10", l.related, related, !data.relatedMeetings.length ? "compact keep-together" : "")}
    <aside class="end-note">${e(l.snapshot)}<br>${e(data.generationMode === "AUTOMATIC" ? l.automatedAccessNote : l.accessNote)}</aside>
    </body></html>`;

  // Header/footer are separate Chromium documents and require their own inline styling.
  return {
    html,
    headerTemplate: `<div dir="${direction}" style="font:8px Arial,Tahoma,sans-serif;color:#718096;width:100%;margin:0 15mm;display:flex;justify-content:space-between;"><span>QNH TaskHub</span><span>${e(l.report)} · #${meeting.id}</span></div>`,
    footerTemplate: `<div dir="${direction}" style="font:9px Arial,Tahoma,sans-serif;color:#607087;width:100%;margin:0 15mm;border-top:1px solid #d8e1ed;padding-top:6px;display:flex;justify-content:space-between;"><span>QNH TaskHub · ${e(l.meeting)} #${meeting.id}</span><span>${e(l.page)} <span class="pageNumber"></span> ${e(l.of)} <span class="totalPages"></span></span></div>`,
  };
}


