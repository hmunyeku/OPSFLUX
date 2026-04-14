/**
 * FleetMap — DISABLED placeholder.
 *
 * react-native-maps is currently disabled to avoid native crashes on
 * Android (new architecture incompatibility with SDK 52).
 * When the real map is re-enabled, restore this component to use
 * the lazy-loading implementation from earlier versions.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../utils/colors";
import { radius, spacing, typography } from "../utils/design";

export interface MapPosition {
  id: string;
  vector_id: string;
  vector_name?: string;
  latitude: number;
  longitude: number;
  source: string;
  speed_knots: number | null;
  heading: number | null;
  recorded_at: string;
}

interface Props {
  positions: MapPosition[];
  track?: { latitude: number; longitude: number }[];
  focusVehicleId?: string;
  showUserLocation?: boolean;
  style?: object;
}

export default function FleetMap({ positions, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <Ionicons name="map-outline" size={32} color={colors.textMuted} />
      <Text style={styles.title}>Carte temporairement désactivée</Text>
      <Text style={styles.subtitle}>
        {positions.length > 0
          ? `${positions.length} position${positions.length > 1 ? "s" : ""} — consultez la liste ci-dessous.`
          : "Aucune position disponible."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 180,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  title: {
    ...typography.titleMd,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
