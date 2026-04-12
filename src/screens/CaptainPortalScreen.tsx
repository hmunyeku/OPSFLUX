/**
 * Captain Portal — lightweight auth via 6-digit trip code.
 *
 * Flow:
 *  1. Enter 6-digit code → POST /captain/authenticate
 *  2. Get session token + voyage context
 *  3. View manifest (pax + cargo) via GET /captain/{id}/manifest
 *  4. Record events (departure, arrival, etc.) via POST /captain/{id}/event
 *
 * The captain session is separate from the main JWT auth.
 */

import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
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
  Text,
  TextInput,
} from "react-native-paper";
import {
  captainAuthenticate,
  getCaptainManifest,
  postCaptainEvent,
  CaptainAuthResult,
  CaptainManifest,
  CaptainManifestPassenger,
} from "../services/travelwiz";
import StatusBadge from "../components/StatusBadge";
import { colors } from "../utils/colors";

interface Props {
  navigation: any;
}

type Step = "auth" | "manifest";

const EVENT_TYPES = [
  { code: "departure", label: "Départ", icon: "D", color: colors.info },
  { code: "arrival", label: "Arrivée", icon: "A", color: colors.success },
  { code: "weather", label: "Météo", icon: "M", color: colors.warning },
  { code: "incident", label: "Incident", icon: "!", color: colors.danger },
  { code: "fuel", label: "Carburant", icon: "F", color: colors.accent },
  { code: "technical", label: "Technique", icon: "T", color: colors.primaryLight },
];

