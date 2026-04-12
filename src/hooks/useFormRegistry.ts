/**
 * Hook to fetch and cache the form registry from the server.
 *
 * On mount: checks local cache, then fetches fresh definitions.
 * The sync manifest endpoint is used to detect stale definitions
 * without re-downloading everything.
 */

import { useCallback, useEffect, useState } from "react";
import { fetchWithOfflineFallback, setCache, getCached } from "../services/offline";
import type { FormDefinition, PortalDefinition } from "../types/forms";

const FORMS_CACHE_URL = "/api/v1/mobile/form-definitions";
const PORTALS_CACHE_URL = "/api/v1/mobile/portal-config";

interface FormRegistryState {
  forms: FormDefinition[];
  portals: PortalDefinition[];
  loading: boolean;
  error: string | null;
}

export function useFormRegistry() {
  const [state, setState] = useState<FormRegistryState>({
    forms: [],
    portals: [],
    loading: true,
    error: null,
  });

  const fetchRegistry = useCallback(async () => {
    try {
      const [formsResult, portalsResult] = await Promise.all([
        fetchWithOfflineFallback<{ forms: FormDefinition[] }>(FORMS_CACHE_URL),
        fetchWithOfflineFallback<{ portals: PortalDefinition[] }>(PORTALS_CACHE_URL),
      ]);

      setState({
        forms: formsResult.data.forms,
        portals: portalsResult.data.portals,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Impossible de charger les définitions.",
      }));
    }
  }, []);

  useEffect(() => {
    fetchRegistry();
  }, [fetchRegistry]);

  return {
    ...state,
    refresh: fetchRegistry,
  };
}
