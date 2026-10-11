import { afterEach, describe, expect, it, vi } from "vitest";
import * as sqlModule from "../../src/database/sql.js";
import { buildGeneralAssignmentEmailPayload } from "../../src/modules/general-task-assignments/general-task-assignments.email.js";
import { renderGeneralTaskEmail } from "../../src/modules/email/templates/general-task-email.js";

const STATE = {
  taskId: 101, title: "Monthly report", status: "IN_PROGRESS", ownerUserId: 1,
  mainAssigneeId: 2, assignedAtUtc: new Date("2026-10-11T09:00:00Z"),
  dueDate: new Date("2026-10-20T00:00:00Z"), listId: 7,
  subtaskId: 10, subtaskTitle: "Collect data", subtaskDueDate: new Date("2026-10-17T00:00:00Z"),
  subtaskAssignmentChangedAtUtc: new Date("2026-10-11T09:00:00Z"),
  effectiveSubtaskAssigneeId: 3,
};

function arrange(state: Record<string, unknown> | null = STATE) {
  const query = vi.fn().mockResolvedValue({recordset:state?[state]:[]});
  const request = {input:vi.fn().mockReturnThis(),query};
  vi.spyOn(sqlModule,"getDatabasePool").mockResolvedValue({request:()=>request} as never);
  return {query};
}
const at = new Date("2026-10-11T09:01:00Z");
afterEach(()=>vi.restoreAllMocks());

describe("General assignment email privacy and revalidation",()=>{
  it("returns only the recipient's assigned subtask and parent context",async()=>{
    arrange();
    const payload = await buildGeneralAssignmentEmailPayload(3,"GENERAL_SUBTASK_ASSIGNED",{
      taskId:101,subtaskId:10,eventDate:null,createdAtUtc:at,
    });
    expect(payload).toMatchObject({taskTitle:"Monthly report",subtaskTitle:"Collect data"});
    expect(JSON.stringify(payload)).not.toContain("other subtasks");
  });
  it("rejects assignment mail after reassignment",async()=>{
    arrange({...STATE,effectiveSubtaskAssigneeId:4});
    expect(await buildGeneralAssignmentEmailPayload(3,"GENERAL_SUBTASK_ASSIGNED",{
      taskId:101,subtaskId:10,eventDate:null,createdAtUtc:at,
    })).toBeNull();
  });
  it("rejects a stale due date",async()=>{
    arrange();
    expect(await buildGeneralAssignmentEmailPayload(3,"GENERAL_SUBTASK_DUE_CHANGED",{
      taskId:101,subtaskId:10,eventDate:new Date("2026-10-16T00:00:00Z"),createdAtUtc:at,
    })).toBeNull();
  });
  it("does not reveal task title in removal email",async()=>{
    arrange({...STATE,effectiveSubtaskAssigneeId:4});
    const payload=await buildGeneralAssignmentEmailPayload(3,"GENERAL_ASSIGNMENT_REMOVED",{
      taskId:101,subtaskId:10,eventDate:null,createdAtUtc:at,
    });
    expect(JSON.stringify(payload)).not.toContain("Monthly report");
    expect(JSON.stringify(payload)).not.toContain("Collect data");
    const doc=renderGeneralTaskEmail("GENERAL_ASSIGNMENT_REMOVED",payload!,"en",{
      taskHubUrl:"https://taskhub.example.test",logoUrl:"cid:test",
    });
    expect(doc.text).not.toContain("Monthly report");
    expect(doc.html).not.toContain("Collect data");
  });
  it("does not disclose task content to unrelated users",async()=>{
    arrange({...STATE, mainAssigneeId:2});
    expect(await buildGeneralAssignmentEmailPayload(5,"GENERAL_TASK_COMPLETED",{
      taskId:101,subtaskId:null,eventDate:null,createdAtUtc:at,
    })).toBeNull();
  });
});
