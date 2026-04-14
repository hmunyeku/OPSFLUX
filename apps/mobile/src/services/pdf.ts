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
import { useAuthStore } from "../stores/auth";

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
 * @param apiPath path starting with `/api/v1/...` (NOT a full URL)
 * @param filename the name to save it as (will be sanitized & .pdf appended)
 */
export async function downloadPdf(
  apiPath: string,
  filename: string,
  opts: DownloadPdfOptions = {}
): Promise<PdfDownloadResult> {
  const { accessToken, entityId: storeEntityId, baseUrl } = useAuthStore.getState();
  if (!accessToken) throw new Error("Not authenticated");
  if (!baseUrl) throw new Error("No base URL configured");

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

  const url = baseUrl.replace(/\/$/, "") + apiPath;
  const entityId = opts.entityId ?? storeEntityId;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/pdf",
  };
  if (entityId) headers["X-Entity-Id"] = entityId;

  const { status, uri } = await FileSystem.downloadAsync(url, localUri, {
    headers,
  });

  if (status < 200 || status >= 300) {
    // Clean the partial/empty file so a retry doesn't serve garbage
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      /* noop */
    }
    throw new Error(`Download failed: HTTP ${status}`);
  }

  return { uri, filename: safeName, cached: false };
}

/**
 * Hand a local PDF to the OS share/open sheet.
 * Works for both "view in another app" and "save to files".
 */
export async function openPdf(localUri: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("Le partage n'est pas disponible sur cet appareil.");
  }
  await Sharing.shareAsync(localUri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: "Ouvrir le PDF",
  });
}

/**
 * Convenience: download + open in a single call. Handles the common
 * error cases with user-facing messages but never throws — returns
 * `false` on failure so callers can show a toast.
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
