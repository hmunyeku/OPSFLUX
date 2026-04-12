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

import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider, MD3LightTheme, MD3DarkTheme, Text } from "react-native-paper";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";

// Initialize i18n before any component renders
import "./src/locales/i18n";

import AppNavigator from "./src/navigation/AppNavigator";
import { linking } from "./src/navigation/linking";
import ErrorBoundary from "./src/components/ErrorBoundary";
import NetworkBanner from "./src/components/NetworkBanner";
import Toast from "./src/components/Toast";
import { startConnectivityMonitor, stopConnectivityMonitor } from "./src/services/offline";
import { restoreAuth, persistAuth } from "./src/services/storage";
import { registerForPushNotifications } from "./src/services/pushNotifications";
import { useAuthStore } from "./src/stores/auth";
import { useThemeStore } from "./src/stores/theme";
import { initSentry, setSentryUser, clearSentryUser } from "./src/services/sentry";
import { colors } from "./src/utils/colors";
import { darkColors } from "./src/utils/darkColors";

// Initialize Sentry before anything else
initSentry();

function buildTheme(isDark: boolean) {
  const c = isDark ? darkColors : colors;
  const base = isDark ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      primaryContainer: c.primaryLight + "20",
      secondary: c.accent,
      secondaryContainer: c.accent + "20",
      error: c.danger,
      surface: c.surface,
      surfaceVariant: c.surfaceAlt,
      background: c.background,
      outline: c.border,
      onPrimary: isDark ? darkColors.textInverse : colors.textInverse,
      onSurface: c.textPrimary,
      onSurfaceVariant: c.textSecondary,
    },
    roundness: 10,
  };
}

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const isDark = useThemeStore((s) => s.isDark);
  const theme = useMemo(() => buildTheme(isDark), [isDark]);

  useEffect(() => {
    async function init() {
      await restoreAuth();
      startConnectivityMonitor();

      // Register push after auth restore
      if (useAuthStore.getState().isAuthenticated) {
        registerForPushNotifications();
      }

      setInitializing(false);
    }
    init();
    return () => stopConnectivityMonitor();
  }, []);

  // Persist auth whenever tokens change
  useEffect(() => {
    const unsub = useAuthStore.subscribe((state, prev) => {
      if (state.accessToken !== prev.accessToken) {
        if (state.accessToken) {
          persistAuth();
          registerForPushNotifications();
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
    <ErrorBoundary>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <NavigationContainer linking={linking}>
            <NetworkBanner />
            <AppNavigator />
            <Toast />
          </NavigationContainer>
        </PaperProvider>
        <StatusBar style="light" />
      </SafeAreaProvider>
    </ErrorBoundary>
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
