/**
 * Theme store — dark mode toggle with system preference detection.
 */

import { Appearance } from "react-native";
import { create } from "zustand";

type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "system") return Appearance.getColorScheme() === "dark";
  return mode === "dark";
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: "system",
  isDark: resolveIsDark("system"),
  setMode: (mode) => set({ mode, isDark: resolveIsDark(mode) }),
}));

// Listen to system appearance changes
Appearance.addChangeListener(({ colorScheme }) => {
  const { mode } = useThemeStore.getState();
  if (mode === "system") {
    useThemeStore.setState({ isDark: colorScheme === "dark" });
  }
});
