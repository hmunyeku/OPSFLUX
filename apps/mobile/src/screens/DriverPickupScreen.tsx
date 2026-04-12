/**
 * Driver Pickup Screen — Yango/CartoGo-style passenger pickup mode.
 *
 * Flow:
 *  1. Driver authenticates via trip code (like captain)
 *  2. Gets a list of passengers to pick up with addresses/locations
 *  3. For each passenger:
 *     - Shows pickup location + navigation link (opens native maps)
 *     - Big "Pax ramassé" button to mark as picked up
 *     - Updates boarding_status on server in real-time
 *  4. Progress bar showing picked-up vs total
 *  5. Sends GPS position continuously (tracking beacon)
 *
 * Uses the TravelWiz driver session endpoints.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  ProgressBar,
  Surface,
  Text,
  TextInput,
} from "react-native-paper";
import * as Location from "expo-location";
import { api } from "../services/api";
import { startTracking, stopTracking, useTrackingStore } from "../services/tracking";
import { colors } from "../utils/colors";

// ── Types ─────────────────────────────────────────────────────────────

interface PickupPassenger {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lon: number | null;
  boarding_status: "pending" | "boarded" | "no_show" | "offloaded";
  priority_score: number;
  declared_weight_kg: number | null;
}

interface Props {
  navigation: any;
}

type Step = "auth" | "pickup";

export default function DriverPickupScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>("auth");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Session
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [voyageId, setVoyageId] = useState<string | null>(null);
  const [voyageCode, setVoyageCode] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);

  // Passengers
  const [passengers, setPassengers] = useState<PickupPassenger[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Driver position
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLon, setDriverLon] = useState<number | null>(null);

  // ── Auth ───────────────────────────────────────────────────────────

  const handleAuth = useCallback(async () => {
    if (code.length < 4) return;
    setLoading(true);
    try {
      // Use the captain/driver auth endpoint
      const { data } = await api.post(
        "/api/v1/travelwiz/captain/authenticate",
        null,
        { params: { access_code: code } }
      );

      setSessionToken(data.session_token);
      setVoyageId(data.voyage_id);
      setVoyageCode(data.voyage_code ?? code);
      setVehicleId(data.vehicle_id ?? null);

      // Load manifest passengers
      const manifest = await api.get(
        `/api/v1/travelwiz/captain/${data.voyage_id}/manifest`,
        { headers: { "X-Captain-Session": data.session_token } }
      );

      const pax: PickupPassenger[] = (manifest.data.passengers ?? []).map(
        (p: any) => ({
          id: p.id,
          name: p.name,
          company: p.company,
          phone: p.phone ?? null,
          pickup_address: p.pickup_address ?? p.departure_base_name ?? null,
          pickup_lat: p.pickup_lat ?? null,
          pickup_lon: p.pickup_lon ?? null,
          boarding_status: p.boarding_status ?? "pending",
          priority_score: p.priority_score ?? 0,
          declared_weight_kg: p.declared_weight_kg ?? null,
        })
      );

      setPassengers(pax);
      setStep("pickup");

      // Start tracking beacon if vehicle assigned
      if (data.vehicle_id) {
        startTracking(data.vehicle_id, 15_000); // every 15s for pickup
      }

      // Get driver position
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setDriverLat(loc.coords.latitude);
        setDriverLon(loc.coords.longitude);
      }
    } catch (err: any) {
      Alert.alert("Erreur", err?.response?.data?.detail || "Code invalide.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  // ── Mark Passenger Picked Up ──────────────────────────────────────

  const markPickedUp = useCallback(
    async (passengerId: string) => {
      if (!voyageId || !sessionToken) return;
      setUpdatingId(passengerId);
      try {
        await api.post(
          `/api/v1/travelwiz/captain/${voyageId}/event`,
          {
            event_type: "pax_pickup",
            notes: `Passager ${passengerId} ramassé`,
          },
          { headers: { "X-Captain-Session": sessionToken } }
        );

        setPassengers((prev) =>
          prev.map((p) =>
            p.id === passengerId
              ? { ...p, boarding_status: "boarded" }
              : p
          )
        );
      } catch (err: any) {
        Alert.alert("Erreur", err?.response?.data?.detail || "Impossible de mettre à jour.");
      } finally {
        setUpdatingId(null);
      }
    },
    [voyageId, sessionToken]
  );

  const markNoShow = useCallback(
    async (passengerId: string) => {
      if (!voyageId || !sessionToken) return;
      setUpdatingId(passengerId);
      try {
        await api.post(
          `/api/v1/travelwiz/captain/${voyageId}/event`,
          {
            event_type: "pax_no_show",
            notes: `Passager ${passengerId} absent`,
          },
          { headers: { "X-Captain-Session": sessionToken } }
        );

        setPassengers((prev) =>
          prev.map((p) =>
            p.id === passengerId
              ? { ...p, boarding_status: "no_show" }
              : p
          )
        );
      } catch {
        Alert.alert("Erreur", "Impossible de mettre à jour.");
      } finally {
        setUpdatingId(null);
      }
    },
    [voyageId, sessionToken]
  );

  // ── Open Navigation ───────────────────────────────────────────────

  function openNavigation(lat: number, lon: number, name: string) {
    const scheme = Platform.select({
      ios: `maps:0,0?q=${name}&ll=${lat},${lon}`,
      android: `geo:${lat},${lon}?q=${lat},${lon}(${name})`,
    });
    if (scheme) Linking.openURL(scheme);
  }

  // ── Auth Screen ───────────────────────────────────────────────────

  if (step === "auth") {
    return (
      <View style={styles.authContainer}>
        <Surface style={styles.authCard} elevation={2}>
          <Text variant="headlineSmall" style={styles.authTitle}>
            Mode Ramassage
          </Text>
          <Text variant="bodyMedium" style={styles.authSubtitle}>
            Entrez le code de la rotation pour commencer le ramassage
          </Text>
          <TextInput
            mode="outlined"
            label="Code de rotation"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            style={styles.codeInput}
            contentStyle={styles.codeInputContent}
            autoFocus
          />
          <Button
            mode="contained"
            onPress={handleAuth}
            loading={loading}
            disabled={loading || code.length < 4}
            style={styles.authButton}
            buttonColor={colors.success}
          >
            Démarrer le ramassage
          </Button>
        </Surface>
      </View>
    );
  }

  // ── Pickup Screen ─────────────────────────────────────────────────

  const pickedUp = passengers.filter((p) => p.boarding_status === "boarded").length;
  const noShow = passengers.filter((p) => p.boarding_status === "no_show").length;
  const remaining = passengers.filter((p) => p.boarding_status === "pending");
  const done = passengers.filter((p) => p.boarding_status !== "pending");
  const progress = passengers.length ? (pickedUp + noShow) / passengers.length : 0;

  const renderPassenger = ({ item }: { item: PickupPassenger }) => {
    const isPending = item.boarding_status === "pending";
    const isBoarded = item.boarding_status === "boarded";
    const isNoShow = item.boarding_status === "no_show";
    const isUpdating = updatingId === item.id;

    return (
      <Card
        style={[
          styles.paxCard,
          isBoarded && styles.paxCardBoarded,
          isNoShow && styles.paxCardNoShow,
        ]}
      >
        <Card.Content>
          <View style={styles.paxHeader}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={styles.paxName}>
                {item.name}
              </Text>
              {item.company && (
                <Text variant="bodySmall" style={styles.paxCompany}>
                  {item.company}
                </Text>
              )}
            </View>
            {!isPending && (
              <Chip
                compact
                style={{
                  backgroundColor: isBoarded
                    ? colors.success + "20"
                    : colors.danger + "20",
                }}
                textStyle={{
                  color: isBoarded ? colors.success : colors.danger,
                }}
              >
                {isBoarded ? "Ramassé" : "Absent"}
              </Chip>
            )}
          </View>

          {/* Pickup address */}
          {item.pickup_address && (
            <Text variant="bodyMedium" style={styles.paxAddress}>
              {item.pickup_address}
            </Text>
          )}

          {/* Phone */}
          {item.phone && (
            <Button
              mode="text"
              compact
              icon="phone"
              onPress={() => Linking.openURL(`tel:${item.phone}`)}
              style={styles.phoneButton}
            >
              {item.phone}
            </Button>
          )}

          {/* Action buttons */}
          {isPending && (
            <View style={styles.actionRow}>
              {/* Navigate to pickup */}
              {item.pickup_lat && item.pickup_lon && (
                <Button
                  mode="outlined"
                  icon="navigation"
                  compact
                  onPress={() =>
                    openNavigation(item.pickup_lat!, item.pickup_lon!, item.name)
                  }
                  style={styles.navButton}
                >
                  Itinéraire
                </Button>
              )}

              {/* Mark picked up */}
              <Button
                mode="contained"
                icon="check"
                loading={isUpdating}
                disabled={isUpdating}
                onPress={() => markPickedUp(item.id)}
                style={styles.pickupButton}
                buttonColor={colors.success}
              >
                Ramassé
              </Button>

              {/* Mark no-show */}
              <Button
                mode="outlined"
                compact
                loading={isUpdating}
                disabled={isUpdating}
                onPress={() => markNoShow(item.id)}
                textColor={colors.danger}
                style={styles.noShowButton}
              >
                Absent
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with progress */}
      <Surface style={styles.header} elevation={1}>
        <View style={styles.headerRow}>
          <Text variant="titleMedium" style={styles.headerTitle}>
            Rotation {voyageCode}
          </Text>
          <Text variant="bodyMedium" style={styles.headerCount}>
            {pickedUp}/{passengers.length}
          </Text>
        </View>
        <ProgressBar progress={progress} color={colors.success} style={styles.progressBar} />
        <View style={styles.statsRow}>
          <Chip compact style={styles.statChip}>
            {remaining.length} restant{remaining.length > 1 ? "s" : ""}
          </Chip>
          <Chip compact icon="check" style={[styles.statChip, { backgroundColor: colors.success + "15" }]}>
            {pickedUp} ramassé{pickedUp > 1 ? "s" : ""}
          </Chip>
          {noShow > 0 && (
            <Chip compact style={[styles.statChip, { backgroundColor: colors.danger + "15" }]}>
              {noShow} absent{noShow > 1 ? "s" : ""}
            </Chip>
          )}
        </View>
      </Surface>

      {/* Passenger list — pending first, then done */}
      <FlatList
        data={[...remaining, ...done]}
        keyExtractor={(item) => item.id}
        renderItem={renderPassenger}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />

      {/* Footer — end pickup */}
      <Surface style={styles.footer} elevation={2}>
        <Button
          mode="outlined"
          onPress={() => {
            stopTracking();
            setStep("auth");
            setCode("");
            setPassengers([]);
          }}
        >
          Terminer le ramassage
        </Button>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  // Auth
  authContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: colors.primaryDark,
  },
  authCard: { borderRadius: 16, padding: 32, alignItems: "center", width: "100%", maxWidth: 400 },
  authTitle: { fontWeight: "700", color: colors.primary, marginBottom: 8 },
  authSubtitle: { color: colors.textSecondary, textAlign: "center", marginBottom: 24 },
  codeInput: { width: "100%", backgroundColor: colors.surface, marginBottom: 16 },
  codeInputContent: { fontSize: 28, letterSpacing: 8, textAlign: "center" },
  authButton: { width: "100%", borderRadius: 10 },

  // Pickup
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontWeight: "700", color: colors.primary },
  headerCount: { fontWeight: "700", color: colors.success, fontSize: 18 },
  progressBar: { marginTop: 10, height: 6, borderRadius: 3 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  statChip: { backgroundColor: colors.surfaceAlt },
  listContent: { padding: 14 },
  paxCard: { borderRadius: 12 },
  paxCardBoarded: { borderLeftWidth: 4, borderLeftColor: colors.success },
  paxCardNoShow: { borderLeftWidth: 4, borderLeftColor: colors.danger, opacity: 0.6 },
  paxHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  paxName: { fontWeight: "700", color: colors.textPrimary },
  paxCompany: { color: colors.textSecondary },
  paxAddress: { color: colors.textPrimary, marginTop: 4 },
  phoneButton: { alignSelf: "flex-start", marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  navButton: { flex: 1 },
  pickupButton: { flex: 2 },
  noShowButton: {},
  footer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
