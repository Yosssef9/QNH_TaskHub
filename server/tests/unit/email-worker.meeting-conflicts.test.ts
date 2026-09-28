import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { EMAIL_ENABLED: true, EMAIL_WORKER_BATCH_SIZE: 2, EMAIL_PROCESSING_TIMEOUT_MINUTES: 10, EMAIL_MAX_ATTEMPTS: 4 },
  claim: vi.fn(),
  sync: vi.fn(),
  sendTime: vi.fn(),
  render: vi.fn(),
  send: vi.fn(),
  markSent: vi.fn(),
  updateDelivery: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({ env: mocks.env }));
vi.mock("../../src/config/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../../src/modules/email/email.repository.js", () => ({
  emailRepository: {
    claimBatch: mocks.claim,
    markSent: mocks.markSent,
    markAttemptFailed: vi.fn(),
    markCanceled: vi.fn(),
    updateProcessingDelivery: mocks.updateDelivery,
  },
}));
vi.mock("../../src/modules/email/operational-email.service.js", () => ({
  operationalEmailService: { synchronize: mocks.sync, resolveSendTimeContext: mocks.sendTime },
}));
vi.mock("../../src/modules/email/email-transport.factory.js", () => ({ getEmailTransport: () => ({ send: mocks.send }) }));
vi.mock("../../src/modules/email/templates/email-template.registry.js", () => ({ renderEmailTemplate: mocks.render }));
vi.mock("../../src/modules/meeting-reports/meeting-report-email.service.js", () => ({
  meetingReportEmailService: { synchronize: vi.fn(), runtime: vi.fn().mockResolvedValue({ automaticDeliveryEnabled: false }), process: vi.fn() },
}));

import { processEmailOutboxOnce } from "../../src/modules/email/email-worker.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sync.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue({ provider: "FAKE", messageId: "m1" });
  mocks.render.mockReturnValue({ subject: "s", html: "h", text: "t" });
  mocks.sendTime.mockResolvedValue({
    delivery: { recipient: { email: "recipient@example.invalid", name: "Sara" }, language: "en" },
    payload: { meetingId: 127, scheduleConflict: { conflictCount: 1, overlaps: [] } },
  });
  mocks.claim.mockResolvedValueOnce([{ 
    id: 1,
    ownerUserId: 200,
    recipientEmail: "old@example.invalid",
    recipientName: "Old",
    languageCode: "en",
    templateKey: "MEETING_INVITED",
    templatePayloadJson: JSON.stringify({ meetingId: 127, revisionId: 14, scheduleConflict: null }),
    attemptCount: 1,
  }]);
});

describe("Meeting email send-time conflict refresh", () => {
  it("renders the freshly rebuilt Meeting payload immediately before transport delivery", async () => {
    assert.equal(await processEmailOutboxOnce("worker"), 1);
    assert.equal(mocks.sendTime.mock.calls.length, 1);
    assert.deepEqual(mocks.render.mock.calls[0]![1], {
      meetingId: 127,
      scheduleConflict: { conflictCount: 1, overlaps: [] },
    });
    assert.equal(mocks.send.mock.calls[0]![0].to, "recipient@example.invalid");
  });
});
