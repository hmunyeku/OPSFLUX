/**
 * App lifecycle hook — detects background/foreground transitions.
 *
 * On resume (background → foreground):
 *  - Refreshes the bootstrap data (permissions, settings, forms)
 *  - Flushes the offline mutation queue
 *  - Checks if account is still active
 */

import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAuthStore } from "../stores/auth";
import { flushQueue, useOfflineStore } from "../services/offline";
import { usePermissions } from "../stores/permissions";

interface LifecycleCallbacks {
  onResume?: () => void;
  onBackground?: () => void;
}

export function useAppLifecycle(callbacks?: LifecycleCallbacks) {
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const wasBackground =
        appStateRef.current.match(/inactive|background/) && nextState === "active";

      if (wasBackground) {
        // App came to foreground
        const isAuth = useAuthStore.getState().isAuthenticated;
        if (isAuth) {
          // Flush offline queues (JSON first, then multipart uploads)
          if (useOfflineStore.getState().isOnline) {
            (async () => {
              try {
                await flushQueue();
              } catch {
                /* best-effort */
              }
              try {
                const { flushUploadQueue } = await import("../services/uploadQueue");
                await flushUploadQueue();
              } catch {
                /* best-effort */
              }
            })();
          }
          // Refresh permissions (checks account status too)
          usePermissions.getState().fetchPermissions();
        }

        callbacks?.onResume?.();
      }

      if (nextState.match(/inactive|background/)) {
        callbacks?.onBackground?.();
      }

      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [callbacks]);
}
