/**
 * Sync Manifest — Epicollect-style auto-refresh of server-driven config.
 *
 * Periodically (every 15 min in foreground), and on every meaningful event
 * (app foreground, network online, manual refresh), we poll
 * GET /api/v1/mobile/sync-manifest which returns hashes for forms,
 * portals, i18n, settings and permissions.
 *
 * If the `bootstrap_hash` differs from what we have locally, we trigger
 * a full bootstrap reload to refresh the data. Per-block hashes are stored
 * for future delta-sync (only refresh what changed) but currently we
 * always reload everything when anything changes — simpler and still
 * efficient because the bootstrap is only called when something has
 * actually changed.
 *
 * Triggers wired in App.tsx:
 *   - App start → first sync after bootstrap
 *   - AppState change "background" → "active"   (foreground)
 *   - useOfflineStore.isOnline change false → true   (network restored)
 *   - setInterval(15 min) while app is in foreground
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { api } from "./api";
import { useOfflineStore } from "./offline";

const STORAGE_KEY = "@opsflux:sync-manifest:v1";
const POLL_INTERVAL_MS = 15 * 60_000; // 15 minutes

export interface SyncManifest {
  bootstrap_hash: string;
  forms: Record<string, string>;
  portals_hash: string;
  i18n_hash: string;
  settings_hash: string;
  permissions_hash: string;
  lookups_hashes: Record<string, string>;
  server_time: string;
}

interface SyncStore {
  /** Last manifest we received from the server. */
  lastManifest: SyncManifest | null;
  /** Hash we successfully synced last (== bootstrap_hash). */
  syncedHash: string;
  /** True while a check is in flight. */
  checking: boolean;
  /** Last check timestamp (UTC ms). */
  lastCheckedAt: number | null;
  /** ISO 8601 server time of the last manifest. */
  lastServerTime: string | null;
}

export const useSyncStore = create<SyncStore>(() => ({
  lastManifest: null,
  syncedHash: "",
  checking: false,
  lastCheckedAt: null,
  lastServerTime: null,
}));

let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Hydrate the locally-stored synced hash so we don't redownload at every
 * cold-start when nothing has changed.
 */
export async function hydrateSyncHash(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      useSyncStore.setState({
        syncedHash: parsed.syncedHash ?? "",
        lastManifest: parsed.lastManifest ?? null,
        lastServerTime: parsed.lastServerTime ?? null,
      });
    }
  } catch {
    /* ignore */
  }
}

/** Persist the current synced hash + manifest to AsyncStorage. */
async function persist(): Promise<void> {
  try {
    const { syncedHash, lastManifest, lastServerTime } = useSyncStore.getState();
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ syncedHash, lastManifest, lastServerTime })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Check the server for changes. If anything changed, run `onChanged`
 * (typically refetching the bootstrap). Returns true if a change was
 * detected.
 */
export async function checkAndSync(
  onChanged: (manifest: SyncManifest) => Promise<void>
): Promise<boolean> {
  if (useSyncStore.getState().checking) return false;
  if (!useOfflineStore.getState().isOnline) return false;

  useSyncStore.setState({ checking: true });
  try {
    const { data } = await api.get<SyncManifest>("/api/v1/mobile/sync-manifest");
    const previous = useSyncStore.getState().syncedHash;
    useSyncStore.setState({
      lastManifest: data,
      lastServerTime: data.server_time,
      lastCheckedAt: Date.now(),
    });

    // First call after a fresh bootstrap (previous == "") is a baseline-
    // capture — don't trigger a reload, just remember the server's hash.
    if (!previous) {
      useSyncStore.setState({ syncedHash: data.bootstrap_hash });
      await persist();
      return false;
    }

    if (previous !== data.bootstrap_hash) {
      // Something changed — refresh
      await onChanged(data);
      useSyncStore.setState({ syncedHash: data.bootstrap_hash });
      await persist();
      return true;
    }

    await persist(); // still persist the timestamp
    return false;
  } catch {
    return false;
  } finally {
    useSyncStore.setState({ checking: false });
  }
}

/**
 * Mark the current bootstrap as the "synced" baseline. Call this after
 * a successful manual bootstrap reload, so the next checkAndSync compares
 * against this hash.
 */
export function setSyncBaseline(bootstrap_hash: string): void {
  useSyncStore.setState({ syncedHash: bootstrap_hash });
  persist().catch(() => {});
}

/**
 * Start the periodic polling (every 15 min). Idempotent.
 */
export function startSyncPolling(
  onChanged: (manifest: SyncManifest) => Promise<void>
): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    checkAndSync(onChanged).catch(() => {});
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the polling timer (e.g. on logout).
 */
export function stopSyncPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
