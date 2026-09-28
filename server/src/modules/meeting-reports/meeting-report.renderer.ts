import { chromium, type Browser } from "playwright-core";
import { AppError } from "../../shared/errors/app-error.js";
import type { MeetingReportDocument } from "./meeting-report.types.js";

export interface MeetingReportRendererOptions {
  executablePath?: string | undefined;
  channel?: "chromium" | "msedge" | "chrome" | undefined;
  timeoutMs?: number | undefined;
  /** Production uses the Chromium sandbox. False is for an isolated root-run test container only. */
  sandbox?: boolean | undefined;
}

function aborted(): AppError {
  return new AppError({ statusCode: 499, code: "MEETING_REPORT_ABORTED", message: "Report generation was cancelled." });
}

export function createMeetingReportRenderer(options: MeetingReportRendererOptions = {}) {
  return async (document: MeetingReportDocument, signal?: AbortSignal): Promise<Buffer> => {
    const documentBytes = Buffer.byteLength(document.html) + Buffer.byteLength(document.headerTemplate) + Buffer.byteLength(document.footerTemplate);
    if (documentBytes > 8 * 1024 * 1024) {
      throw new AppError({ statusCode: 413, code: "MEETING_REPORT_TOO_LARGE", message: "This Meeting report exceeds the supported document size. No sections were silently removed." });
    }
    if (signal?.aborted) throw aborted();
    const timeoutMs = options.timeoutMs ?? 45_000;
    let browser: Browser;
    try {
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: options.sandbox ?? true,
        timeout: Math.min(timeoutMs, 15_000),
        ...(options.executablePath ? { executablePath: options.executablePath } : options.channel ? { channel: options.channel } : {}),
      });
    } catch {
      throw new AppError({
        statusCode: 503, code: "MEETING_REPORT_RENDERER_UNAVAILABLE",
        message: "The PDF browser could not start. Ask the administrator to install the report browser or check the configured browser path.",
      });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      if (signal?.aborted) throw aborted();
      const cancelledOrTimedOut = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new AppError({
          statusCode: 504, code: "MEETING_REPORT_TIMEOUT", message: "PDF generation took too long. Please try again.",
        })), timeoutMs);
        onAbort = () => reject(aborted());
        signal?.addEventListener("abort", onAbort, { once: true });
      });
      const render = async (): Promise<Buffer> => {
        const context = await browser.newContext({
          javaScriptEnabled: false,
          serviceWorkers: "block",
          acceptDownloads: false,
          offline: true,
        });
        // Defence in depth alongside HTML escaping, disabled JavaScript and the document CSP.
        await context.route("**/*", (route) => route.abort());
        const page = await context.newPage();
        page.setDefaultTimeout(timeoutMs);
        await page.setContent(document.html, { waitUntil: "load", timeout: timeoutMs });
        // Controller evaluation is available even when page-authored JavaScript is disabled.
        await page.evaluate("document.fonts.ready.then(() => true)");
        return page.pdf({
          format: "A4", preferCSSPageSize: true, printBackground: true,
          displayHeaderFooter: true, headerTemplate: document.headerTemplate, footerTemplate: document.footerTemplate,
          margin: { top: "17mm", bottom: "18mm", left: "15mm", right: "15mm" },
          tagged: true, outline: true,
        });
      };
      const buffer = await Promise.race([render(), cancelledOrTimedOut]);
      if (buffer.length > 20 * 1024 * 1024) {
        throw new AppError({ statusCode: 413, code: "MEETING_REPORT_TOO_LARGE", message: "The generated report exceeds the supported PDF size." });
      }
      if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("Invalid PDF response from the renderer.");
      }
      return buffer;
    } catch (error) {
      if (error instanceof AppError) throw error;
      // Do not include browser call logs or raw HTML (which can contain Meeting data) in API errors.
      throw new AppError({ statusCode: 500, code: "MEETING_REPORT_FAILED", message: "The Meeting report could not be generated. Please try again." });
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) signal?.removeEventListener("abort", onAbort);
      // Closing the browser also terminates a timed-out page and its isolated context.
      await browser.close().catch(() => undefined);
    }
  };
}
