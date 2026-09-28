import type { MeetingReportData, MeetingReportLanguage } from "../meeting-report.types.js";

/** Fictional, deterministic data for local layout and renderer verification; never used by the API. */
export function sampleMeetingReport(language: MeetingReportLanguage = "en"): MeetingReportData {
  const ar = language === "ar";
  const people = [
    { userId: 100, userCode: "DEMO100", userName: ar ? "يوسف إبراهيم" : "Youssef Ibrahim" },
    { userId: 200, userCode: "DEMO200", userName: ar ? "أحمد حسن" : "Ahmed Hassan" },
    { userId: 300, userCode: "DEMO300", userName: ar ? "سارة علي" : "Sara Ali" },
    { userId: 400, userCode: "DEMO400", userName: ar ? "محمد إبراهيم" : "Mohamed Ibrahim" },
  ] as const;
  const room = { id: 10, code: "BOARD", nameAr: "قاعة الاجتماعات الرئيسية", nameEn: "Main Board Room", locationText: ar ? "المبنى الإداري — الدور الثاني" : "Administration building — second floor", capacity: 20, equipmentNotes: null, isActive: true, colorKey: "BLUE" as const, rowVersion: "0x0000000000000001" };
  const meeting = {
    id: 127, title: ar ? "المراجعة التشغيلية الشهرية" : "Monthly Operations Review",
    description: ar ? "مراجعة مؤشرات الأداء التشغيلي وتجربة المريض وخطة القوى العاملة. جميع البيانات في هذا النموذج افتراضية." : "Review operational performance, patient experience and the staffing plan. All information in this demonstration is fictional.",
    status: "SCHEDULED" as const, organizer: people[0], room,
    startAtUtc: "2026-09-27T06:00:00.000Z", endAtUtc: "2026-09-27T07:00:00.000Z",
    schedulingNotes: ar ? "يرجى إحضار ملخص الإدارة وتحديث الإجراءات المفتوحة." : "Bring the departmental summary and update open Action Items.",
    participantCount: 4, organizerAttending: true, attendees: [...people], hasPendingReschedule: false,
    revisionId: 12, meetingRowVersion: "0x0000000000000001", revisionRowVersion: "0x0000000000000002",
  };
  const agendaItems = [
    { id: 1, topic: ar ? "الأداء التشغيلي" : "Operational performance", presenter: people[1], plannedDurationMinutes: 20, sortOrder: 0, rowVersion: "0x0000000000000001" },
    { id: 2, topic: ar ? "تجربة المريض" : "Patient experience", presenter: people[2], plannedDurationMinutes: 20, sortOrder: 1, rowVersion: "0x0000000000000001" },
    { id: 3, topic: ar ? "تخطيط القوى العاملة" : "Staffing plan", presenter: people[3], plannedDurationMinutes: 20, sortOrder: 2, rowVersion: "0x0000000000000001" },
  ];
  const actionItems = [
    { taskId: 901, meetingId: 127, meetingTitle: meeting.title, organizerUserId: 100, organizerName: people[0].userName,
      title: ar ? "إعداد ملخص الأداء الشهري" : "Prepare the monthly performance summary", description: ar ? "تجميع مؤشرات الإدارات وإرفاق ملخص النتائج للمراجعة." : "Collect department indicators and attach a consolidated summary for review.",
      status: "DONE" as const, priority: "HIGH" as const, startDate: "2026-09-27", dueDate: "2026-09-30", isOverdue: false, subtaskTotal: 2, subtaskCompleted: 2,
      assigneeUserId: 200, assigneeName: people[1].userName, assignedByUserId: 100, assignedByName: people[0].userName,
      agendaItemId: 1, agendaTitle: agendaItems[0]!.topic, assignedAtUtc: "2026-09-27T06:20:00.000Z", rowVersion: "0x0000000000000001" },
    { taskId: 902, meetingId: 127, meetingTitle: meeting.title, organizerUserId: 100, organizerName: people[0].userName,
      title: ar ? "تحديث خطة تجربة المريض" : "Update the patient experience plan", description: ar ? "مراجعة النتائج وتحديد خطوات التحسين مع الإدارات المعنية. هذه المهمة ظاهرة لجميع المشاركين وليست محصورة بالمكلّف بها." : "Review findings and agree improvement actions with department leads. This item is visible to every Meeting viewer, not only its assignee.",
      status: "IN_PROGRESS" as const, priority: "MEDIUM" as const, startDate: "2026-09-27", dueDate: "2026-10-02", isOverdue: false, subtaskTotal: 3, subtaskCompleted: 1,
      assigneeUserId: 300, assigneeName: people[2].userName, assignedByUserId: 100, assignedByName: people[0].userName,
      agendaItemId: 2, agendaTitle: agendaItems[1]!.topic, assignedAtUtc: "2026-09-27T06:35:00.000Z", rowVersion: "0x0000000000000001" },
    { taskId: 903, meetingId: 127, meetingTitle: meeting.title, organizerUserId: 100, organizerName: people[0].userName,
      title: ar ? "تأكيد احتياجات التوظيف" : "Confirm staffing requirements", description: null,
      status: "TODO" as const, priority: "LOW" as const, startDate: null, dueDate: null, isOverdue: false, subtaskTotal: 0, subtaskCompleted: 0,
      assigneeUserId: 400, assigneeName: people[3].userName, assignedByUserId: 100, assignedByName: people[0].userName,
      agendaItemId: 3, agendaTitle: agendaItems[2]!.topic, assignedAtUtc: "2026-09-27T06:50:00.000Z", rowVersion: "0x0000000000000001" },
  ];
  const revisionBase = { revisionType: "INITIAL" as const, revisionStatus: "APPROVED" as const, room,
    schedulingNotes: null, requestedBy: people[0], approvedBy: people[1], rejectedBy: null,
    createdAtUtc: "2026-09-20T07:00:00.000Z", decidedAtUtc: "2026-09-20T08:00:00.000Z", rowVersion: "0x0000000000000001" };
  return {
    generatedAtUtc: "2026-09-27T09:30:00.000Z", generatedBy: people[1], language, timeFormat: "12H", timeZone: "Asia/Riyadh", stage: "ENDED",
    detail: {
      meeting, agendaItems,
      attendance: people.map((participant, index) => ({ participant, role: index === 0 ? "ORGANIZER" : "ATTENDEE", status: index < 2 ? "ATTENDED" : index === 2 ? "ABSENT" : "NOT_MARKED", markedBy: index < 3 ? people[0] : null, markedAtUtc: index < 3 ? "2026-09-27T06:05:00.000Z" : null })),
      revisions: [
        { ...revisionBase, id: 11, revisionNumber: 1, startAtUtc: "2026-09-26T06:00:00.000Z", endAtUtc: "2026-09-26T07:00:00.000Z" },
        { ...revisionBase, id: 12, revisionNumber: 2, revisionType: "RESCHEDULE", startAtUtc: meeting.startAtUtc, endAtUtc: meeting.endAtUtc, createdAtUtc: "2026-09-22T07:00:00.000Z", decidedAtUtc: "2026-09-22T08:00:00.000Z" },
      ],
      activity: [
        { id: 1, activityType: "REQUESTED", actor: people[0], changes: null, createdAtUtc: "2026-09-20T07:00:00.000Z" },
        { id: 2, activityType: "APPROVED", actor: people[1], changes: null, createdAtUtc: "2026-09-20T08:00:00.000Z" },
        { id: 3, activityType: "RESCHEDULE_APPROVED", actor: people[1], changes: { reason: ar ? "توحيد موعد مراجعة الإدارات" : "Align departmental review schedules" }, createdAtUtc: "2026-09-22T08:00:00.000Z" },
        { id: 4, activityType: "ATTENDANCE_UPDATED", actor: people[0], changes: { scope: "PARTICIPANT", participantName: people[1].userName, fromStatus: "NOT_MARKED", toStatus: "ATTENDED" }, createdAtUtc: "2026-09-27T06:05:00.000Z" },
        { id: 5, activityType: "DECISION_CREATED", actor: people[0], changes: null, createdAtUtc: "2026-09-27T06:30:00.000Z" },
        { id: 6, activityType: "NOTES_UPDATED", actor: people[0], changes: null, createdAtUtc: "2026-09-27T07:10:00.000Z" },
      ],
      pendingReschedule: null,
      permissions: { canCancel: false, canReschedule: false, canEditPendingSchedule: false, canEditPendingReschedule: false, canCancelPendingReschedule: false, canDecidePendingRequest: false, canCoordinatorReschedule: false, canDecidePendingReschedule: false, canManageAgenda: false, canManageAttachments: false, canSaveAsTemplate: false, canManageAttendance: false },
    },
    attendanceSummary: { total: 4, ATTENDED: 2, ABSENT: 1, NOT_MARKED: 1 },
    followUp: { summary: { actionItems: 3, completed: 1, overdue: 0, decisions: 2 }, canManageContent: false,
      decisions: [
        { id: 20, meetingId: 127, agendaItemId: 1, agendaTitle: agendaItems[0]!.topic, decisionText: ar ? "اعتماد ملخص مؤشرات الأداء ومراجعته في الاجتماع القادم." : "Approve the consolidated performance indicators and review progress at the next Meeting.", createdBy: people[0], createdAtUtc: "2026-09-27T06:30:00.000Z", updatedAtUtc: null, rowVersion: "0x0000000000000001" },
        { id: 21, meetingId: 127, agendaItemId: 2, agendaTitle: agendaItems[1]!.topic, decisionText: ar ? "تكليف فريق تجربة المريض بإعداد خطة تحسين مع تحديد المسؤوليات والمواعيد." : "Ask the patient experience team to prepare an improvement plan with named owners and due dates.", createdBy: people[0], createdAtUtc: "2026-09-27T06:45:00.000Z", updatedAtUtc: null, rowVersion: "0x0000000000000001" },
      ],
      notes: { meetingId: 127, notesText: ar ? "ناقش المشاركون تقدم العمل والتحديات المشتركة بين الإدارات.\n\nتم الاتفاق على متابعة المهام في TaskHub وتحديث حالة كل مهمة قبل الاجتماع القادم. حضور أحد المشاركين لم يُسجل بعد، ولا يعني ذلك اعتباره غائباً." : "Participants reviewed progress and cross-department challenges.\n\nAction Item owners will update their work in TaskHub before the next review. One participant's attendance has not yet been recorded; this is not treated as an absence.", updatedBy: people[0], updatedAtUtc: "2026-09-27T07:10:00.000Z", rowVersion: "0x0000000000000001" },
    },
    actionItems,
    attachments: [
      { id: "11111111-1111-4111-8111-111111111111", meetingId: 127, originalFileName: "Operations-summary.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileExtension: ".xlsx", sizeBytes: 185_000, uploadedBy: people[0], createdAtUtc: "2026-09-26T08:00:00.000Z" },
      { id: "22222222-2222-4222-8222-222222222222", meetingId: 127, originalFileName: ar ? "خطة-تجربة-المريض.pdf" : "Patient-experience-plan.pdf", mimeType: "application/pdf", fileExtension: ".pdf", sizeBytes: 1_200_000, uploadedBy: people[0], createdAtUtc: "2026-09-26T08:30:00.000Z" },
    ],
    relatedMeetings: [{ id: 128, title: ar ? "متابعة الإجراءات التشغيلية" : "Operations Action Item Follow-up", status: "SCHEDULED", organizer: people[0], room, startAtUtc: "2026-10-04T06:00:00.000Z", endAtUtc: "2026-10-04T07:00:00.000Z", participantCount: 4, isCurrent: false }],
  };
}
