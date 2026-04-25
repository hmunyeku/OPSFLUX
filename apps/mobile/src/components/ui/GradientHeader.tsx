/**
 * GradientHeader — hero header with gradient background and safe area handling.
 *
 * Used at the top of main screens to give a premium feel.
 */

import React, { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "react-native-paper";
import { gradients, spacing, typography } from "../../utils/design";

interface Props {
  title: string;
  subtitle?: string;
  gradient?: readonly [string, string, string] | readonly [string, string];
  children?: ReactNode;
  /** Adds bottom padding to overlap with content below. */
  bottomOverlap?: number;
  style?: ViewStyle;
}

export default function GradientHeader({
  title,
  subtitle,
  gradient = gradients.hero,
  children,
  bottomOverlap = 0,
  style,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={gradient as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.base,
          paddingBottom: spacing["2xl"] + bottomOverlap,
        },
        style,
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {children && <View style={styles.children}>{children}</View>}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
  },
  content: {},
  title: {
    ...typography.displaySm,
    color: "#ffffff",
  },
  subtitle: {
    ...typography.bodyLg,
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: spacing.xs,
  },
  children: {
    marginTop: spacing.base,
  },
});
