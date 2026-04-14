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

/** Gluestack-style spacing token to numeric pixels (default theme). */
const SPACE_MAP: Record<string, number> = {
  "$0": 0,
  "$0.5": 2,
  "$1": 4,
  "$1.5": 6,
  "$2": 8,
  "$2.5": 10,
  "$3": 12,
  "$3.5": 14,
  "$4": 16,
  "$5": 20,
  "$6": 24,
  "$7": 28,
  "$8": 32,
};

function resolveSpace(v: number | string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v;
  return SPACE_MAP[v] ?? 0;
}

export interface MIconProps {
  name: MIconName;
  size?: number | SizePreset;
  color?: string;
  /** Margin shortcut props (Gluestack tokens or numbers). */
  m?: number | string;
  mt?: number | string;
  mr?: number | string;
  mb?: number | string;
  ml?: number | string;
  mx?: number | string;
  my?: number | string;
}

export function MIcon({
  name,
  size = "md",
  color = "$textLight600",
  m,
  mt,
  mr,
  mb,
  ml,
  mx,
  my,
}: MIconProps) {
  const px = typeof size === "number" ? size : SIZE_MAP[size] ?? 22;
  const style: Record<string, number | undefined> = {};
  if (m !== undefined) style.margin = resolveSpace(m);
  if (mt !== undefined) style.marginTop = resolveSpace(mt);
  if (mr !== undefined) style.marginRight = resolveSpace(mr);
  if (mb !== undefined) style.marginBottom = resolveSpace(mb);
  if (ml !== undefined) style.marginLeft = resolveSpace(ml);
  if (mx !== undefined) style.marginHorizontal = resolveSpace(mx);
  if (my !== undefined) style.marginVertical = resolveSpace(my);
  const hasStyle = Object.keys(style).length > 0;
  return (
    <MaterialIcons
      name={name}
      size={px}
      color={resolveColor(color)}
      style={hasStyle ? style : undefined}
    />
  );
}

export default MIcon;
