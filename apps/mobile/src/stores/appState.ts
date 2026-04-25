/**
 * App-level state — account blocked, force update, maintenance mode.
 *
 * These states override the entire UI with blocking screens.
 * They are set by:
 *  1. The API interceptor on specific 403/503 responses
 *  2. The bootstrap response
 *  3. The token refresh failure (401 with account status)
 */

import { create } from "zustand";

type BlockReason = "blocked" | "suspended" | "deleted" | "deactivated" | null;

interface AppStateStore {
  /** Account blocked/suspended/deleted. */
  accountBlocked: boolean;
  blockReason: BlockReason;
  blockMessage: string | null;

  /** App needs updating. */
  updateRequired: boolean;
  updateSoft: boolean;
  requiredVersion: string | null;

  /** Server in maintenance. */
  maintenance: boolean;
  maintenanceMessage: string | null;

  /** Actions. */
  setAccountBlocked: (reason: BlockReason, message?: string) => void;
  setUpdateRequired: (required: boolean, version?: string, soft?: boolean) => void;
  setMaintenance: (active: boolean, message?: string) => void;
  clear: () => void;
}

export const useAppState = create<AppStateStore>((set) => ({
  accountBlocked: false,
  blockReason: null,
  blockMessage: null,

  updateRequired: false,
  updateSoft: false,
  requiredVersion: null,

  maintenance: false,
  maintenanceMessage: null,

  setAccountBlocked: (reason, message) =>
    set({
      accountBlocked: reason !== null,
      blockReason: reason,
      blockMessage: message ?? null,
    }),

  setUpdateRequired: (required, version, soft) =>
    set({
      updateRequired: required,
      requiredVersion: version ?? null,
      updateSoft: soft ?? false,
    }),

  setMaintenance: (active, message) =>
    set({ maintenance: active, maintenanceMessage: message ?? null }),

  clear: () =>
    set({
      accountBlocked: false,
      blockReason: null,
      blockMessage: null,
      updateRequired: false,
      updateSoft: false,
      requiredVersion: null,
      maintenance: false,
      maintenanceMessage: null,
    }),
}));
