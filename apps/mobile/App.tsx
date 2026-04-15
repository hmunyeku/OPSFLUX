/**
 * OpsFlux Mobile — entry point.
 *
 * Lifecycle:
 *  1. Initialize i18n (FR/EN auto-detected)
 *  2. Restore auth from SecureStore
 *  3. Start connectivity monitor
 *  4. Apply theme (light/dark/system)
 *  5. Register push notifications
 *  6. Render navigation
 */

import "react-native-gesture-handler";

import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GluestackUIProvider } from "@gluestack-ui/themed";
import { config as gluestackConfig } from "@gluestack-ui/config";
import { StatusBar } from "expo-status-bar";

// Initialize i18n before any component renders
import "./src/locales/i18n";

import AppNavigator from "./src/navigation/AppNavigator";
import { linking } from "./src/navigation/linking";
import ErrorBoundary from "./src/components/ErrorBoundary";
import NetworkBanner from "./src/components/NetworkBanner";
import Toast from "./src/components/Toast";
import { startConnectivityMonitor, stopConnectivityMonitor } from "./src/services/offline";
import { useAppLifecycle } from "./src/hooks/useAppLifecycle";
import { restoreAuth, persistAuth } from "./src/services/storage";
import { registerForPushNotifications } from "./src/services/pushNotifications";
import { useAuthStore } from "./src/stores/auth";
import { useThemeStore } from "./src/stores/theme";
import { initSentry } from "./src/services/sentry";
import { colors } from "./src/utils/colors";
import { darkColors } from "./src/utils/darkColors";

// Initialize Sentry lazily (non-blocking, safe if not installed)
initSentry().catch(() => {});

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const isDark = useThemeStore((s) => s.isDark);

  useEffect(() => {
    async function init() {
      // Hydrate the i18n catalog cache first so offline cold-starts show
      // the right language immediately.
      try {
        const { useI18nStore } = await import("./src/stores/i18n");
        await useI18nStore.getState().hydrate();
      } catch (err) {
        if (__DEV__) console.warn("[App] i18n hydrate failed:", err);
      }
      // Hydrate the sync manifest so we know what hash we're aligned with
      try {
        const { hydrateSyncHash } = await import("./src/services/syncManifest");
        await hydrateSyncHash();
      } catch {}
      try {
        await restoreAuth();
      } catch (err) {
        if (__DEV__) console.warn("[App] restoreAuth failed:", err);
      }
      try {
        startConnectivityMonitor();
      } catch (err) {
        if (__DEV__) console.warn("[App] connectivity monitor failed:", err);
      }
      // Hydrate the pending upload queue count so the Settings badge
      // is accurate from the first render (no flash of "0 pending").
      try {
        const { getPendingUploadCount } = await import("./src/services/uploadQueue");
        const { useOfflineStore } = await import("./src/services/offline");
        const count = await getPendingUploadCount();
        useOfflineStore.getState().setUploadQueueLength?.(count);
      } catch {
        /* noop */
      }
      // Once authenticated, ask for the OS permissions we'll need
      // (camera, location, notifications, media library) in one batch
      // so the user goes through OS prompts upfront rather than being
      // surprised mid-flow.
      if (useAuthStore.getState().isAuthenticated) {
        try {
          const { requestEssentialPermissions } = await import("./src/services/permissions");
          await requestEssentialPermissions();
        } catch (err) {
          if (__DEV__) console.warn("[App] permissions prompt failed:", err);
        }
        registerForPushNotifications().catch(() => {});
      }
      setInitializing(false);
    }
    init();
    return () => {
      try {
        stopConnectivityMonitor();
      } catch {}
    };
  }, []);

  // Refresh data when app comes back from background, network restores,
  // or every 15 minutes (Epicollect-style).
  useAppLifecycle({
    onResume: async () => {
      const { checkAndSync } = await import("./src/services/syncManifest");
      const { triggerBootstrapRefresh } = await import("./src/hooks/useBootstrap");
      checkAndSync(async () => triggerBootstrapRefresh()).catch(() => {});
    },
  });

  // Subscribe to network online transitions to trigger a sync check.
  useEffect(() => {
    let prevOnline = true;
    let unsub: (() => void) | undefined;
    (async () => {
      const { useOfflineStore } = await import("./src/services/offline");
      unsub = useOfflineStore.subscribe(async (state) => {
        if (!prevOnline && state.isOnline) {
          // Just came back online — sync
          const { checkAndSync } = await import("./src/services/syncManifest");
          const { triggerBootstrapRefresh } = await import("./src/hooks/useBootstrap");
          checkAndSync(async () => triggerBootstrapRefresh()).catch(() => {});
        }
        prevOnline = state.isOnline;
      });
    })();
    return () => unsub?.();
  }, []);

  // Periodic 15-min sync polling while authenticated.
  useEffect(() => {
    if (initializing) return;
    if (!useAuthStore.getState().isAuthenticated) return;
    let cleanup: (() => void) | undefined;
    (async () => {
      const { startSyncPolling, stopSyncPolling } = await import("./src/services/syncManifest");
      const { triggerBootstrapRefresh } = await import("./src/hooks/useBootstrap");
      startSyncPolling(async () => triggerBootstrapRefresh());
      cleanup = stopSyncPolling;
    })();
    return () => cleanup?.();
  }, [initializing]);

  // Persist auth whenever access token changes
  useEffect(() => {
    let lastToken = useAuthStore.getState().accessToken;
    const unsub = useAuthStore.subscribe((state) => {
      if (state.accessToken !== lastToken) {
        lastToken = state.accessToken;
        if (state.accessToken) {
          persistAuth();
          registerForPushNotifications().catch(() => {});
        }
      }
    });
    return unsub;
  }, []);

  if (initializing) {
    return (
      <View style={[splashStyles.container, isDark && splashStyles.containerDark]}>
        <Text style={splashStyles.logo}>OpsFlux</Text>
        <Text style={splashStyles.sub}>Mobile</Text>
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <GluestackUIProvider
            config={gluestackConfig}
            colorMode={isDark ? "dark" : "light"}
          >
            <NavigationContainer linking={linking}>
              <NetworkBanner />
              <AppNavigator />
              <Toast />
            </NavigationContainer>
          </GluestackUIProvider>
          <StatusBar style="light" />
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  containerDark: {
    backgroundColor: darkColors.primaryDark,
  },
  logo: {
    fontSize: 40,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 2,
  },
  sub: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
    marginTop: 4,
    letterSpacing: 4,
    textTransform: "uppercase",
  },
});
