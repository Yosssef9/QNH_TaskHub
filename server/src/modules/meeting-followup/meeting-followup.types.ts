import type { MeetingParticipant, MeetingStatus } from "../meetings/meeting-workflow.types.js";
import type { MeetingRoom } from "../meetings/meetings.types.js";

export interface MeetingDecision {
  id: number;
  meetingId: number;
  agendaItemId: number | null;
  agendaTitle: string | null;
  decisionText: string;
  createdBy: MeetingParticipant;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  rowVersion: string;
}

export interface MeetingFollowUpNotes {
  meetingId: number;
  notesText: string;
  updatedBy: MeetingParticipant;
  updatedAtUtc: string;
  rowVersion: string;
}

export interface MeetingFollowUpSummary {
  actionItems: number;
  completed: number;
  overdue: number;
  decisions: number;
}

export interface MeetingFollowUpData {
  summary: MeetingFollowUpSummary;
  decisions: MeetingDecision[];
  notes: MeetingFollowUpNotes | null;
  canManageContent: boolean;
}

export interface CreateMeetingDecisionInput {
  decisionText: string;
  agendaItemId?: number | null | undefined;
}

export interface UpdateMeetingDecisionInput extends CreateMeetingDecisionInput {
  rowVersion: string;
}

export interface SaveMeetingFollowUpNotesInput {
  notesText: string;
  rowVersion?: string | null | undefined;
}


export interface RelatedMeeting {
  id: number;
  title: string;
  status: MeetingStatus;
  organizer: MeetingParticipant;
  room: Pick<MeetingRoom, "id" | "code" | "nameAr" | "nameEn" | "locationText" | "colorKey">;
  startAtUtc: string;
  endAtUtc: string;
  participantCount: number;
  isCurrent: boolean;
}

export interface RelatedMeetingFamily {
  items: RelatedMeeting[];
}
