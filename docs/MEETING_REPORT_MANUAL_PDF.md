# Meeting Reports — Phase 3: Manual PDF export

## Scope

Meeting Details offers **Export PDF / تصدير PDF** to every authorized Meeting viewer. Report Phase 4 now adds a read-only timing/status panel beside this manual-export feature; see `MEETING_REPORT_AUTOMATIC_STATUS.md`. Phase 5 adds the actual automatic sender, personal report-email preference and PDF attachments; see `MEETING_REPORT_AUTOMATIC_EMAIL.md`. Manual export remains independent of automatic-email availability and preferences.

The implementation extends the existing Attendance and Action Item visibility changes. Migration 043 must already be applied for Attendance. **There is no new SQL migration in this patch.**

## User experience and report contents

Export uses the current UI language (`ar` or `en`), with the saved user preference as the API fallback. The authenticated user's time format and configured application time zone are used. The browser receives a file such as `Meeting-127-Report-AR.pdf`.

The report includes:

1. Meeting information, lifecycle/time state, Organizer, start/end, duration, room/location, description and scheduling notes.
2. Participants and actual attendance, with totals. The existing attendance rows determine the attendance roster; a non-attending Organizer remains in the Meeting information but is not added to attendance artificially.
3. Ordered Agenda, presenters and planned duration.
4. Decisions, associated Agenda and recording metadata.
5. Meeting Notes and last-update metadata.
6. Every non-deleted Meeting Action Item readable under Phase 2, with assignment, status, priority, dates, subtask completion counts and descriptions.
7. Meeting attachment metadata, including existing Series-associated files. Attachment binaries are not opened, downloaded, embedded or merged into the report.
8. Schedule/revision history and decision actors.
9. Existing permission-filtered Meeting activity with human-readable labels. Activity JSON is never dumped into the document.
10. Individually authorized Related Meetings, excluding the current Meeting itself.

Each section remains present when empty, with a meaningful message. Empty Notes/Attendance distinguish pending approval or a future approved start from unrecorded content. Cancelled/rejected Meetings remain exportable only to users who can still view them normally. Export is not restricted by the Follow-up editing start-time rule.

QNH/TaskHub branding, generation actor/time, app time zone, snapshot disclaimer, repeated table headings, page numbers and Arabic RTL are included. Page count is determined by content, not fixed at four pages.

## Authorization and data collection

`GET /api/meetings/:meetingId/report.pdf?language=ar|en` is inside the existing authenticated Meetings router. There is no separate export permission and no Organizer-only middleware on this route.

The server takes actor identity and preferences from `authContext`. The only supported query field is optional `language`; caller-supplied actor IDs, HTML, URLs or time zones are rejected. Meeting ID must be a positive safe integer.

The builder authorizes before any section reads, invokes existing authorized Meeting/Follow-up/Action Item services, and authorizes again after collection. The service rechecks Meeting content access after rendering. The Related Meetings and activity adapters preserve the existing visibility filters instead of reading raw unfiltered SQL.

Authorization remains the existing domain policy: being an ADMIN or having Organizer capability alone does not grant access to another user's Meeting. An attendee does not gain access to pending/rejected Meetings through the report route.

The output is a **live read-time report**, not an immutable or transactionally frozen Minutes of Meeting record. Different sections are collected through existing services and concurrent edits can occur during collection. Generation time identifies when collection finished. Action and attendance totals are derived from the exact lists being printed to avoid inconsistent independently counted totals. No database transaction is held open while Chromium renders. Official frozen/finalized minutes remain out of scope.

A query failure is an export failure, not an empty-state message. No section is silently dropped to make export succeed.

## Rendering and resource protection

- `playwright-core` is a server runtime dependency, pinned to `1.62.1`, the version already present in the supplied client lockfile. The server lockfile's existing two-document structure is preserved.
- A local Chromium-family browser renders a dedicated HTML/CSS document. No external PDF service is called.
- Meeting text is HTML-escaped. Script execution and service workers are disabled; the browser context is offline and all routed requests are aborted. A restrictive document CSP is also applied.
- No credentials are injected into Chromium and no page is navigated to the Portal or application URL.
- The normal runtime uses the Chromium sandbox. No production `--no-sandbox` setting is added.
- Default capacity is two in-flight exports per Node process and one per user. Capacity is released after success or failure. Multiple PM2 workers each have their own capacity limit.
- A browser process/context is isolated per export and closed on completion, error, timeout or disconnected response. This avoids retaining one user's page across requests.
- Browser launch is capped at 15 seconds; rendering defaults to 45 seconds. The render timeout does not include existing database-read time. The client request timeout is 150 seconds.
- HTML input is limited to 8 MiB and the resulting PDF to 20 MiB. Exceeding a limit gives an explicit error; content is not silently truncated.
- Generated PDF bytes remain in memory. No generated PDFs are persisted by the API, and no report database table is created. Chromium manages its temporary runtime profile separately.
- Responses use `Cache-Control: private, no-store, max-age=0`, PDF content type, attachment disposition and `nosniff`.

