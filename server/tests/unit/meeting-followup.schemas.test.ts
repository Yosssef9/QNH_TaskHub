import { describe, expect, it } from "vitest";

import {
  createMeetingDecisionBodySchema,
  saveMeetingFollowUpNotesBodySchema,
  updateMeetingDecisionBodySchema,
} from "../../src/modules/meeting-followup/meeting-followup.schemas.js";

describe("Meeting Follow-up schemas", () => {
  it("accepts Decisions with an optional Agenda relationship", () => {
    expect(
      createMeetingDecisionBodySchema.safeParse({
        decisionText: "Renew the maintenance contract for one year.",
        agendaItemId: 12,
      }).success,
    ).toBe(true);
    expect(
      createMeetingDecisionBodySchema.safeParse({
        decisionText: "Use Supplier B.",
        agendaItemId: null,
      }).success,
    ).toBe(true);
  });

  it("requires stale-edit protection when updating a Decision", () => {
    expect(
      updateMeetingDecisionBodySchema.safeParse({
        decisionText: "Use Supplier B.",
        agendaItemId: null,
        rowVersion: "bad",
      }).success,
    ).toBe(false);
    expect(
      updateMeetingDecisionBodySchema.safeParse({
        decisionText: "Use Supplier B.",
        agendaItemId: null,
        rowVersion: "0x0000000000000002",
      }).success,
    ).toBe(true);
  });

  it("allows first-save Notes without a row version and validates subsequent row versions", () => {
    expect(saveMeetingFollowUpNotesBodySchema.safeParse({ notesText: "Finance confirmed VAT." }).success).toBe(true);
    expect(
      saveMeetingFollowUpNotesBodySchema.safeParse({
        notesText: "Finance confirmed VAT.",
        rowVersion: "0x0000000000000003",
      }).success,
    ).toBe(true);
    expect(
      saveMeetingFollowUpNotesBodySchema.safeParse({
        notesText: "Finance confirmed VAT.",
        rowVersion: "not-a-row-version",
      }).success,
    ).toBe(false);
  });
});
