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
import type { FormDefinition, PortalDefinition } from "../types/forms";

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

      // 1. Populate auth store with user info
      const authStore = useAuthStore.getState();
      authStore.setUser(data.user.id, data.user.display_name);
      if (data.current_entity_id) {
        authStore.setEntity(data.current_entity_id);
      }
      persistAuth();

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

  return {
    ...state,
    refresh: load,
  };
}
