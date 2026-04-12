/**
 * Live Tracking screen — real-time fleet map via SSE.
 *
 * Subscribes to /tracking/sse for real-time position updates
 * and displays a map with all tracked vehicles/vessels.
 *
 * Also allows enabling GPS beacon mode (send own position).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  Surface,
  Switch,
  Text,
} from "react-native-paper";
import { api } from "../services/api";
import { useAuthStore } from "../stores/auth";
import { useTrackingStore, startTracking, stopTracking } from "../services/tracking";
import { colors } from "../utils/colors";

// ── Types ─────────────────────────────────────────────────────────────

interface VehiclePosition {
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
  navigation: any;
}

export default function LiveTrackingScreen({ navigation }: Props) {
  const [positions, setPositions] = useState<VehiclePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const trackingEnabled = useTrackingStore((s) => s.enabled);
  const lastPosition = useTrackingStore((s) => s.lastPosition);
  const positionCount = useTrackingStore((s) => s.positionCount);

  // ── Load initial fleet positions ──────────────────────────────────

  const loadFleet = useCallback(async () => {
    try {
      const { data } = await api.get("/api/v1/travelwiz/tracking/fleet");
      setPositions(data.positions ?? []);
    } catch {
      // May not have permission — that's ok
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFleet();
  }, [loadFleet]);

  // ── SSE real-time subscription ────────────────────────────────────

  useEffect(() => {
    const { accessToken, baseUrl, entityId } = useAuthStore.getState();
    if (!accessToken) return;

    const url = `${baseUrl}/api/v1/travelwiz/tracking/sse`;

    // Use fetch-based SSE (EventSource not available in RN, use polling fallback)
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await api.get("/api/v1/travelwiz/tracking/fleet");
        if (data.positions) {
          setPositions(data.positions);
          setConnected(true);
        }
      } catch {
        setConnected(false);
      }
    }, 10_000); // Poll every 10s as SSE fallback

    setConnected(true);

    return () => {
      clearInterval(pollInterval);
      setConnected(false);
    };
  }, []);

  // ── Beacon toggle ─────────────────────────────────────────────────

  async function toggleBeacon(enabled: boolean) {
    if (enabled) {
      // Need a vehicle ID — prompt user or auto-detect
      Alert.prompt
        ? Alert.prompt(
            "ID du vecteur",
            "Entrez l'identifiant du vecteur de transport",
            (vehicleId) => {
              if (vehicleId) startTracking(vehicleId);
            }
          )
        : Alert.alert(
            "Tracking GPS",
            "Le tracking GPS sera activé pour le vecteur assigné.",
            [
              { text: "Annuler", style: "cancel" },
              { text: "Activer", onPress: () => startTracking("default") },
            ]
          );
    } else {
      stopTracking();
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Connection status */}
      <Surface style={styles.statusBar} elevation={1}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connected ? colors.success : colors.danger },
            ]}
          />
          <Text variant="bodySmall" style={styles.statusText}>
            {connected ? "Connecté — suivi en temps réel" : "Déconnecté"}
          </Text>
        </View>
        <Text variant="bodySmall" style={styles.statusCount}>
          {positions.length} vecteur{positions.length !== 1 ? "s" : ""}
        </Text>
      </Surface>

      {/* GPS Beacon toggle */}
      <Card style={styles.beaconCard}>
        <Card.Content>
          <View style={styles.beaconRow}>
            <View style={{ flex: 1 }}>
              <Text variant="titleSmall" style={styles.beaconTitle}>
                Balise GPS
              </Text>
              <Text variant="bodySmall" style={styles.beaconDesc}>
                Envoyez votre position en temps réel pour le suivi de voyage
              </Text>
            </View>
            <Switch
              value={trackingEnabled}
              onValueChange={toggleBeacon}
              color={colors.success}
            />
          </View>
          {trackingEnabled && lastPosition && (
            <View style={styles.beaconInfo}>
              <Text variant="bodySmall" style={styles.beaconCoord}>
                {lastPosition.lat.toFixed(5)}, {lastPosition.lon.toFixed(5)}
              </Text>
              <Text variant="bodySmall" style={styles.beaconCoord}>
                {positionCount} position{positionCount > 1 ? "s" : ""} envoyée{positionCount > 1 ? "s" : ""}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Fleet positions list */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Positions de la flotte
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
      ) : positions.length === 0 ? (
        <Text style={styles.emptyText}>
          Aucune position de vecteur disponible.
        </Text>
      ) : (
        positions.map((pos) => (
          <Surface key={pos.id} style={styles.positionCard} elevation={1}>
            <View style={styles.posCardHeader}>
              <Text variant="titleSmall" style={styles.posVehicleName}>
                {pos.vector_name ?? pos.vector_id.slice(0, 8)}
              </Text>
              <Chip compact style={styles.sourceChip}>
                {pos.source.toUpperCase()}
              </Chip>
            </View>
            <Text variant="bodySmall" style={styles.posCoords}>
              {pos.latitude.toFixed(5)}, {pos.longitude.toFixed(5)}
            </Text>
            <View style={styles.posFooter}>
              {pos.speed_knots != null && (
                <Text variant="bodySmall" style={styles.posMeta}>
                  {pos.speed_knots.toFixed(1)} kn
                </Text>
              )}
              {pos.heading != null && (
                <Text variant="bodySmall" style={styles.posMeta}>
                  Cap: {pos.heading.toFixed(0)}°
                </Text>
              )}
              <Text variant="bodySmall" style={styles.posTime}>
                {new Date(pos.recorded_at).toLocaleTimeString("fr-FR")}
              </Text>
            </View>
          </Surface>
        ))
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  statusRow: { flexDirection: "row", alignItems: "center" },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { color: colors.textSecondary },
  statusCount: { color: colors.textMuted },
  beaconCard: { borderRadius: 12 },
  beaconRow: { flexDirection: "row", alignItems: "center" },
  beaconTitle: { fontWeight: "700", color: colors.textPrimary },
  beaconDesc: { color: colors.textSecondary, marginTop: 2 },
  beaconInfo: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  beaconCoord: { color: colors.textMuted, fontFamily: "monospace" },
  sectionTitle: { fontWeight: "700", color: colors.textPrimary, marginTop: 4 },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 24, fontSize: 14 },
  positionCard: {
    borderRadius: 10,
    padding: 14,
    backgroundColor: colors.surface,
  },
  posCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  posVehicleName: { fontWeight: "600", color: colors.primary },
  sourceChip: { height: 24 },
  posCoords: { color: colors.textSecondary, fontFamily: "monospace" },
  posFooter: { flexDirection: "row", gap: 12, marginTop: 6 },
  posMeta: { color: colors.textSecondary },
  posTime: { color: colors.textMuted, marginLeft: "auto" },
});
