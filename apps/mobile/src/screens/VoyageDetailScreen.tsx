/**
 * Voyage Detail Screen — full view of a voyage with manifest, logs, tracking.
 */

import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  List,
  Text,
} from "react-native-paper";
import StatusBadge from "../components/StatusBadge";
import FleetMap, { MapPosition } from "../components/FleetMap";
import { api } from "../services/api";
import { colors } from "../utils/colors";

interface Props {
  route: { params: { voyageId: string } };
  navigation: any;
}

interface VoyageDetail {
  id: string;
  code: string;
  status: string;
  vector_name: string;
  vector_type: string;
  scheduled_departure: string;
  scheduled_arrival: string;
  actual_departure: string | null;
  actual_arrival: string | null;
  delay_reason: string | null;
  departure_base_name: string | null;
  arrival_base_name: string | null;
  pax_count: number;
  cargo_count: number;
  stop_count: number;
}

interface VoyageLog {
  id: string;
  event_type: string;
  timestamp: string;
  description: string;
  created_by_name: string | null;
}

const EVENT_ICONS: Record<string, string> = {
  departure: "airplane-takeoff",
  arrival: "airplane-landing",
  weather: "weather-cloudy",
  technical: "wrench",
  fuel: "gas-station",
  safety: "shield-check",
  incident: "alert",
};

export default function VoyageDetailScreen({ route, navigation }: Props) {
  const { voyageId } = route.params;
  const [voyage, setVoyage] = useState<VoyageDetail | null>(null);
  const [logs, setLogs] = useState<VoyageLog[]>([]);
  const [positions, setPositions] = useState<MapPosition[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [voyageRes, logsRes, trackRes] = await Promise.all([
        api.get(`/api/v1/travelwiz/voyages/${voyageId}`),
        api.get(`/api/v1/travelwiz/voyages/${voyageId}/logs`).catch(() => ({ data: [] })),
        api.get(`/api/v1/travelwiz/tracking/fleet`).catch(() => ({ data: { positions: [] } })),
      ]);
      setVoyage(voyageRes.data);
      setLogs(logsRes.data);
      setPositions(trackRes.data.positions ?? []);
    } catch {
      // partial load ok
    } finally {
      setLoading(false);
    }
  }, [voyageId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!voyage) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium">Voyage introuvable</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.headerRow}>
            <Text variant="headlineSmall" style={styles.code}>
              {voyage.code}
            </Text>
            <StatusBadge status={voyage.status} size="md" />
          </View>
          <Text variant="titleMedium" style={styles.vectorName}>
            {voyage.vector_name}
          </Text>
          <Chip compact style={styles.typeChip}>
            {voyage.vector_type}
          </Chip>
        </Card.Content>
      </Card>

      {/* Schedule */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>Horaires</Text>
          <List.Item
            title="Départ prévu"
            description={new Date(voyage.scheduled_departure).toLocaleString("fr-FR")}
            left={(props) => <List.Icon {...props} icon="clock-outline" />}
          />
          {voyage.actual_departure && (
            <List.Item
              title="Départ effectif"
              description={new Date(voyage.actual_departure).toLocaleString("fr-FR")}
              left={(props) => <List.Icon {...props} icon="clock-check" />}
            />
          )}
          <List.Item
            title="Arrivée prévue"
            description={new Date(voyage.scheduled_arrival).toLocaleString("fr-FR")}
            left={(props) => <List.Icon {...props} icon="clock-outline" />}
          />
          {voyage.actual_arrival && (
            <List.Item
              title="Arrivée effective"
              description={new Date(voyage.actual_arrival).toLocaleString("fr-FR")}
              left={(props) => <List.Icon {...props} icon="clock-check" />}
            />
          )}
          {voyage.delay_reason && (
            <List.Item
              title="Motif de retard"
              description={voyage.delay_reason}
              left={(props) => <List.Icon {...props} icon="alert" color={colors.warning} />}
            />
          )}
        </Card.Content>
      </Card>

      {/* Route */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>Itinéraire</Text>
          {voyage.departure_base_name && (
            <List.Item
              title="Départ"
              description={voyage.departure_base_name}
              left={(props) => <List.Icon {...props} icon="map-marker" />}
            />
          )}
          {voyage.stop_count > 0 && (
            <List.Item
              title="Escales"
              description={`${voyage.stop_count} escale(s)`}
              left={(props) => <List.Icon {...props} icon="dots-horizontal" />}
            />
          )}
          {voyage.arrival_base_name && (
            <List.Item
              title="Arrivée"
              description={voyage.arrival_base_name}
              left={(props) => <List.Icon {...props} icon="map-marker-check" />}
            />
          )}
        </Card.Content>
      </Card>

      {/* Stats */}
      <View style={styles.statsRow}>
        <Card style={[styles.card, styles.statCard]}>
          <Card.Content style={styles.statContent}>
            <Text variant="headlineMedium" style={styles.statValue}>{voyage.pax_count}</Text>
            <Text variant="bodySmall" style={styles.statLabel}>Passagers</Text>
          </Card.Content>
        </Card>
        <Card style={[styles.card, styles.statCard]}>
          <Card.Content style={styles.statContent}>
            <Text variant="headlineMedium" style={styles.statValue}>{voyage.cargo_count}</Text>
            <Text variant="bodySmall" style={styles.statLabel}>Cargo</Text>
          </Card.Content>
        </Card>
      </View>

      {/* Map */}
      {positions.length > 0 && (
        <Card style={styles.card}>
          <FleetMap
            positions={positions}
            focusVehicleId={voyage.id}
            style={styles.map}
          />
        </Card>
      )}

      {/* Captain Logs */}
      {logs.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionTitle}>
              Journal de bord ({logs.length})
            </Text>
            {logs.map((log) => (
              <List.Item
                key={log.id}
                title={log.event_type}
                description={`${log.description}\n${new Date(log.timestamp).toLocaleString("fr-FR")}${log.created_by_name ? ` — ${log.created_by_name}` : ""}`}
                descriptionNumberOfLines={3}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon={EVENT_ICONS[log.event_type] ?? "note-text"}
                  />
                )}
              />
            ))}
          </Card.Content>
        </Card>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { borderRadius: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { fontWeight: "700", color: colors.primary },
  vectorName: { fontWeight: "600", color: colors.textPrimary, marginTop: 4 },
  typeChip: { alignSelf: "flex-start", marginTop: 8 },
  sectionTitle: {
    fontWeight: "700", color: colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
  },
  statsRow: { flexDirection: "row", gap: 12 },
  statCard: { flex: 1 },
  statContent: { alignItems: "center" },
  statValue: { fontWeight: "700", color: colors.primary },
  statLabel: { color: colors.textSecondary },
  map: { height: 250, borderRadius: 12 },
});
