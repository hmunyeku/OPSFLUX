/**
 * Permissions store — fetched from /api/v1/auth/me/permissions on login.
 *
 * Used to filter:
 *  - Which portals are visible
 *  - Which actions/forms appear in portals
 *  - Which screens/features are accessible
 */

import { create } from "zustand";
import { api } from "../services/api";

interface PermissionsState {
  permissions: string[];
  loaded: boolean;
  loading: boolean;

  /** Fetch permissions from server. */
  fetchPermissions: () => Promise<void>;

  /** Check if user has a specific permission. */
  has: (permission: string) => boolean;

  /** Check if user has ANY of the given permissions. */
  hasAny: (permissions: string[]) => boolean;

  /** Check if user has ALL of the given permissions. */
  hasAll: (permissions: string[]) => boolean;

  /** Clear on logout. */
  clear: () => void;
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
    return get().permissions.includes(permission);
  },

  hasAny: (permissions: string[]) => {
    const mine = get().permissions;
    return permissions.some((p) => mine.includes(p));
  },

  hasAll: (permissions: string[]) => {
    const mine = get().permissions;
    return permissions.every((p) => mine.includes(p));
  },

  clear: () => set({ permissions: [], loaded: false }),
}));
