/**
 * EmptyState — illustrated empty view for lists & detail screens.
 *
 * Uses a MIcon in a soft circle (not a code-style glyph) and a
 * Gluestack button so the visual fits the rest of the app.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, ButtonText, Text } from "@gluestack-ui/themed";
import { MIcon, type MIconName } from "./MIcon";
import { colors } from "../utils/colors";

interface Props {
  icon?: MIconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = "inbox",
  title,
  description,
  actionLabel,
  onAction,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <MIcon name={icon} size="xl" color="$primary400" />
      </View>
      <Text
        size="md"
        fontWeight="$semibold"
        color="$textLight900"
        style={styles.title}
      >
        {title}
      </Text>
      {description && (
        <Text size="sm" color="$textLight500" style={styles.description}>
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button action="primary" onPress={onAction} mt="$5" size="md">
          <ButtonText>{actionLabel}</ButtonText>
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
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
    maxWidth: 280,
  },
});
