import { open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This relative location works from both server/src/modules and server/dist/modules.
const serverRoot = fileURLToPath(new URL("../../../", import.meta.url));
const maxLogoBytes = 1_048_576;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Only a local, bounded PNG is supported. Never fetch remote images using Meeting data. */
export async function loadMeetingReportLogo(configuredPath?: string): Promise<string | null> {
  const candidates = configuredPath
    ? [path.resolve(serverRoot, configuredPath)]
    : [
        path.resolve(serverRoot, "../client/public/images/fullLogo.png"),
        path.resolve(serverRoot, "../client/dist/images/fullLogo.png"),
      ];
  for (const candidate of candidates) {
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(candidate, "r");
      const stat = await file.stat();
      if (!stat.isFile() || stat.size < 24 || stat.size > maxLogoBytes) continue;
      // Bounded read also protects against a file growing after stat().
      const buffer = Buffer.alloc(maxLogoBytes + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead < 24 || bytesRead > maxLogoBytes) continue;
      const bytes = buffer.subarray(0, bytesRead);
      if (!bytes.subarray(0, 8).equals(pngSignature)) continue;
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (!width || !height || width > 4096 || height > 4096) continue;
      return `data:image/png;base64,${bytes.toString("base64")}`;
    } catch {
      // The text-only QNH brand is a deliberate fallback for source-only or backend-only deployments.
    } finally {
      await file?.close().catch(() => undefined);
    }
  }
  return null;
}
