/**
 * Design tokens — spacing, typography, shadows, radius.
 *
 * These define the visual language of OpsFlux Mobile.
 * Consistent across all screens/components.
 */

import { Platform } from "react-native";

// ── Spacing scale (8pt grid) ──────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 56,
  "5xl": 72,
} as const;

// ── Border radius ─────────────────────────────────────────────────────

export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  base: 10,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 28,
  full: 9999,
} as const;

// ── Typography ────────────────────────────────────────────────────────

export const typography = {
  displayLg: { fontSize: 40, lineHeight: 48, fontWeight: "800" as const, letterSpacing: -0.5 },
  displayMd: { fontSize: 32, lineHeight: 40, fontWeight: "800" as const, letterSpacing: -0.3 },
  displaySm: { fontSize: 26, lineHeight: 34, fontWeight: "700" as const },
  headlineLg: { fontSize: 22, lineHeight: 30, fontWeight: "700" as const },
  headlineMd: { fontSize: 18, lineHeight: 26, fontWeight: "700" as const },
  titleLg: { fontSize: 17, lineHeight: 24, fontWeight: "600" as const },
  titleMd: { fontSize: 15, lineHeight: 22, fontWeight: "600" as const },
  titleSm: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const, letterSpacing: 0.5 },
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const },
  bodyMd: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  bodySm: { fontSize: 12, lineHeight: 16, fontWeight: "400" as const },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: "500" as const },
} as const;

// ── Shadows (adapted per platform) ────────────────────────────────────

export const shadow = {
  none: Platform.select({
    ios: {},
    android: { elevation: 0 },
    default: {},
  }) as object,
  xs: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
    },
    android: { elevation: 1 },
    default: {},
  }) as object,
  sm: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    android: { elevation: 2 },
    default: {},
  }) as object,
  md: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
    },
    android: { elevation: 4 },
    default: {},
  }) as object,
  lg: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    android: { elevation: 8 },
    default: {},
  }) as object,
  xl: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
    },
    android: { elevation: 16 },
    default: {},
  }) as object,
} as const;

// ── Gradient presets ──────────────────────────────────────────────────

export const gradients = {
  primary: ["#1e3a5f", "#2a5080", "#3a6ba3"] as readonly [string, string, string],
  primaryVertical: ["#1e3a5f", "#2a5080"] as readonly [string, string],
  accent: ["#f59e0b", "#fbbf24"] as readonly [string, string],
  success: ["#059669", "#10b981", "#34d399"] as readonly [string, string, string],
  danger: ["#dc2626", "#ef4444"] as readonly [string, string],
  info: ["#1e40af", "#3b82f6"] as readonly [string, string],
  dark: ["#0f172a", "#1e293b"] as readonly [string, string],
  hero: ["#1e3a5f", "#2a5080", "#4d7fb8"] as readonly [string, string, string],
  glass: ["rgba(255,255,255,0.25)", "rgba(255,255,255,0.05)"] as readonly [string, string],
} as const;
