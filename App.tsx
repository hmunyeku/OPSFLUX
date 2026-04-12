/**
 * OpsFlux Mobile — entry point.
 *
 * Lifecycle:
 *  1. Restore auth from SecureStore (persisted session)
 *  2. Start connectivity monitor for offline sync
 *  3. Render navigation (auth gate → main tabs)
 *  4. Persist auth on every token change
 */

import React, { useEffect, useState } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider, MD3LightTheme, Text } from "react-native-paper";
import { StatusBar } from "expo-status-bar";
import AppNavigator from "./src/navigation/AppNavigator";
import { startConnectivityMonitor, stopConnectivityMonitor } from "./src/services/offline";
import { restoreAuth, persistAuth } from "./src/services/storage";
import { useAuthStore } from "./src/stores/auth";
import { colors } from "./src/utils/colors";

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    primaryContainer: colors.primaryLight + "20",
    secondary: colors.accent,
    secondaryContainer: colors.accent + "20",
    error: colors.danger,
    surface: colors.surface,
    surfaceVariant: colors.surfaceAlt,
    background: colors.background,
    outline: colors.border,
    onPrimary: colors.textInverse,
    onSurface: colors.textPrimary,
    onSurfaceVariant: colors.textSecondary,
  },
  roundness: 10,
};

export default function App() {
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    async function init() {
      await restoreAuth();
      startConnectivityMonitor();
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
        }
      }
    });
    return unsub;
  }, []);

  if (initializing) {
    return (
      <View style={splashStyles.container}>
        <Text style={splashStyles.logo}>OpsFlux</Text>
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </PaperProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  logo: {
    fontSize: 36,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 2,
  },
});
