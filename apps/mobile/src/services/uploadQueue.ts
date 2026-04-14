/**
 * Persistent upload queue for photos / files captured offline.
 *
 * The generic offline mutation queue in `offline.ts` only handles
 * JSON-body requests (POST/PATCH/PUT/DELETE via axios). Multipart
 * file uploads need a different pipeline because:
 *
 *  1. The source URI returned by ImagePicker / CameraView points to
 *     the OS's temp directory — that URI is invalidated the moment
 *     the user backgrounds the app or reboots the device. We must
 *     COPY the binary to our own persistent directory before the
 *     user can safely walk away.
 *
 *  2. The existing queue serializes the request body to JSON in
 *     AsyncStorage — a 3-MB photo would blow the 6 MB AsyncStorage
 *     per-key limit.
 *
 * Storage layout::
 *
 *     FileSystem.documentDirectory/upload-queue/
 *       ├── <queueId>.jpg      (one file per pending upload)
 *       ├── <queueId>.pdf
 *       └── ...
 *
 *     AsyncStorage["opsflux_upload_queue"] = JSON [{
 *         id, localPath, filename, contentType,
 *         ownerType, ownerId, description?,
 *         createdAt, retries
 *     }, ...]
 *
 * Lifecycle:
 *  - `queueUpload(...)`  : copy binary to persistent dir + append meta
 *  - `flushUploadQueue()` : drains FIFO, deletes each successfully
 *    uploaded file from persistent storage; leaves failures in place
 *    with incremented retry counter (capped at MAX_RETRIES).
 *  - `cancelUpload(id)`  : user-initiated removal — deletes the
 *    local copy and the entry.
 *  - `clearUploadQueue()`: wipes everything (used on logout).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { uploadAttachmentDirect } from "./attachments";
import { useOfflineStore } from "./offline";

const QUEUE_STORAGE_KEY = "opsflux_upload_queue";
const QUEUE_DIR = (FileSystem.documentDirectory ?? "") + "upload-queue/";
const MAX_RETRIES = 5;

export interface QueuedUpload {
  id: string;
  localPath: string;
  filename: string;
  contentType: string;
  ownerType: string;
  ownerId: string;
  description?: string;
  createdAt: number;
  retries: number;
}

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(QUEUE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
    }
  } catch {
    /* next write will surface */
  }
}

async function readQueue(): Promise<QueuedUpload[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedUpload[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
  useOfflineStore.getState().setUploadQueueLength?.(items.length);
}

function uniqueId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

function inferExtension(uri: string): string {
  const lower = uri.toLowerCase();
  const match = lower.match(/\.([a-z0-9]{2,5})(?:\?|$)/);
  return match ? `.${match[1]}` : "";
}

function contentTypeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

/**
 * Persist `sourceUri` to our own directory and register an upload
 * intent. The caller can safely discard `sourceUri` after this.
 *
 * Returns the queue id (a stable short string), usable with
 * `cancelUpload`.
 */
export async function queueUpload(
  sourceUri: string,
  ownerType: string,
  ownerId: string,
  description?: string
): Promise<string> {
  await ensureDir();

  const id = uniqueId();
  const ext = inferExtension(sourceUri) || ".bin";
  const localPath = QUEUE_DIR + id + ext;
  const filename = `upload-${id}${ext}`;

  // Copy (not move) — caller doesn't necessarily own the source, and
  // the OS may block a move from a sandboxed temp dir.
  await FileSystem.copyAsync({ from: sourceUri, to: localPath });

  const item: QueuedUpload = {
    id,
    localPath,
    filename,
    contentType: contentTypeFromUri(sourceUri),
    ownerType,
    ownerId,
    description,
    createdAt: Date.now(),
    retries: 0,
  };

  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
  return id;
}

export async function getPendingUploads(): Promise<QueuedUpload[]> {
  return readQueue();
}

export async function getPendingUploadCount(): Promise<number> {
  const q = await readQueue();
  return q.length;
}

/** Remove a pending upload (user-initiated cancel). */
export async function cancelUpload(id: string): Promise<void> {
  const queue = await readQueue();
  const target = queue.find((u) => u.id === id);
  const remaining = queue.filter((u) => u.id !== id);
  if (target) {
    try {
      await FileSystem.deleteAsync(target.localPath, { idempotent: true });
    } catch {
      /* noop */
    }
  }
  await writeQueue(remaining);
}

/** Nuke every pending upload (e.g. on logout). */
export async function clearUploadQueue(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(QUEUE_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(QUEUE_DIR, { idempotent: true });
    }
  } catch {
    /* noop */
  }
  await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
  useOfflineStore.getState().setUploadQueueLength?.(0);
}

/** Atomic lock — prevent concurrent drains. */
let flushLock = false;

/**
 * Upload every pending file, in FIFO order. Skips if offline. On
 * each item: success → delete local copy + remove from queue,
 * transient failure → increment retry counter and keep, permanent
 * failure (HTTP 4xx) → drop + delete local copy (the file will
 * never upload successfully).
 */
export async function flushUploadQueue(): Promise<{
  success: number;
  failed: number;
  remaining: number;
}> {
  if (flushLock) return { success: 0, failed: 0, remaining: 0 };
  flushLock = true;

  try {
    const store = useOfflineStore.getState();
    if (!store.isOnline) {
      const queue = await readQueue();
      return { success: 0, failed: 0, remaining: queue.length };
    }

    let queue = await readQueue();
    if (queue.length === 0) {
      return { success: 0, failed: 0, remaining: 0 };
    }

    let success = 0;
    let failed = 0;
    const remaining: QueuedUpload[] = [];

    for (const item of queue) {
      // Verify the file still exists — user may have wiped storage
      const info = await FileSystem.getInfoAsync(item.localPath);
      if (!info.exists) {
        failed++;
        continue;
      }

      const result = await uploadAttachmentDirect(
        item.localPath,
        item.ownerType,
        item.ownerId,
        item.description
      );

      if (result.success) {
        success++;
        try {
          await FileSystem.deleteAsync(item.localPath, { idempotent: true });
        } catch {
          /* noop */
        }
      } else if (result.status && result.status >= 400 && result.status < 500) {
        // Permanent server-side rejection — don't retry forever
        failed++;
        try {
          await FileSystem.deleteAsync(item.localPath, { idempotent: true });
        } catch {
          /* noop */
        }
      } else {
        // Transient (network, 5xx, etc.) — keep with bumped retry counter
        item.retries += 1;
        if (item.retries >= MAX_RETRIES) {
          failed++;
          try {
            await FileSystem.deleteAsync(item.localPath, { idempotent: true });
          } catch {
            /* noop */
          }
        } else {
          remaining.push(item);
        }
      }
    }

    await writeQueue(remaining);
    return { success, failed, remaining: remaining.length };
  } finally {
    flushLock = false;
  }
}
