import type { TaskHubAccess, TimeFormatPreference } from "../auth/auth.types.js";
import type { MeetingActionItemListData, MeetingActionItemListItem } from "../meeting-action-items/meeting-action-items.types.js";
import type { MeetingFollowUpData, RelatedMeeting, RelatedMeetingFamily } from "../meeting-followup/meeting-followup.types.js";
import type { MeetingAttachment, MeetingAttendanceStatus, MeetingDetail } from "../meetings/meeting-workspace.types.js";
import type { MeetingParticipant } from "../meetings/meeting-workflow.types.js";

export type MeetingReportLanguage = "ar" | "en";
export type MeetingReportStage = "PENDING_APPROVAL" | "BEFORE_START" | "IN_PROGRESS" | "ENDED" | "CANCELLED" | "REJECTED";

export interface MeetingReportRequest {
  /** Set by the trusted email worker only, never accepted from HTTP input. */
  generationMode?: "MANUAL" | "AUTOMATIC";
  meetingId: number;
  actor: MeetingParticipant;
  access: TaskHubAccess;
  language: MeetingReportLanguage;
  timeFormat: TimeFormatPreference;
  timeZone: string;
}

/** Internal render model, never exposed as an unfiltered JSON API. */
export interface MeetingReportData {
  generationMode?: "MANUAL" | "AUTOMATIC";
  generatedAtUtc: string;
  generatedBy: MeetingParticipant;
  language: MeetingReportLanguage;
  timeFormat: TimeFormatPreference;
  timeZone: string;
  stage: MeetingReportStage;
  detail: MeetingDetail;
  attendanceSummary: Record<MeetingAttendanceStatus, number> & { total: number };
  followUp: MeetingFollowUpData;
  actionItems: MeetingActionItemListItem[];
  attachments: MeetingAttachment[];
  relatedMeetings: RelatedMeeting[];
}

/** All adapters must retain normal Meeting content authorization. */
export interface MeetingReportSources {
  authorize(actorUserId: number, access: TaskHubAccess, meetingId: number): Promise<unknown>;
  detail(actorUserId: number, access: TaskHubAccess, meetingId: number): Promise<MeetingDetail>;
  followUp(actorUserId: number, access: TaskHubAccess, meetingId: number): Promise<MeetingFollowUpData>;
  actionItems(actorUserId: number, access: TaskHubAccess, meetingId: number): Promise<MeetingActionItemListData>;
  attachments(actorUserId: number, access: TaskHubAccess, meetingId: number): Promise<MeetingAttachment[]>;
  relatedMeetings(actorUserId: number, access: TaskHubAccess, meetingId: number): Promise<RelatedMeetingFamily>;
}

export interface MeetingReportDocument {
  html: string;
  headerTemplate: string;
  footerTemplate: string;
}

export interface MeetingReportPdf {
  buffer: Buffer;
  fileName: string;
}

