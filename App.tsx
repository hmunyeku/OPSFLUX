/**
 * OpsFlux Mobile — entry point.
 *
 * Wraps the app in:
 *  - SafeAreaProvider (safe areas for notches)
 *  - PaperProvider (Material Design 3 theme)
 *  - NavigationContainer
 *
 * Starts the connectivity monitor for offline-first sync.
 */

import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider, MD3LightTheme } from "react-native-paper";
import { StatusBar } from "expo-status-bar";
import AppNavigator from "./src/navigation/AppNavigator";
import { startConnectivityMonitor, stopConnectivityMonitor } from "./src/services/offline";
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
  useEffect(() => {
    startConnectivityMonitor();
    return () => stopConnectivityMonitor();
  }, []);

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
