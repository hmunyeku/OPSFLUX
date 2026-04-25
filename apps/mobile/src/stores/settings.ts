/**
 * Server settings store — loaded from bootstrap.
 *
 * Settings in OpsFlux are stored as JSON. Most are wrapped in a `{"v": value}`
 * envelope for consistency — this store unwraps them automatically.
 *
 * Usage:
 *   settings.get("preference.language", "fr")    → "fr" or stored string
 *   settings.getBool("preference.push_notifications", true)
 *   settings.getNumber("datatable.page_size", 50)
 *   settings.getObject("delete_policy.ads", { mode: "soft" })
 */

import { create } from "zustand";

type SettingValue = string | number | boolean | object | null;

interface SettingsState {
  userSettings: Record<string, SettingValue>;
  entitySettings: Record<string, SettingValue>;
  modules: Array<{ slug: string; name: string }>;
  loaded: boolean;

  /** Get raw value (unwrapped from {v} envelope). */
  get: (key: string, fallback?: string) => string;
  getBool: (key: string, fallback?: boolean) => boolean;
  getNumber: (key: string, fallback?: number) => number;
  getObject: <T = unknown>(key: string, fallback?: T) => T;

  isModuleActive: (slug: string) => boolean;

  setFromBootstrap: (data: {
    user: Record<string, unknown>;
    entity: Record<string, unknown>;
    modules: Array<{ slug: string; name: string }>;
  }) => void;

  clear: () => void;
}

/**
 * Unwrap OpsFlux setting envelope: `{"v": value}` → `value`.
 * If the value is not wrapped, return as-is.
 */
function unwrap(raw: unknown): SettingValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && raw !== null && "v" in (raw as any) && Object.keys(raw as any).length === 1) {
    return (raw as any).v ?? null;
  }
  return raw as SettingValue;
}

function mapSettings(input: Record<string, unknown>): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = unwrap(v);
  }
  return out;
}

export const useSettings = create<SettingsState>((set, get) => ({
  userSettings: {},
  entitySettings: {},
  modules: [],
  loaded: false,

  get: (key, fallback = "") => {
    const s = get();
    const raw = s.userSettings[key] ?? s.entitySettings[key];
    if (raw === null || raw === undefined) return fallback;
    return String(raw);
  },

  getBool: (key, fallback = false) => {
    const s = get();
    const raw = s.userSettings[key] ?? s.entitySettings[key];
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "string") return raw === "true" || raw === "1";
    if (typeof raw === "number") return raw !== 0;
    return fallback;
  },

  getNumber: (key, fallback = 0) => {
    const s = get();
    const raw = s.userSettings[key] ?? s.entitySettings[key];
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === "number") return raw;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  },

  getObject: <T,>(key: string, fallback?: T): T => {
    const s = get();
    const raw = s.userSettings[key] ?? s.entitySettings[key];
    if (raw === null || raw === undefined || typeof raw !== "object") {
      return fallback as T;
    }
    return raw as T;
  },

  isModuleActive: (slug) => get().modules.some((m) => m.slug === slug),

  setFromBootstrap: (data) =>
    set({
      userSettings: mapSettings(data.user ?? {}),
      entitySettings: mapSettings(data.entity ?? {}),
      modules: data.modules ?? [],
      loaded: true,
    }),

  clear: () =>
    set({ userSettings: {}, entitySettings: {}, modules: [], loaded: false }),
}));
