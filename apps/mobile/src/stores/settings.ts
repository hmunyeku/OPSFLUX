/**
 * Server settings store — loaded from bootstrap.
 *
 * Holds user preferences + entity-level settings from the OpsFlux server.
 * Used to drive behavior like:
 *  - Default SMS/notification channel preference
 *  - Module feature flags
 *  - Date/time formats
 *  - Custom labels
 */

import { create } from "zustand";

interface SettingsState {
  /** User-level preferences from Setting(scope='user'). */
  userSettings: Record<string, string>;
  /** Entity/tenant-level settings from Setting(scope='tenant'|'entity'). */
  entitySettings: Record<string, string>;
  /** Active modules for the current entity. */
  modules: Array<{ slug: string; name: string }>;
  /** Whether settings have been loaded. */
  loaded: boolean;

  /** Get a setting value with fallback. */
  get: (key: string, fallback?: string) => string;
  /** Check if a module is active. */
  isModuleActive: (slug: string) => boolean;
  /** Set from bootstrap response. */
  setFromBootstrap: (data: {
    user: Record<string, string>;
    entity: Record<string, string>;
    modules: Array<{ slug: string; name: string }>;
  }) => void;
  /** Clear on logout. */
  clear: () => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  userSettings: {},
  entitySettings: {},
  modules: [],
  loaded: false,

  get: (key, fallback = "") => {
    const state = get();
    // User settings override entity settings
    return state.userSettings[key] ?? state.entitySettings[key] ?? fallback;
  },

  isModuleActive: (slug) => {
    return get().modules.some((m) => m.slug === slug);
  },

  setFromBootstrap: (data) =>
    set({
      userSettings: data.user,
      entitySettings: data.entity,
      modules: data.modules,
      loaded: true,
    }),

  clear: () =>
    set({ userSettings: {}, entitySettings: {}, modules: [], loaded: false }),
}));
