/**
 * Hook to access form and portal definitions.
 *
 * Delegates to useBootstrap for the initial load (single API call),
 * with a fallback to individual endpoints for incremental refresh.
 */

import { useCallback, useEffect, useState } from "react";
import { fetchWithOfflineFallback } from "../services/offline";
import type { FormDefinition, PortalDefinition } from "../types/forms";

const FORMS_URL = "/api/v1/mobile/form-definitions";
const PORTALS_URL = "/api/v1/mobile/portal-config";
const BOOTSTRAP_URL = "/api/v1/mobile/bootstrap";

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
      // Try bootstrap first (single call, may already be cached)
      const result = await fetchWithOfflineFallback<{
        forms: FormDefinition[];
        portals: PortalDefinition[];
      }>(BOOTSTRAP_URL);

      setState({
        forms: result.data.forms ?? [],
        portals: result.data.portals ?? [],
        loading: false,
        error: null,
      });
    } catch {
      // Fallback to individual endpoints
      try {
        const [formsResult, portalsResult] = await Promise.all([
          fetchWithOfflineFallback<{ forms: FormDefinition[] }>(FORMS_URL),
          fetchWithOfflineFallback<{ portals: PortalDefinition[] }>(PORTALS_URL),
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
