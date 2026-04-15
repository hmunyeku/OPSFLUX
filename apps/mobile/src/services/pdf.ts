/**
 * PDF service — authenticated download + cache + open via system viewer.
 *
 * Backend PDFs we expose:
 *   - ADS:             GET /api/v1/ads/{id}/pdf
 *   - Voyage PAX:      GET /api/v1/voyages/{id}/pdf/pax-manifest
 *   - Voyage Cargo:    GET /api/v1/voyages/{id}/pdf/cargo-manifest
 *   - Cargo LT:        GET /api/v1/cargo-requests/{id}/pdf/lt
 *   - AVM:             GET /api/v1/avm/{id}/pdf
 *   - Attachment:      GET /api/v1/attachments/{id}/download
 *
 * Behaviour
 * ---------
 * `downloadPdf(path, filename)` fetches the PDF with JWT + entity
 * headers, saves it to `cacheDirectory/opsflux-pdf/<filename>` and
 * returns the local `file://` URI. The cache survives app kills, so
 * a PDF downloaded online can be re-opened offline.
 *
 * `openPdf(localUri)` hands the file to the system viewer via
 * expo-sharing — works on both iOS ("Open in…") and Android
 * (Intent chooser). If sharing isn't available (very rare), falls
 * back to an Alert with the local path for diagnostics.
 *
 * Cache invalidation: each PDF is keyed by its filename. If you want
 * a fresh copy (e.g. status changed server-side), pass
 * `{ forceFresh: true }`.
 */

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "./api";
import { useAuthStore } from "../stores/auth";

/**
 * Convert a JS ArrayBuffer to a base64 string. Hermes/JSC doesn't ship
 * Buffer, so we do it manually. Kept small — PDF tickets are typically
 * a few KB so we don't need streaming.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000; // prevent call-stack overflow on large buffers
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  // globalThis.btoa exists on RN but not everywhere — inline fallback.
  if (typeof (globalThis as any).btoa === "function") {
    return (globalThis as any).btoa(binary);
  }
  // Minimal base64 encoder — only needed on ancient engines.
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  while (i < binary.length) {
    const c1 = binary.charCodeAt(i++) & 0xff;
    const c2 = i < binary.length ? binary.charCodeAt(i++) & 0xff : NaN;
    const c3 = i < binary.length ? binary.charCodeAt(i++) & 0xff : NaN;
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4);
    const e3 = isNaN(c2)
      ? 64
      : ((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6);
    const e4 = isNaN(c3) ? 64 : c3 & 63;
    out +=
      chars.charAt(e1) +
      chars.charAt(e2) +
      (e3 === 64 ? "=" : chars.charAt(e3)) +
      (e4 === 64 ? "=" : chars.charAt(e4));
  }
  return out;
}

const CACHE_DIR = (FileSystem.cacheDirectory ?? "") + "opsflux-pdf/";

async function ensureCacheDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
  } catch {
    /* noop — next write will surface the error */
  }
}

export interface DownloadPdfOptions {
  /** Skip the cache and re-fetch from the server. */
  forceFresh?: boolean;
  /** Explicit entity id override (otherwise read from auth store). */
  entityId?: string;
}

export interface PdfDownloadResult {
  uri: string;
  filename: string;
  cached: boolean;
}

function sanitizeFilename(name: string): string {
  // Keep it safe for every filesystem + URL encoding
  const cleaned = name.replace(/[^\w.\-()]+/g, "_");
  const withExt = cleaned.toLowerCase().endsWith(".pdf")
    ? cleaned
    : cleaned + ".pdf";
  return withExt.slice(0, 120);
}

/**
 * Download a PDF from the backend using the current auth session.
 *
 * Uses our axios instance (which auto-refreshes expired JWT tokens
 * via the response interceptor) and writes the bytes to the cache
 * directory. The previous implementation used FileSystem.downloadAsync
 * which bypasses interceptors — so any expired access_token caused a
 * silent 401 and an opaque "download failed" toast on the client.
 *
 * @param apiPath path starting with `/api/v1/...` (NOT a full URL)
 * @param filename the name to save it as (will be sanitized & .pdf appended)
 */
export async function downloadPdf(
  apiPath: string,
  filename: string,
  opts: DownloadPdfOptions = {}
): Promise<PdfDownloadResult> {
  const { accessToken, entityId: storeEntityId } = useAuthStore.getState();
  if (!accessToken) throw new Error("Not authenticated");

  await ensureCacheDir();
  const safeName = sanitizeFilename(filename);
  const localUri = CACHE_DIR + safeName;

  // Return from cache unless caller forced a refresh.
  if (!opts.forceFresh) {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists && info.size && info.size > 0) {
      return { uri: localUri, filename: safeName, cached: true };
    }
  }

  // Fetch via axios → auto-refresh on 401, consistent 403/503 handling,
  // correct baseURL wiring. We ask for an arraybuffer so we get the raw
  // PDF bytes and not a decoded JSON/string.
  const headers: Record<string, string> = { Accept: "application/pdf" };
  const entityOverride = opts.entityId ?? storeEntityId;
  if (entityOverride) headers["X-Entity-Id"] = entityOverride;

  let response;
  try {
    response = await api.get(apiPath, {
      responseType: "arraybuffer",
      // 45s — large voyage manifest PDFs can take a few seconds to
      // render server-side.
      timeout: 45_000,
      headers,
    });
  } catch (err: any) {
    const status = err?.response?.status;
    const bodyBytes: ArrayBuffer | undefined = err?.response?.data;
    // Surface the actual API message — backend returns JSON with
    // `detail`, but in arraybuffer mode that arrives as bytes. Decode
    // a short slice to a string for diagnostics.
    let hint = "";
    if (bodyBytes && bodyBytes.byteLength > 0) {
      try {
        const bytes = new Uint8Array(
          bodyBytes.slice(0, Math.min(400, bodyBytes.byteLength))
        );
        let text = "";
        for (let i = 0; i < bytes.length; i++) {
          text += String.fromCharCode(bytes[i]);
        }
        const parsed = JSON.parse(text);
        if (parsed?.detail && typeof parsed.detail === "string") {
          hint = ` — ${parsed.detail}`;
        }
      } catch {
        /* body isn't JSON, ignore */
      }
    }
    throw new Error(
      `PDF indisponible${status ? ` (HTTP ${status})` : ""}${hint}`
    );
  }

  // Persist the arraybuffer to disk as base64 — expo-file-system
  // doesn't yet support direct arraybuffer writes.
  const base64 = arrayBufferToBase64(response.data as ArrayBuffer);
  await FileSystem.writeAsStringAsync(localUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { uri: localUri, filename: safeName, cached: false };
}

