/**
 * ActionTile — sober, professional action card.
 *
 * Flat design with subtle border, minimal icon tint, typography hierarchy.
 * Inspired by Linear/Notion/Stripe dashboard patterns.
 */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@gluestack-ui/themed";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors } from "../../utils/colors";
import { radius, spacing, typography } from "../../utils/design";

interface Props {
  title: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: string;
  onPress: () => void;
  width?: number | string;
  badge?: string | number;
}

export default function ActionTile({
  title,
  description,
  icon,
  accent = colors.primary,
  onPress,
  width,
  badge,
}: Props) {
  function handlePress() {
    Haptics.selectionAsync();
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        width != null && { width: width as any },
        pressed && styles.pressed,
      ]}
      android_ripple={{ color: colors.primary + "08", borderless: false }}
    >
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <View style={[styles.iconContainer, { backgroundColor: accent + "10" }]}>
            <Ionicons name={icon} size={20} color={accent} />
          </View>
          {badge !== undefined && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {description && (
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 0 },
  pressed: { opacity: 0.7 },
  inner: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 120,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    ...typography.titleMd,
    color: colors.textPrimary,
  },
  description: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
