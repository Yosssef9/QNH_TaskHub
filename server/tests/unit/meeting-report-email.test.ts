import { describe, it } from "vitest";
import { meetingReportEmailChecks } from "../../src/modules/meeting-reports/scripts/email-smoke.js";

describe("Automatic Meeting PDF email policy and processor (fictional/mocked dependencies)", () => {
  for (const check of meetingReportEmailChecks) it(check.name, check.run);
});
