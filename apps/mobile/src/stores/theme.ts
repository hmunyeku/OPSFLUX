/**
 * Theme store — dark mode toggle with system preference detection.
 *
 * TEMPORARY: dark mode is force-disabled for v1 because many screens
 * hardcode light-theme color tokens (`$textLight900`, etc.) which become
 * near-invisible on a dark background. A proper dark-mode pass (swap to
 * semantic tokens `$text` / `$background` everywhere) is scheduled for
 * v1.1. For now every user sees the polished light theme regardless of
 * their system preference.
 */

import { create } from "zustand";

type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: "light",
  isDark: false,
  // No-op until v1.1 — always stay in light mode.
  setMode: (_mode) => set({ mode: "light", isDark: false }),
}));
