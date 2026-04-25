/**
 * Empty state component — shown when lists/screens have no data.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { colors } from "../utils/colors";

interface Props {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ICONS: Record<string, string> = {
  search: "?",
  list: "[ ]",
  scan: "QR",
  notification: "!",
  cargo: "PKG",
  ads: "ADS",
  map: "MAP",
  form: "F",
};

export default function EmptyState({ icon, title, description, actionLabel, onAction }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Text style={styles.iconText}>{ICONS[icon ?? "list"] ?? icon ?? "—"}</Text>
      </View>
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      {description && (
        <Text variant="bodyMedium" style={styles.description}>
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button mode="contained" onPress={onAction} style={styles.action}>
          {actionLabel}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    paddingTop: 60,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceAlt,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  iconText: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textMuted,
  },
  title: {
    fontWeight: "600",
    color: colors.textPrimary,
    textAlign: "center",
  },
  description: {
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  action: {
    marginTop: 20,
  },
});
