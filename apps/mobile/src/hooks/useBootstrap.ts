/**
 * Bootstrap hook — single call to initialize the mobile app after login.
 *
 * Calls GET /api/v1/mobile/bootstrap which returns:
 *  - User profile
 *  - Permissions
 *  - Available entities
 *  - Settings (user + entity preferences)
 *  - Enabled modules
 *  - Form definitions
 *  - Portal definitions
 *
 * Populates all stores and caches the response for offline use.
 */

import { useCallback, useEffect, useState } from "react";
import { fetchWithOfflineFallback } from "../services/offline";
import { useAuthStore } from "../stores/auth";
import { usePermissions } from "../stores/permissions";
import { useSettings } from "../stores/settings";
import { setSentryUser } from "../services/sentry";
import { persistAuth } from "../services/storage";
import { useAppState } from "../stores/appState";
import { APP_VERSION } from "../services/api";
import { compareVersions } from "../screens/ForceUpdateScreen";
import { prefetchLookups, extractLookupEndpoints } from "../services/lookupCache";
import i18n from "../locales/i18n";
import { useI18nStore } from "../stores/i18n";
import { create } from "zustand";
import type { FormDefinition, PortalDefinition } from "../types/forms";

/**
 * Tiny global store used by syncManifest.ts to ask the active
 * useBootstrap() hook to refetch. We bump `version` and the hook
 * reacts.
 */
export const useBootstrapTrigger = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

/** External hook to trigger a bootstrap refresh from anywhere. */
export function triggerBootstrapRefresh(): void {
  useBootstrapTrigger.getState().bump();
}

const BOOTSTRAP_URL = "/api/v1/mobile/bootstrap";

export interface BootstrapEntity {
  id: string;
  name: string;
  code: string | null;
}

interface BootstrapData {
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    display_name: string;
    avatar_url: string | null;
    default_entity_id: string | null;
    mfa_enabled: boolean;
    language?: string;
  };
  permissions: string[];
  entities: BootstrapEntity[];
  current_entity_id: string;
  settings: {
    user: Record<string, string>;
    entity: Record<string, string>;
  };
  modules: Array<{ slug: string; name: string }>;
  forms: FormDefinition[];
  portals: PortalDefinition[];
  i18n?: {
    language: string;
    namespace: string;
    hash: string;
    messages: Record<string, string>;
  };
}

interface BootstrapState {
  forms: FormDefinition[];
  portals: PortalDefinition[];
  entities: BootstrapEntity[];
  loading: boolean;
  error: string | null;
  fromCache: boolean;
}

export function useBootstrap() {
  const [state, setState] = useState<BootstrapState>({
    forms: [],
    portals: [],
    entities: [],
    loading: true,
    error: null,
    fromCache: false,
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await fetchWithOfflineFallback<BootstrapData>(BOOTSTRAP_URL);
      const data = result.data;

      // 0. Check app version + account status BEFORE anything else
      const appState = useAppState.getState();
      if ((data as any).min_app_version) {
        const minVersion = (data as any).min_app_version;
        if (compareVersions(APP_VERSION, minVersion) < 0) {
          appState.setUpdateRequired(true, minVersion, false);
          setState((prev) => ({ ...prev, loading: false }));
          return;
        }
      }
      if ((data as any).user?.status && (data as any).user.status !== "active") {
        const status = (data as any).user.status;
        appState.setAccountBlocked(
          status === "blocked" ? "blocked" : status === "suspended" ? "suspended" : "deactivated",
          `Votre compte est ${status}.`
        );
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      // 1. Populate auth store with user info
      const authStore = useAuthStore.getState();
      authStore.setUser(data.user.id, data.user.display_name);
      if (data.current_entity_id) {
        authStore.setEntity(data.current_entity_id);
      }
      persistAuth();

      // 1b. Apply the server-side i18n catalog (if present) + sync language.
      //     This REPLACES the hardcoded locale bundles with server-driven ones,
      //     so an admin can change any label without shipping a new APK.
      if (data.i18n && data.i18n.messages && Object.keys(data.i18n.messages).length > 0) {
        await useI18nStore.getState().applyCatalog({
          language: data.i18n.language || data.user.language || "fr",
          namespace: data.i18n.namespace || "mobile",
          hash: data.i18n.hash || "",
          messages: data.i18n.messages,
        });
      } else if (data.user.language) {
        // Fallback: no catalog payload, at least honor the user's language.
        const lng = data.user.language.slice(0, 2).toLowerCase();
        if (i18n.language !== lng) {
          await i18n.changeLanguage(lng).catch(() => {});
        }
      }

      // 2. Set Sentry user context
      setSentryUser({
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.display_name,
      });

      // 3. Populate permissions store
      usePermissions.setState({
        permissions: data.permissions,
        loaded: true,
        loading: false,
      });

      // 4. Populate settings store (user prefs + entity config + modules)
      useSettings.getState().setFromBootstrap({
        user: data.settings?.user ?? {},
        entity: data.settings?.entity ?? {},
        modules: data.modules ?? [],
      });

      // 5. Apply user language preference if set on server
      const serverLang = data.settings?.user?.["preference.language"];
      if (serverLang) {
        const { default: i18n } = await import("../locales/i18n");
        if (["fr", "en", "es", "pt"].includes(serverLang)) {
          i18n.changeLanguage(serverLang);
        }
      }

      setState({
        forms: data.forms,
        portals: data.portals,
        entities: data.entities,
        loading: false,
        error: null,
        fromCache: result.fromCache,
      });

      // 6. Pre-fetch lookup data for offline use (non-blocking)
      if (!result.fromCache && data.forms) {
        const endpoints = extractLookupEndpoints(data.forms);
        prefetchLookups(endpoints).catch(() => {});
      }

      // 7. Capture the current sync baseline so periodic checks know
      //    what hash they're comparing against. Reset to "" so the next
      //    /sync-manifest call adopts the server's current hash without
      //    triggering an immediate re-reload.
      try {
        const { setSyncBaseline, checkAndSync } = await import("../services/syncManifest");
        setSyncBaseline("");
        checkAndSync(async () => {}).catch(() => {});
      } catch {
        /* sync service not yet available — non-fatal */
      }
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Erreur de chargement.",
      }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Subscribe to the global trigger so external services (syncManifest)
  // can ask us to reload. Each bump in `version` triggers a refetch.
  const triggerVersion = useBootstrapTrigger((s) => s.version);
  useEffect(() => {
    if (triggerVersion === 0) return; // initial mount only
    load();
  }, [triggerVersion, load]);

  return {
    ...state,
    refresh: load,
  };
}
