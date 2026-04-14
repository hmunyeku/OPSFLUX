/**
 * Offline storage and sync engine.
 *
 * Uses AsyncStorage to cache API responses and queue mutations.
 * When connectivity is restored, the queue is drained in order.
 *
 * Architecture:
 *  - Read cache: stores GET responses keyed by URL+params
 *  - Write queue: stores POST/PATCH/PUT/DELETE mutations
 *  - Sync daemon: watches connectivity, flushes queue when online
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { api } from "./api";

// ── Types ─────────────────────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  url: string;
  params?: Record<string, unknown>;
  cachedAt: number;
  ttlMs: number;
}

interface QueuedMutation {
  id: string;
  method: "post" | "patch" | "put" | "delete";
  url: string;
  body?: unknown;
  createdAt: number;
  retries: number;
}

interface OfflineState {
  isOnline: boolean;
  queueLength: number;
  /** Count of pending multipart uploads (photos/files). */
  uploadQueueLength: number;
  syncing: boolean;
  lastSyncAt: number | null;
  setOnline: (online: boolean) => void;
  setQueueLength: (len: number) => void;
  setUploadQueueLength?: (len: number) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSync: (ts: number) => void;
}

// ── Store ─────────────────────────────────────────────────────────────

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  queueLength: 0,
  uploadQueueLength: 0,
  syncing: false,
  lastSyncAt: null,
  setOnline: (online) => set({ isOnline: online }),
  setQueueLength: (len) => set({ queueLength: len }),
  setUploadQueueLength: (len) => set({ uploadQueueLength: len }),
  setSyncing: (syncing) => set({ syncing }),
  setLastSync: (ts) => set({ lastSyncAt: ts }),
}));

// ── Cache Keys ────────────────────────────────────────────────────────

const CACHE_PREFIX = "@opsflux:cache:";
const QUEUE_KEY = "@opsflux:mutation_queue";

function cacheKey(url: string, params?: Record<string, unknown>): string {
  const suffix = params ? JSON.stringify(params) : "";
  return `${CACHE_PREFIX}${url}${suffix}`;
}

// ── Read Cache ────────────────────────────────────────────────────────

/** Default TTL: 30 minutes for cached responses. */
const DEFAULT_TTL = 30 * 60 * 1000;

export async function getCached<T>(
  url: string,
  params?: Record<string, unknown>
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(url, params));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      await AsyncStorage.removeItem(cacheKey(url, params));
      return null;
    }
    return entry.data as T;
  } catch {
    return null;
  }
}

export async function setCache(
  url: string,
  data: unknown,
  params?: Record<string, unknown>,
  ttlMs = DEFAULT_TTL
): Promise<void> {
  const entry: CacheEntry = {
    data,
    url,
    params,
    cachedAt: Date.now(),
    ttlMs,
  };
  await AsyncStorage.setItem(cacheKey(url, params), JSON.stringify(entry));
}

export async function clearCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
  if (cacheKeys.length) await AsyncStorage.multiRemove(cacheKeys);
}

// ── Mutation Queue ────────────────────────────────────────────────────

async function getQueue(): Promise<QueuedMutation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveQueue(queue: QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  useOfflineStore.getState().setQueueLength(queue.length);
}

export async function enqueueMutation(
  method: QueuedMutation["method"],
  url: string,
  body?: unknown
): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const queue = await getQueue();
  queue.push({ id, method, url, body, createdAt: Date.now(), retries: 0 });
  await saveQueue(queue);
  return id;
}

export async function getQueueLength(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  return getQueue();
}

// ── Sync Engine ───────────────────────────────────────────────────────

const MAX_RETRIES = 5;

/** Atomic lock to prevent concurrent flushQueue calls. */
let flushLock = false;