/**
 * Open a local PDF with the system PDF viewer.
 *
 * On Android we use the native Intent system via IntentLauncher with a
 * ``content://`` URI produced by ``FileSystem.getContentUriAsync`` —
 * this launches the user's default PDF reader in VIEW mode (no share
 * sheet). Falls back to expo-sharing if the intent fails (no PDF
 * viewer installed).
 *
 * On iOS the only reliable way to view a file from cache is the
 * document-interaction sheet provided by expo-sharing; there's no
 * pure "open in reader" intent. Users tap "Open in Files / Books /
 * whatever" which is the platform norm.
 */
export async function openPdf(localUri: string): Promise<void> {
  const { Platform } = await import("react-native");

  if (Platform.OS === "android") {
    try {
      const IntentLauncher = await import("expo-intent-launcher");
      const contentUri = await FileSystem.getContentUriAsync(localUri);
      await IntentLauncher.startActivityAsync(
        "android.intent.action.VIEW",
        {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: "application/pdf",
        }
      );
      return;
    } catch (err) {
      // No PDF reader installed, or intent rejected — fall through to
      // the share sheet so the user can at least pick a handler.
    }
  }

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("Aucun lecteur PDF disponible sur cet appareil.");
  }
  await Sharing.shareAsync(localUri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: "Ouvrir le PDF",
  });
}

/**
 * Save a PDF into the user-visible Downloads folder (Android) via the
 * StorageAccessFramework. On iOS this falls back to sharing since the
 * platform has no "Downloads" folder accessible to third parties.
 *
 * Returns the final location's URI so the caller can optionally open
 * it too.
 */
export async function savePdfToDownloads(
  localUri: string,
  filename: string
): Promise<string | null> {
  const { Platform } = await import("react-native");
  if (Platform.OS !== "android") {
    // iOS — share sheet is the platform norm.
    await openPdf(localUri);
    return null;
  }
  try {
    const safe = sanitizeFilename(filename);
    // SAF (Storage Access Framework) lets us write to Downloads without
    // needing WRITE_EXTERNAL_STORAGE permission on Android 10+.
    const perms = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perms.granted) {
      // User denied — fall back to the share sheet so they can save
      // via Files / Drive etc.
      await openPdf(localUri);
      return null;
    }
    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      perms.directoryUri,
      safe,
      "application/pdf"
    );
    const data = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(destUri, data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return destUri;
  } catch {
    // Any failure → fall back to share sheet.
    await openPdf(localUri);
    return null;
  }
}

/**
 * Convenience: download + open in the system PDF viewer.
 *
 * Unlike ``savePdfToDownloads`` (which prompts the user to pick a save
 * location), this just opens the PDF in the platform's PDF reader —
 * the expected behaviour when the user taps a "Download PDF" button on
 * a detail screen. Never throws.
 */
export async function downloadAndOpenPdf(
  apiPath: string,
  filename: string,
  opts: DownloadPdfOptions = {}
): Promise<{ ok: true; uri: string } | { ok: false; error: string }> {
  try {
    const { uri } = await downloadPdf(apiPath, filename, opts);
    await openPdf(uri);
    return { ok: true, uri };
  } catch (err: any) {
    const msg = err?.message ?? "Erreur inconnue";
    return { ok: false, error: msg };
  }
}

/**
 * Convenience: download + save to the user-visible Downloads folder.
 *
 * On Android this is the "save this to my device" flow — user picks a
 * destination via the system picker, file lands in their chosen
 * directory, nothing is opened. On iOS falls back to the share sheet
 * (iOS has no user-accessible Downloads folder for third-party apps).
 */
export async function downloadAndSavePdf(
  apiPath: string,
  filename: string,
  opts: DownloadPdfOptions = {}
): Promise<{ ok: true; uri: string | null } | { ok: false; error: string }> {
  try {
    const { uri: cacheUri, filename: safeName } = await downloadPdf(
      apiPath,
      filename,
      opts
    );
    const savedAt = await savePdfToDownloads(cacheUri, safeName);
    return { ok: true, uri: savedAt };
  } catch (err: any) {
    const msg = err?.message ?? "Erreur inconnue";
    return { ok: false, error: msg };
  }
}

/**
 * Clear the entire PDF cache (e.g. on logout or low-storage warning).
 */
export async function clearPdfCache(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    }
  } catch {
    /* noop */
  }
}