export default function CaptainPortalScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>("auth");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Session
  const [session, setSession] = useState<CaptainAuthResult | null>(null);
  const [manifest, setManifest] = useState<CaptainManifest | null>(null);

  // Event recording
  const [eventNotes, setEventNotes] = useState("");
  const [recordingEvent, setRecordingEvent] = useState(false);

  // ── Auth ───────────────────────────────────────────────────────────

  const handleAuth = useCallback(async () => {
    if (code.length < 4) {
      Alert.alert("Erreur", "Entrez le code d'accès voyage.");
      return;
    }
    setLoading(true);
    try {
      const result = await captainAuthenticate(code);
      setSession(result);

      // Load manifest
      const mf = await getCaptainManifest(result.voyage_id, result.session_token);
      setManifest(mf);
      setStep("manifest");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      Alert.alert("Accès refusé", detail || "Code invalide ou expiré.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  // ── Record Event ──────────────────────────────────────────────────

  const handleRecordEvent = useCallback(
    async (eventCode: string) => {
      if (!session) return;
      setRecordingEvent(true);
      try {
        await postCaptainEvent(session.voyage_id, session.session_token, {
          event_type: eventCode,
          notes: eventNotes || undefined,
        });
        Alert.alert("Enregistré", `Événement "${eventCode}" enregistré.`);
        setEventNotes("");
      } catch (err: any) {
        Alert.alert("Erreur", err?.response?.data?.detail || "Impossible d'enregistrer.");
      } finally {
        setRecordingEvent(false);
      }
    },
    [session, eventNotes]
  );

  // ── Auth Screen ───────────────────────────────────────────────────

  if (step === "auth") {
    return (
      <View style={styles.authContainer}>
        <Surface style={styles.authCard} elevation={2}>
          <Text variant="headlineSmall" style={styles.authTitle}>
            Portail Capitaine
          </Text>
          <Text variant="bodyMedium" style={styles.authSubtitle}>
            Entrez le code d'accès voyage à 6 chiffres
          </Text>

          <TextInput
            mode="outlined"
            label="Code d'accès"
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
          >
            Accéder au voyage
          </Button>
        </Surface>
      </View>
    );
  }

  // ── Manifest Screen ───────────────────────────────────────────────

  const voyage = manifest?.voyage;
  const passengers = manifest?.passengers ?? [];
  const cargo = manifest?.cargo ?? [];
  const boardedCount = passengers.filter((p) => p.boarding_status === "boarded").length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Voyage header */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.voyageHeader}>
            <Text variant="titleLarge" style={styles.voyageCode}>
              {voyage?.code ?? session?.voyage_code}
            </Text>
            {voyage?.status && <StatusBadge status={voyage.status} size="md" />}
          </View>
          <Text variant="bodyMedium" style={styles.vesselName}>
            {voyage?.vessel_name ?? session?.vessel_name}
          </Text>
          {voyage?.scheduled_departure && (
            <Text variant="bodySmall" style={styles.scheduleMeta}>
              Départ: {new Date(voyage.scheduled_departure).toLocaleString("fr-FR")}
            </Text>
          )}
          {voyage?.scheduled_arrival && (
            <Text variant="bodySmall" style={styles.scheduleMeta}>
              Arrivée: {new Date(voyage.scheduled_arrival).toLocaleString("fr-FR")}
            </Text>
          )}
        </Card.Content>
      </Card>

      {/* PAX Manifest */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Passagers ({boardedCount}/{passengers.length})
          </Text>
          {passengers.map((pax) => (
            <View key={pax.id} style={styles.paxRow}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" style={styles.paxName}>
                  {pax.name}
                </Text>
                {pax.company && (
                  <Text variant="bodySmall" style={styles.paxCompany}>
                    {pax.company}
                  </Text>
                )}
              </View>
              <View style={styles.paxRight}>
                <StatusBadge status={pax.boarding_status} />
                {pax.standby && (
                  <Chip compact style={styles.standbyChip}>
                    Standby
                  </Chip>
                )}
              </View>
            </View>
          ))}
          {passengers.length === 0 && (
            <Text variant="bodyMedium" style={styles.emptyText}>
              Aucun passager.
            </Text>
          )}
        </Card.Content>
      </Card>

      {/* Cargo Manifest */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Cargo ({cargo.length})
          </Text>
          {cargo.map((c) => (
            <View key={c.id} style={styles.cargoRow}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" style={styles.cargoRef}>
                  {c.reference}
                </Text>
                <Text variant="bodySmall" style={styles.cargoDesc}>
                  {c.designation}
                  {c.weight_kg ? ` — ${c.weight_kg} kg` : ""}
                </Text>
              </View>
              {c.hazmat && (
                <Chip compact style={styles.hazmatChip} textStyle={{ color: colors.danger }}>
                  HAZMAT
                </Chip>
              )}
            </View>
          ))}
          {cargo.length === 0 && (
            <Text variant="bodyMedium" style={styles.emptyText}>
              Aucun cargo.
            </Text>
          )}
        </Card.Content>
      </Card>

      {/* Event recording */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Journal de bord
          </Text>
          <TextInput
            mode="outlined"
            label="Notes (optionnel)"
            value={eventNotes}
            onChangeText={setEventNotes}
            multiline
            numberOfLines={2}
            style={styles.eventNotes}
          />
          <View style={styles.eventGrid}>
            {EVENT_TYPES.map((evt) => (
              <Button
                key={evt.code}
                mode="outlined"
                compact
                loading={recordingEvent}
                onPress={() => handleRecordEvent(evt.code)}
                style={styles.eventButton}
                labelStyle={{ fontSize: 12 }}
              >
                {evt.label}
              </Button>
            ))}
          </View>
        </Card.Content>
      </Card>

      {/* Disconnect */}
      <Button
        mode="outlined"
        onPress={() => {
          setSession(null);
          setManifest(null);
          setStep("auth");
          setCode("");
        }}
        style={styles.disconnectButton}
      >
        Quitter le portail capitaine
      </Button>

      <View style={{ height: 32 }} />
    </ScrollView>
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
  authCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
  },
  authTitle: { fontWeight: "700", color: colors.primary, marginBottom: 8 },
  authSubtitle: { color: colors.textSecondary, textAlign: "center", marginBottom: 24 },
  codeInput: { width: "100%", backgroundColor: colors.surface, marginBottom: 16 },
  codeInputContent: { fontSize: 28, letterSpacing: 8, textAlign: "center" },
  authButton: { width: "100%", borderRadius: 10 },

  // Manifest
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  card: { borderRadius: 12 },
  voyageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  voyageCode: { fontWeight: "700", color: colors.primary },
  vesselName: { color: colors.textPrimary, fontWeight: "600", marginTop: 4 },
  scheduleMeta: { color: colors.textSecondary, marginTop: 2 },
  sectionTitle: {
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  // PAX
  paxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  paxName: { fontWeight: "600", color: colors.textPrimary },
  paxCompany: { color: colors.textSecondary },
  paxRight: { alignItems: "flex-end", gap: 4 },
  standbyChip: { backgroundColor: colors.warning + "20" },
  // Cargo
  cargoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  cargoRef: { fontWeight: "600", color: colors.primary },
  cargoDesc: { color: colors.textSecondary },
  hazmatChip: { backgroundColor: colors.danger + "15" },
  // Events
  eventNotes: { backgroundColor: colors.surface, marginBottom: 12 },
  eventGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  eventButton: { minWidth: 90 },
  // General
  emptyText: { color: colors.textMuted, fontStyle: "italic" },
  disconnectButton: { marginTop: 8, borderColor: colors.danger },
});
