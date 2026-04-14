/**
 * Permissions store — fetched from /api/v1/auth/me/permissions on login.
 *
 * Permission matching supports wildcards:
 *  - "*"                 → super-admin (grants everything)
 *  - "module.*"          → all permissions in module
 *  - "module.resource.*" → all actions on resource
 */

import { create } from "zustand";
import { api } from "../services/api";

interface PermissionsState {
  permissions: string[];
  loaded: boolean;
  loading: boolean;

  fetchPermissions: () => Promise<void>;
  has: (permission: string) => boolean;
  hasAny: (permissions: string[]) => boolean;
  hasAll: (permissions: string[]) => boolean;
  clear: () => void;
}

/**
 * Check if `granted` satisfies the requested permission.
 * Supports wildcards:
 *   granted "*"                        matches anything
 *   granted "paxlog.*"                 matches "paxlog.ads.read", "paxlog.ads.approve", etc.
 *   granted "paxlog.ads.*"             matches "paxlog.ads.read", "paxlog.ads.approve"
 *   granted "paxlog.ads.read" (exact)  matches only "paxlog.ads.read"
 */
function permissionMatches(granted: string, requested: string): boolean {
  if (granted === "*") return true;
  if (granted === requested) return true;

  if (granted.endsWith(".*")) {
    const prefix = granted.slice(0, -1); // "paxlog." including the dot
    return requested.startsWith(prefix);
  }

  return false;
}

/** Check if user's grants include a given permission (respecting wildcards). */
function checkPermission(grants: string[], requested: string): boolean {
  return grants.some((g) => permissionMatches(g, requested));
}

export const usePermissions = create<PermissionsState>((set, get) => ({
  permissions: [],
  loaded: false,
  loading: false,

  fetchPermissions: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get<string[]>("/api/v1/auth/me/permissions");
      set({ permissions: data, loaded: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  has: (permission: string) => {
    return checkPermission(get().permissions, permission);
  },

  hasAny: (permissions: string[]) => {
    const grants = get().permissions;
    return permissions.some((p) => checkPermission(grants, p));
  },

  hasAll: (permissions: string[]) => {
    const grants = get().permissions;
    return permissions.every((p) => checkPermission(grants, p));
  },

  clear: () => set({ permissions: [], loaded: false }),
}));

// Exported for tests
export { permissionMatches, checkPermission };