export async function flushQueue(): Promise<{
  success: number;
  failed: number;
}> {
  // Prevent concurrent flushes (race condition fix)
  if (flushLock) return { success: 0, failed: 0 };
  flushLock = true;

  const store = useOfflineStore.getState();
  if (store.syncing || !store.isOnline) {
    flushLock = false;
    return { success: 0, failed: 0 };
  }

  store.setSyncing(true);
  let success = 0;
  let failed = 0;

  try {
    const queue = await getQueue();
    const remaining: QueuedMutation[] = [];

    for (const mutation of queue) {
      try {
        await api.request({
          method: mutation.method,
          url: mutation.url,
          data: mutation.body,
        });
        success++;
      } catch (err: any) {
        mutation.retries++;
        // Don't retry 4xx errors (client errors) — they'll never succeed
        if (err?.response?.status >= 400 && err?.response?.status < 500) {
          failed++;
        } else if (mutation.retries < MAX_RETRIES) {
          remaining.push(mutation);
        } else {
          failed++;
        }
      }
    }

    await saveQueue(remaining);
    if (success > 0) {
      store.setLastSync(Date.now());
    }
  } finally {
    store.setSyncing(false);
    flushLock = false;
  }

  return { success, failed };
}

// ── Connectivity Listener ─────────────────────────────────────────────

let unsubscribeNetInfo: (() => void) | null = null;

export function startConnectivityMonitor(): void {
  if (unsubscribeNetInfo) return;

  unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
    const wasOffline = !useOfflineStore.getState().isOnline;
    const isNowOnline = state.isConnected ?? false;

    useOfflineStore.getState().setOnline(isNowOnline);

    // Auto-flush queues when coming back online. JSON mutations first
    // (usually the resource the upload targets — e.g. a cargo receipt
    // confirmation — needs to exist before its attachments can be
    // posted). Uploads second.
    if (wasOffline && isNowOnline) {
      (async () => {
        try {
          await flushQueue();
        } catch {
          /* best-effort */
        }
        try {
          const { flushUploadQueue } = await import("./uploadQueue");
          await flushUploadQueue();
        } catch {
          /* best-effort */
        }
      })();
    }
  });
}

export function stopConnectivityMonitor(): void {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
}

// ── Offline-aware API helpers ─────────────────────────────────────────

/**
 * Fetch with offline fallback: tries the API first, falls back to cache.
 * When online, caches the fresh response for future offline use.
 */
export async function fetchWithOfflineFallback<T>(
  url: string,
  params?: Record<string, unknown>
): Promise<{ data: T; fromCache: boolean }> {
  const { isOnline } = useOfflineStore.getState();

  if (isOnline) {
    try {
      const { data } = await api.get<T>(url, { params });
      await setCache(url, data, params);
      return { data, fromCache: false };
    } catch {
      // Network error — fall back to cache
      const cached = await getCached<T>(url, params);
      if (cached) return { data: cached, fromCache: true };
      throw new Error("Pas de connexion et aucune donnée en cache.");
    }
  }

  const cached = await getCached<T>(url, params);
  if (cached) return { data: cached, fromCache: true };
  throw new Error("Pas de connexion et aucune donnée en cache.");
}

/**
 * Mutate with offline queue: tries the API first, queues on failure.
 * Returns true if sent immediately, false if queued.
 */
export async function mutateWithOfflineQueue(
  method: QueuedMutation["method"],
  url: string,
  body?: unknown
): Promise<{ sent: boolean; queueId?: string }> {
  const { isOnline } = useOfflineStore.getState();

  if (isOnline) {
    try {
      await api.request({ method, url, data: body });
      return { sent: true };
    } catch (err: any) {
      // 4xx = client error, don't queue
      if (err?.response?.status >= 400 && err?.response?.status < 500) {
        throw err;
      }
      // Network / 5xx — queue for retry
      const queueId = await enqueueMutation(method, url, body);
      return { sent: false, queueId };
    }
  }

  const queueId = await enqueueMutation(method, url, body);
  return { sent: false, queueId };
}
