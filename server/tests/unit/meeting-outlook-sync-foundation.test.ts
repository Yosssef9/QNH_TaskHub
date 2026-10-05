
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "vitest";

const migrationUrl = new URL(
  "../../database/migrations/047_add_meeting_outlook_sync_foundation.sql",
  import.meta.url,
);

describe("Outlook Calendar synchronization foundation migration", () => {
  it("creates the mapping, durable job queue and non-activated singleton config", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    assert.match(sql, /CREATE TABLE dbo\.TM_meeting_outlook_sync_config/);
    assert.match(sql, /CREATE TABLE dbo\.TM_meeting_outlook_sync\s*\(/);
    assert.match(sql, /CREATE TABLE dbo\.TM_meeting_outlook_sync_jobs/);
    assert.match(sql, /activated_at_utc DATETIME2\(3\) NULL/);
    assert.match(sql, /create_transaction_id UNIQUEIDENTIFIER NOT NULL/);
    assert.match(sql, /UQ_TM_meeting_outlook_sync_jobs_dedupe/);
    assert.match(sql, /FOREIGN KEY \(desired_revision_id, meeting_id\)/);
    assert.match(sql, /FOREIGN KEY \(synced_revision_id, meeting_id\)/);
    assert.match(sql, /FOREIGN KEY \(target_revision_id, meeting_id\)/);
  });

  it("persists every agreed sync state and recovery operation", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    for (const status of [
      "NOT_SYNCED",
      "SYNCING",
      "IN_SYNC",
      "SYNCED_WITH_WARNINGS",
      "OUTLOOK_CHANGED",
      "OUTLOOK_DELETED",
      "SYNC_FAILED",
    ]) {
      assert.match(sql, new RegExp(`'${status}'`));
    }

    for (const operation of ["CREATE", "UPDATE", "CANCEL", "RESTORE", "RECREATE"]) {
      assert.match(sql, new RegExp(`'${operation}'`));
    }
  });

  it("does not persist a Meeting content payload in the job table", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    const jobsSection = sql.split("CREATE TABLE dbo.TM_meeting_outlook_sync_jobs")[1] ?? "";

    assert.doesNotMatch(jobsSection, /payload_json|attendee_email|meeting_title|zoom_url/i);
    assert.match(jobsSection, /target_revision_id BIGINT NULL/);
    assert.match(jobsSection, /dedupe_key VARCHAR\(250\) NOT NULL/);
  });
});
