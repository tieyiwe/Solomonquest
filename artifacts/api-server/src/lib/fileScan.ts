import { logger } from "./logger";

// Attachment types the chat feature actually needs to support. Anything
// else — executables, scripts, installers, archives that can hide either —
// is rejected outright regardless of what a scan says.
const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "heic", "bmp", "svg",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "rtf",
]);

const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "msp", "scr", "dll", "sys",
  "sh", "bash", "zsh", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh",
  "jar", "apk", "app", "deb", "rpm", "dmg", "iso", "bin", "run",
  "zip", "rar", "7z", "tar", "gz", // archives can smuggle any of the above
]);

export interface ScanResult {
  allowed: boolean;
  reason?: string;
}

function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/** Cheap magic-byte check for a file pretending to be something it isn't
 * (e.g. a renamed .exe uploaded as "invoice.pdf"). Not a substitute for real
 * AV, but catches the most common disguise attempts instantly and for free. */
function looksLikeExecutable(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const head4 = buffer.subarray(0, 4);
  // Windows PE ("MZ"), Linux ELF, Java class/jar-as-zip with class entries
  if (head4[0] === 0x4d && head4[1] === 0x5a) return true; // "MZ"
  if (head4[0] === 0x7f && head4[1] === 0x45 && head4[2] === 0x4c && head4[3] === 0x46) return true; // \x7fELF
  // Shebang script
  if (buffer[0] === 0x23 && buffer[1] === 0x21) return true; // "#!"
  return false;
}

/**
 * Scans an uploaded file before it's ever stored or shown to anyone.
 *
 * If VIRUSTOTAL_API_KEY is configured, submits the file to VirusTotal and
 * waits (briefly) for a verdict — any engine flagging it as malicious blocks
 * the upload. Without a key configured, falls back to extension allow/deny
 * lists plus a magic-byte executable check; this is a real but limited
 * safety net, not equivalent to a full antivirus scan.
 */
export async function scanFile(buffer: Buffer, filename: string): Promise<ScanResult> {
  const ext = getExtension(filename);

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: "This file type isn't allowed for security reasons." };
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: "Unsupported file type. Please share a document or image." };
  }
  if (looksLikeExecutable(buffer)) {
    return { allowed: false, reason: "This file was flagged as potentially unsafe and was not sent." };
  }

  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) {
    logger.warn(
      "VIRUSTOTAL_API_KEY not configured — chat attachments are only checked against a file-type allowlist, not scanned for malware."
    );
    return { allowed: true };
  }

  try {
    return await scanWithVirusTotal(buffer, filename, apiKey);
  } catch (err) {
    logger.error({ err }, "VirusTotal scan failed; rejecting attachment to be safe");
    return { allowed: false, reason: "Could not verify this file is safe right now. Please try again shortly." };
  }
}

async function scanWithVirusTotal(buffer: Buffer, filename: string, apiKey: string): Promise<ScanResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);

  const uploadRes = await fetch("https://www.virustotal.com/api/v3/files", {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body: form,
  });

  if (!uploadRes.ok) {
    throw new Error(`VirusTotal upload failed: ${uploadRes.status}`);
  }

  const uploadData = (await uploadRes.json()) as { data?: { id?: string } };
  const analysisId = uploadData.data?.id;
  if (!analysisId) throw new Error("VirusTotal did not return an analysis id");

  // Poll for a verdict for up to ~20 seconds; VirusTotal analyses are
  // usually fast for common file types but not instant.
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));

    const analysisRes = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey },
    });
    if (!analysisRes.ok) continue;

    const analysis = (await analysisRes.json()) as {
      data?: { attributes?: { status?: string; stats?: { malicious?: number; suspicious?: number } } };
    };
    const attrs = analysis.data?.attributes;
    if (attrs?.status !== "completed") continue;

    const malicious = attrs.stats?.malicious ?? 0;
    const suspicious = attrs.stats?.suspicious ?? 0;
    if (malicious > 0 || suspicious > 1) {
      return { allowed: false, reason: "This file was flagged as potentially unsafe and was not sent." };
    }
    return { allowed: true };
  }

  // No verdict in time — fail closed rather than silently skip the scan.
  return { allowed: false, reason: "Could not verify this file is safe in time. Please try again." };
}
