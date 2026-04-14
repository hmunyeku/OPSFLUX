/**
 * Attachments service — upload photos and files to the backend.
 *
 * Backend endpoint:  POST /api/v1/attachments (multipart/form-data)
 * Fields:
 *   - file:         UploadFile (the binary)
 *   - owner_type:   e.g. "cargo_request", "cargo", "ads", "mission_notice"
 *   - owner_id:     UUID of the resource this attachment is linked to
 *   - description:  optional text
 *
 * Returns AttachmentRead with id, storage_path, size_bytes, etc.
 */

import { api } from "./api";
import { useAuthStore } from "../stores/auth";

export interface Attachment {
  id: string;
  owner_type: string;
  owner_id: string;
  filename: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  description: string | null;
  uploaded_by: string;
  entity_id: string | null;
  created_at: string;
}

export interface UploadResult {
  success: boolean;
  attachment?: Attachment;
  error?: string;
  uri: string;
}

/** Infer content type from a file URI. */
function contentTypeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function filenameFromUri(uri: string): string {
  const parts = uri.split("/");
  const last = parts[parts.length - 1];
  return last.split("?")[0] || "file";
}

/**
 * Upload a single photo/file to the backend.
 *
 * Uses native fetch multipart rather than axios, because axios on RN
 * has inconsistent FormData handling between iOS and Android.
 */
export async function uploadAttachment(
  uri: string,
  ownerType: string,
  ownerId: string,
  description?: string
): Promise<UploadResult> {
  const { accessToken, entityId, baseUrl } = useAuthStore.getState();
  if (!accessToken) {
    return { success: false, error: "Not authenticated", uri };
  }

  const form = new FormData();
  // React Native FormData accepts { uri, name, type }
  form.append("file", {
    uri,
    name: filenameFromUri(uri),
    type: contentTypeFromUri(uri),
  } as any);
  form.append("owner_type", ownerType);
  form.append("owner_id", ownerId);
  if (description) form.append("description", description);

  try {
    const resp = await fetch(`${baseUrl}/api/v1/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(entityId ? { "X-Entity-Id": entityId } : {}),
        // Important: let fetch set Content-Type with the boundary.
      },
      body: form as any,
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        success: false,
        error: `${resp.status}: ${text.slice(0, 200)}`,
        uri,
      };
    }

    const attachment = await resp.json();
    return { success: true, attachment, uri };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "Upload failed",
      uri,
    };
  }
}

/**
 * Upload multiple photos with progress callback.
 * Never throws — returns per-item results.
 */
export async function uploadAttachments(
  uris: string[],
  ownerType: string,
  ownerId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  for (let i = 0; i < uris.length; i++) {
    const result = await uploadAttachment(uris[i], ownerType, ownerId);
    results.push(result);
    onProgress?.(i + 1, uris.length);
  }
  return results;
}

/**
 * List attachments for a given resource.
 */
export async function listAttachments(
  ownerType: string,
  ownerId: string
): Promise<Attachment[]> {
  const { data } = await api.get<Attachment[]>("/api/v1/attachments", {
    params: { owner_type: ownerType, owner_id: ownerId },
  });
  return data;
}

/**
 * Build a download URL for an attachment (requires auth header).
 */
export function attachmentDownloadUrl(attachmentId: string): string {
  const { baseUrl } = useAuthStore.getState();
  return `${baseUrl}/api/v1/attachments/${attachmentId}/download`;
}

/**
 * Delete an attachment.
 */
export async function deleteAttachment(attachmentId: string): Promise<void> {
  await api.delete(`/api/v1/attachments/${attachmentId}`);
}