## Installation and deployment

### 1. Install the server dependency

From the local project root after applying the patch:

```powershell
Set-Location "D:\My Projects\QNH\QNH_TaskHub"
pnpm --dir server install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "Server dependency installation failed." }
```

There is no new client dependency. Existing client dependencies still need to be installed normally to build the application.

### 2. Make a report browser available on the BACKEND machine

**Installing a browser on a developer PC does not install it on the backend machine.** Run the following from the deployed project root on each backend machine, as the operating-system account that runs the Node/PM2 backend:

```powershell
pnpm --dir server run pdf:install-browser
if ($LASTEXITCODE -ne 0) { throw "Report browser installation failed." }
```

This installs the browser matching the server's pinned Playwright version. The package and browser are separate installation steps. Installing dependencies alone does not guarantee a browser exists.

The normal default is the current account's Playwright browser cache. Service accounts must be able to read and execute the browser. Do not install as Administrator and assume a different PM2 account can use that account's private cache.

#### Optional shared browser cache

Set the same directory during installation AND in the backend process environment:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "D:\TaskHubRuntime\pdf-browsers"
pnpm --dir server run pdf:install-browser
```

Then configure the backend environment (or its existing `.env`):

```dotenv
PLAYWRIGHT_BROWSERS_PATH=D:/TaskHubRuntime/pdf-browsers
```

The CLI does not read TaskHub's `.env` automatically; setting only `.env` is not enough for the installation command. Grant the backend account read/execute access to the chosen directory and restart it with the updated environment. Do not overwrite an existing `.env` with `.env.example`.

#### Alternative: installed Microsoft Edge

An already installed compatible Microsoft Edge can be used instead of the downloaded browser:

```dotenv
MEETING_REPORT_BROWSER_CHANNEL=msedge
```

A local executable can instead be specified explicitly:

```dotenv
MEETING_REPORT_BROWSER_EXECUTABLE=C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe
```

The explicit executable takes precedence over the channel. Paths are administrator configuration, never request inputs. Managed browser policies may affect headless execution; the matching Playwright-installed browser is the recommended baseline for diagnosis.

### 3. Build and deploy BOTH applications

```powershell
pnpm --dir server build
if ($LASTEXITCODE -ne 0) { throw "Server build failed. Do not deploy." }

