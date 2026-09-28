import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { EMAIL_ENABLED: true, EMAIL_WORKER_BATCH_SIZE: 2, EMAIL_PROCESSING_TIMEOUT_MINUTES: 10, EMAIL_MAX_ATTEMPTS: 4 },
  claim: vi.fn(), operationalSync: vi.fn(), reportSync: vi.fn(), runtime: vi.fn(), reportProcess: vi.fn(), send: vi.fn(), sent: vi.fn(),
}));
vi.mock("../../src/config/env.js", () => ({ env: mocks.env }));
vi.mock("../../src/config/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("../../src/modules/email/email.repository.js", () => ({ emailRepository: { claimBatch: mocks.claim, markSent: mocks.sent, markAttemptFailed: vi.fn() } }));
vi.mock("../../src/modules/email/operational-email.service.js", () => ({ operationalEmailService: { synchronize: mocks.operationalSync } }));
vi.mock("../../src/modules/email/email-transport.factory.js", () => ({ getEmailTransport: () => ({ send: mocks.send }) }));
vi.mock("../../src/modules/email/templates/email-template.registry.js", () => ({ renderEmailTemplate: () => ({ subject: "test", html: "test", text: "test" }) }));
vi.mock("../../src/modules/meeting-reports/meeting-report-email.service.js", () => ({ meetingReportEmailService: {
  runtime: mocks.runtime, synchronize: mocks.reportSync, process: mocks.reportProcess,
} }));
import { processEmailOutboxOnce } from "../../src/modules/email/email-worker.js";

beforeEach(() => {
  vi.clearAllMocks(); mocks.env.EMAIL_ENABLED = true;
  mocks.runtime.mockResolvedValue({ automaticDeliveryEnabled: true });
  mocks.operationalSync.mockResolvedValue(undefined); mocks.reportSync.mockResolvedValue(1);
  mocks.reportProcess.mockResolvedValue("SENT"); mocks.send.mockResolvedValue({ provider: "FAKE", messageId: "fake" });
  mocks.claim.mockResolvedValue([]);
});
describe("Existing email worker report integration", () => {
  it("processes reports even when there are no ordinary emails", async () => {
    mocks.claim.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 99 }]).mockResolvedValueOnce([]);
    assert.equal(await processEmailOutboxOnce("worker"), 1);
    assert.equal(mocks.claim.mock.calls[0]![4], "OTHER");
    assert.equal(mocks.claim.mock.calls[1]![4], "REPORT");
    assert.equal(mocks.claim.mock.calls[1]![1], 1);
    assert.match(mocks.claim.mock.calls[1]![0], /^worker:report:/);
    assert.equal(mocks.reportProcess.mock.calls.length, 1);
    assert.equal(mocks.send.mock.calls.length, 0);
  });
  it("keeps report mail paused without stopping ordinary email", async () => {
    mocks.runtime.mockResolvedValue({ automaticDeliveryEnabled: false });
    mocks.claim.mockResolvedValueOnce([{ id: 1, ownerUserId: 200, recipientEmail: "fake@example.invalid", recipientName: null, languageCode: "en", templateKey: "TEST", templatePayloadJson: "{}", attemptCount: 1 }]);
    assert.equal(await processEmailOutboxOnce("worker"), 1);
    assert.equal(mocks.send.mock.calls.length, 1);
    assert.equal(mocks.reportProcess.mock.calls.length, 0);
    assert.equal(mocks.claim.mock.calls.length, 1);
  });
  it("continues handling queued reports when their new-candidate scan fails", async () => {
    mocks.reportSync.mockRejectedValue(new Error("fake scan failure"));
    mocks.claim.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 99 }]).mockResolvedValueOnce([]);
    assert.equal(await processEmailOutboxOnce("worker"), 1);
  });
  it("does not queue or send anything while the existing master system switch is disabled", async () => {
    mocks.env.EMAIL_ENABLED = false;
    assert.equal(await processEmailOutboxOnce("worker"), 0);
    assert.equal(mocks.claim.mock.calls.length, 0); assert.equal(mocks.reportSync.mock.calls.length, 0);
  });
});
