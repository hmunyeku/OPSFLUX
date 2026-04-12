/**
 * Maintenance Screen — shown when server returns 503.
 */

import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Surface, Text } from "react-native-paper";
import { api } from "../services/api";
import { useAppState } from "../stores/appState";
import { colors } from "../utils/colors";

export default function MaintenanceScreen() {
  const message = useAppState((s) => s.maintenanceMessage);
  const [checking, setChecking] = useState(false);

  async function checkAgain() {
    setChecking(true);
    try {
      await api.get("/api/v1/health");
      // If we get here, server is back
      useAppState.getState().setMaintenance(false);
    } catch {
      // Still down
    } finally {
      setChecking(false);
    }
  }

  // Auto-retry every 30s
  useEffect(() => {
    const interval = setInterval(checkAgain, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <Surface style={styles.card} elevation={3}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>M</Text>
        </View>
        <Text variant="headlineSmall" style={styles.title}>
          Maintenance en cours
        </Text>
        <Text variant="bodyLarge" style={styles.description}>
          {message || "Le serveur est temporairement indisponible. Veuillez réessayer dans quelques minutes."}
        </Text>
        <Button
          mode="contained"
          onPress={checkAgain}
          loading={checking}
          style={styles.retryButton}
        >
          Réessayer
        </Button>
        <Text variant="bodySmall" style={styles.autoRetry}>
          Vérification automatique toutes les 30 secondes
        </Text>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: colors.background },
  card: { borderRadius: 20, padding: 36, alignItems: "center", width: "100%", maxWidth: 400 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.info + "15", justifyContent: "center", alignItems: "center", marginBottom: 24 },
  iconText: { fontSize: 32, fontWeight: "800", color: colors.info },
  title: { fontWeight: "700", color: colors.textPrimary, textAlign: "center", marginBottom: 12 },
  description: { color: colors.textSecondary, textAlign: "center", lineHeight: 24, marginBottom: 24 },
  retryButton: { width: "100%", borderRadius: 10 },
  autoRetry: { color: colors.textMuted, marginTop: 12 },
});
