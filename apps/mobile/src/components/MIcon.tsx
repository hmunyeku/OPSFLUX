/**
 * MIcon — unified icon component using Google Material Symbols (via
 * @expo/vector-icons MaterialIcons).
 *
 * This replaces the previous lucide-react-native usage so the whole
 * mobile app uses Google's Material Design icon set, browseable at
 * https://fonts.google.com/icons.
 *
 * Usage:
 *   <MIcon name="qr-code-scanner" size="md" color={colors.primary} />
 *   <MIcon name="phone" size={20} color="#10b981" />
 *
 * Sizes (string presets):
 *   2xs = 12, xs = 14, sm = 18, md = 22, lg = 28, xl = 40, 2xl = 56
 *
 * Colors: any RN color string, OR a Gluestack-style token like
 *   "$primary600", "$success600", "$textLight900" — these are resolved
 *   to our palette via COLOR_MAP.
 */
import React from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { colors } from "../utils/colors";

export type MIconName = React.ComponentProps<typeof MaterialIcons>["name"];

const SIZE_MAP = {
  "2xs": 12,
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
  xl: 40,
  "2xl": 56,
} as const;

type SizePreset = keyof typeof SIZE_MAP;

/** Resolve a Gluestack-style color token to the actual hex. */
function resolveColor(c: string | undefined): string {
  if (!c) return colors.textSecondary;
  if (!c.startsWith("$")) return c;
  const map: Record<string, string> = {
    $primary600: colors.primary,
    $primary700: colors.primary,
    $primary500: colors.primary,
    $primary400: colors.primaryLight ?? colors.primary,
    $success600: colors.success,
    $success700: colors.success,
    $error500: colors.danger,
    $error600: colors.danger,
    $error700: colors.danger,
    $warning500: colors.warning,
    $warning600: colors.warning,
    $info500: colors.info,
    $info600: colors.info,
    $info700: colors.info,
    $textLight400: colors.textMuted,
    $textLight500: colors.textSecondary,
    $textLight600: colors.textSecondary,
    $textLight700: colors.textPrimary,
    $textLight900: colors.textPrimary,
    $white: "#ffffff",
    $black: "#000000",
  };
  return map[c] ?? colors.textSecondary;
}

export interface MIconProps {
  name: MIconName;
  size?: number | SizePreset;
  color?: string;
}

export function MIcon({ name, size = "md", color = "$textLight600" }: MIconProps) {
  const px = typeof size === "number" ? size : SIZE_MAP[size] ?? 22;
  return <MaterialIcons name={name} size={px} color={resolveColor(color)} />;
}

export default MIcon;
