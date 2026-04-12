/**
 * Force Update Screen — shown when the app version is too old.
 *
 * The server's bootstrap response includes a `min_app_version` field.
 * If the current app version is below this, the user must update.
 *
 * Also supports soft update (optional) with a "Later" button.
 */

import React from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { Button, Surface, Text } from "react-native-paper";
import { colors } from "../utils/colors";

interface Props {
  currentVersion: string;
  requiredVersion: string;
  /** If true, the user can skip the update. */
  soft?: boolean;
  onSkip?: () => void;
  storeUrl?: string;
}

const DEFAULT_STORE_URL = Platform.select({
  ios: "https://apps.apple.com/app/opsflux-mobile/id000000000",
  android: "https://play.google.com/store/apps/details?id=com.opsflux.mobile",
  default: "",
});

export default function ForceUpdateScreen({
  currentVersion,
  requiredVersion,
  soft = false,
  onSkip,
  storeUrl,
}: Props) {
  function openStore() {
    const url = storeUrl ?? DEFAULT_STORE_URL;
    if (url) Linking.openURL(url);
  }

  return (
    <View style={styles.container}>
      <Surface style={styles.card} elevation={3}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>UP</Text>
        </View>

        <Text variant="headlineSmall" style={styles.title}>
          Mise à jour requise
        </Text>

        <Text variant="bodyLarge" style={styles.description}>
          Une nouvelle version de l'application est disponible. Veuillez mettre à jour pour continuer.
        </Text>

        <View style={styles.versionBox}>
          <View style={styles.versionRow}>
            <Text variant="bodyMedium" style={styles.versionLabel}>
              Version actuelle
            </Text>
            <Text variant="bodyMedium" style={styles.versionValue}>
              {currentVersion}
            </Text>
          </View>
          <View style={styles.versionRow}>
            <Text variant="bodyMedium" style={styles.versionLabel}>
              Version requise
            </Text>
            <Text variant="bodyMedium" style={[styles.versionValue, { color: colors.primary }]}>
              {requiredVersion}
            </Text>
          </View>
        </View>

        <Button
          mode="contained"
          onPress={openStore}
          style={styles.updateButton}
          buttonColor={colors.primary}
        >
          Mettre à jour
        </Button>

        {soft && onSkip && (
          <Button
            mode="text"
            onPress={onSkip}
            textColor={colors.textSecondary}
            style={styles.skipButton}
          >
            Plus tard
          </Button>
        )}
      </Surface>
    </View>
  );
}

/** Compare semver strings: returns -1, 0, or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  card: {
    borderRadius: 20,
    padding: 36,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  iconText: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primary,
  },
  title: {
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 20,
  },
  versionBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    padding: 14,
    width: "100%",
    marginBottom: 24,
    gap: 8,
  },
  versionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  versionLabel: { color: colors.textSecondary },
  versionValue: { fontWeight: "600", color: colors.textPrimary, fontFamily: "monospace" },
  updateButton: {
    width: "100%",
    borderRadius: 10,
  },
  skipButton: { marginTop: 8 },
});
