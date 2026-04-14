/**
 * GlassCard — elevated card with premium shadow and optional gradient border.
 */

import React, { ReactNode } from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { colors } from "../../utils/colors";
import { radius, shadow, spacing } from "../../utils/design";

interface Props {
  children: ReactNode;
  onPress?: () => void;
  variant?: "elevated" | "outlined" | "filled";
  padding?: keyof typeof spacing;
  elevation?: keyof typeof shadow;
  style?: ViewStyle;
}

export default function GlassCard({
  children,
  onPress,
  variant = "elevated",
  padding = "base",
  elevation = "sm",
  style,
}: Props) {
  const cardStyle = [
    styles.base,
    variant === "outlined" && styles.outlined,
    variant === "filled" && styles.filled,
    variant === "elevated" && (shadow[elevation] as object),
    { padding: spacing[padding] },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cardStyle,
          pressed && styles.pressed,
        ]}
        android_ripple={{ color: colors.primary + "10", borderless: false }}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  filled: {
    backgroundColor: colors.surfaceAlt,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