pnpm --dir client build
if ($LASTEXITCODE -ne 0) { throw "Client build failed. Do not deploy." }
```

Deploy through the normal TaskHub process, including the updated server runtime dependency and client build. Restart the deployed backend. No email worker configuration is needed for this phase.

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `MEETING_REPORT_BROWSER_EXECUTABLE` | Unset | Optional local browser executable path |
| `MEETING_REPORT_BROWSER_CHANNEL` | Unset | Optional `msedge`, `chrome` or `chromium` channel |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright default | Optional shared installed-browser directory; must agree between install and runtime |
| `MEETING_REPORT_LOGO_PATH` | Auto-detect | Optional local PNG; relative paths resolve from the server folder |
| `MEETING_REPORT_TIMEOUT_MS` | `45000` | Render deadline, allowed 5000–120000 ms |
| `MEETING_REPORT_MAX_CONCURRENT` | `2` | Exports per process, allowed 1–4 |

The actual supplied PNG logo is loaded locally from `client/public/images/fullLogo.png`, or `client/dist/images/fullLogo.png`, when present. A configured logo path overrides auto-detection. Only a bounded PNG (up to 1 MiB, dimensions up to 4096×4096) is accepted; the report uses a clean QNH text mark when no readable valid logo is available. The source-only snapshot does not contain the actual logo binary; it is not replaced in the patch.

Font fallback is local: Arial, Tahoma, Noto Sans Arabic, DejaVu Sans and sans-serif. No remote fonts are fetched and no font binaries are distributed in the patch. Verify Arabic on the deployed server because installed fonts affect pagination. A Linux deployment needs an Arabic-capable system font and the normal Playwright browser OS dependencies. Run the backend under a non-root account with sandbox support; do not disable the production sandbox as a workaround.

## Validation commands

Focused Vitest tests (no live database is used by these two suites):

```powershell
pnpm --dir server exec vitest run tests/unit/meeting-report.test.ts tests/unit/meeting-report.http.test.ts
```

The HTTP suite exercises the real controller, validation and error middleware with a fixture authentication context and mocked export service. It is not a replacement for testing the deployed authentication middleware and SQL-backed services.

Standalone assertion smoke test (no DB/SMTP/app secrets required):

```powershell
pnpm --dir server run pdf:smoke
```

To additionally render fictional English, Arabic, empty and long reports with the installed browser:

```powershell
pnpm --dir server run pdf:smoke --render
```

Output is written to a new temporary directory printed by the command. An optional destination or executable can be passed:

```powershell
pnpm --dir server run pdf:smoke --render --output="D:\Downloads\TaskHub-PDF-Smoke"
```

The smoke script reads browser settings from its process environment; unlike the backend it intentionally does not load the application's `.env` or database configuration. When testing an Edge override, set `$env:MEETING_REPORT_BROWSER_CHANNEL = "msedge"` in that shell first. A `--no-sandbox` switch exists only on this standalone test script for isolated root-run test containers; it is not used by the production endpoint.

The render smoke also starts an owned localhost HTTP test endpoint and asserts that the renderer performs zero requests to a remote image pointed at that endpoint.

### Manual acceptance checks

- Export as Organizer, assignee, another attendee and authorized Coordinator. Verify all permitted Action Items and identical action totals; names/identity in generation metadata must match the exporter.
- A user with no Meeting visibility must receive the normal authorization error and no PDF. Test a guessed Meeting ID directly, not only a hidden button.
- Pending/rejected export must work for an authorized Organizer/Coordinator, without giving an ordinary attendee new visibility.
- Export before start, during the Meeting, after end, and after cancellation. Empty Notes/Decisions/Agenda/Action Items must not block export.
- Check all attendance states and the non-attending Organizer case. Changing attendance and exporting again must produce current values without modifying `organizerAttending`.
- Confirm Arabic direction, mixed Arabic/English text, dates, time format, long notes, many participants, table continuation and page numbers. Inspect every generated page, not just the first.
- Confirm hidden related Meetings and their related activity are not printed, including hidden titles/IDs/counts.
- Confirm no attachment contents or storage keys are embedded in the PDF.
- Turn off automatic email preferences: manual export must still work, and no email should be sent by this phase.
- Simulate unavailable browser/capacity exhaustion: the UI should display an error, not download JSON or a proxy error page as `.pdf`.

## Validation performed for this delivery

- Strict TypeScript semantic compilation of the report core (builder, template, renderer, assets, limiter and standalone sample/smoke modules) succeeded against the available local type packages.
- The standalone Node assertion smoke passed authorization ordering/failure, source failure, attendance totals, complete action list, lifecycle, empty states, escaping and limiter checks.
- Real local Chromium rendering succeeded for English (4 pages), Arabic (4 pages), empty (2 pages) and a long Arabic/mixed-language report (10 pages, 65 participants and 35 long paragraphs). Text-boundary checks passed and the end-of-long-notes marker remained present.
- Generated PDF pages were rendered to images and inspected. The renderer's owned HTTP test observed zero requests.
- Local rendering used the preinstalled Playwright driver `1.57.0-beta-1764944708000` with `/usr/bin/chromium`, not the exact new pinned `1.62.1` browser combination. The local isolated container needed the smoke-only `--no-sandbox` flag. Windows/PM2 sandboxed runtime behavior still requires deployment validation.
- Full server/client builds, the new Vitest suites, live SQL Server/Portal authorization, production browser installation, Windows fonts, actual logo binary and PM2 deployment were not run in this environment. New/changed TS/TSX files received syntax parsing and patch packaging checks separately.

## Error handling

| Code | Meaning / next check |
|---|---|
| `MEETING_NOT_FOUND` | Normal Meeting visibility check failed or Meeting disappeared |
| `MEETING_REPORT_RENDERER_UNAVAILABLE` | Install browser for the correct account, or inspect local executable/cache permissions |
| `MEETING_REPORT_BUSY` | One export for this user is active, or process capacity is full; retry after the current export |
| `MEETING_REPORT_TIMEOUT` | Render deadline exceeded; inspect very large content/runtime resources |
| `MEETING_REPORT_TOO_LARGE` | Explicit document/PDF size limit exceeded; no partial document was returned |
| `MEETING_REPORT_FAILED` | Safe generic rendering/download error, with no raw HTML exposed |

## Rollback

Use the backup directory printed by `Apply-TaskHubPatch.ps1` with `Restore-TaskHubPatch.ps1`. Rebuild/deploy the restored backend and frontend. No SQL rollback is needed. A downloaded browser cache is runtime tooling, not Meeting data, and may remain installed after source rollback.


## Phase 4 activity follow-through

New Decision/Notes and Meeting Action Item lifecycle writes now record human-readable Meeting activity in the same transaction. The report displays these new events; previously missing history is not fabricated or backfilled. Manual export and its authorization/rendering behavior are unchanged.

