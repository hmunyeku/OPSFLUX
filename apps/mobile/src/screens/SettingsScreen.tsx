/**
 * Settings / Profile screen — full profile, OTP verify, entity switch, logout.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
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
  HelperText,
  List,
  Surface,
  Switch,
  Text,
  TextInput,
} from "react-native-paper";
import { colors } from "../utils/colors";
import { useAuthStore } from "../stores/auth";
import { usePermissions } from "../stores/permissions";
import { useOfflineStore, clearCache, flushQueue } from "../services/offline";
import { useTrackingStore, stopTracking } from "../services/tracking";
import {
  getProfile,
  updateProfile,
  listPhones,
  sendPhoneOtp,
  verifyPhoneOtp,
  UserProfile,
  PhoneEntry,
} from "../services/profile";

export default function SettingsScreen() {
  const { userDisplayName, baseUrl, entityId, logout } = useAuthStore();
  const permissionCount = usePermissions((s) => s.permissions.length);
  const { isOnline, queueLength, syncing, lastSyncAt } = useOfflineStore();
  const trackingEnabled = useTrackingStore((s) => s.enabled);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [phones, setPhones] = useState<PhoneEntry[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // OTP state
  const [otpPhoneId, setOtpPhoneId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const [p, ph] = await Promise.all([getProfile(), listPhones()]);
      setProfile(p);
      setPhones(ph);
      setEditFirstName(p.first_name);
      setEditLastName(p.last_name);
      useAuthStore.getState().setUser(p.id, `${p.first_name} ${p.last_name}`);
    } catch {
      // Might be offline — show cached info
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ── Profile Edit ──────────────────────────────────────────────────

  async function handleSaveProfile() {
    setSaving(true);
    try {
      const updated = await updateProfile({
        first_name: editFirstName,
        last_name: editLastName,
      });
      setProfile(updated);
      useAuthStore.getState().setUser(updated.id, `${updated.first_name} ${updated.last_name}`);
      setEditing(false);
    } catch (err: any) {
      Alert.alert("Erreur", err?.response?.data?.detail || "Impossible de sauvegarder.");
    } finally {
      setSaving(false);
    }
  }

  // ── OTP Flow ──────────────────────────────────────────────────────

  async function handleSendOtp(phoneId: string) {
    setOtpSending(true);
    try {
      await sendPhoneOtp(phoneId);
      setOtpPhoneId(phoneId);
      setOtpCode("");
      Alert.alert("Code envoyé", "Un code de vérification a été envoyé par SMS.");
    } catch (err: any) {
      Alert.alert("Erreur", err?.response?.data?.detail || "Impossible d'envoyer le code.");
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otpPhoneId || !otpCode.trim()) return;
    setOtpVerifying(true);
    try {
      await verifyPhoneOtp(otpPhoneId, otpCode.trim());
      Alert.alert("Vérifié", "Votre numéro a été vérifié avec succès.");
      setOtpPhoneId(null);
      setOtpCode("");
      loadProfile(); // refresh
    } catch (err: any) {
      Alert.alert("Erreur", err?.response?.data?.detail || "Code invalide.");
    } finally {
      setOtpVerifying(false);
    }
  }

  // ── Logout ────────────────────────────────────────────────────────

  function handleLogout() {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Déconnexion",
        style: "destructive",
        onPress: () => {
          if (trackingEnabled) stopTracking();
          logout();
        },
      },
    ]);
  }

  async function handleForceSync() {
    const result = await flushQueue();
    Alert.alert(
      "Synchronisation",
      `${result.success} envoyée(s), ${result.failed} échouée(s).`
    );
  }

  async function handleClearCache() {
    await clearCache();
    Alert.alert("Cache vidé", "Le cache local a été supprimé.");
  }

  // ── Render ────────────────────────────────────────────────────────

  if (loadingProfile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const initials = profile
    ? `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile card */}
      <Card style={styles.card}>
        <Card.Content style={styles.profileContent}>
          <Avatar.Text
            size={72}
            label={initials}
            style={{ backgroundColor: colors.primary }}
          />
          {!editing ? (
            <>
              <Text variant="headlineSmall" style={styles.profileName}>
                {profile?.first_name} {profile?.last_name}
              </Text>
              <Text variant="bodyMedium" style={styles.profileEmail}>
                {profile?.email}
              </Text>
              <Button
                mode="outlined"
                compact
                onPress={() => setEditing(true)}
                style={{ marginTop: 12 }}
              >
                Modifier le profil
              </Button>
            </>
          ) : (
            <View style={styles.editForm}>
              <TextInput
                mode="outlined"
                label="Prénom"
                value={editFirstName}
                onChangeText={setEditFirstName}
                style={styles.editInput}
              />
              <TextInput
                mode="outlined"
                label="Nom"
                value={editLastName}
                onChangeText={setEditLastName}
                style={styles.editInput}
              />
              <View style={styles.editActions}>
                <Button mode="outlined" onPress={() => setEditing(false)}>
                  Annuler
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSaveProfile}
                  loading={saving}
                >
                  Enregistrer
                </Button>
              </View>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Phone numbers + OTP */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Téléphones
          </Text>
          {phones.length === 0 ? (
            <Text variant="bodyMedium" style={styles.emptyText}>
              Aucun numéro enregistré.
            </Text>
          ) : (
            phones.map((phone) => (
              <View key={phone.id}>
                <List.Item
                  title={phone.number}
                  description={phone.label ?? (phone.is_primary ? "Principal" : "")}
                  right={() => (
                    <View style={styles.phoneRight}>
                      {phone.verified ? (
                        <Chip compact icon="check" style={styles.verifiedChip}>
                          Vérifié
                        </Chip>
                      ) : (
                        <Button
                          mode="outlined"
                          compact
                          loading={otpSending}
                          onPress={() => handleSendOtp(phone.id)}
                        >
                          Vérifier
                        </Button>
                      )}
                    </View>
                  )}
                />
                {otpPhoneId === phone.id && (
                  <View style={styles.otpRow}>
                    <TextInput
                      mode="outlined"
                      label="Code à 6 chiffres"
                      value={otpCode}
                      onChangeText={setOtpCode}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={styles.otpInput}
                    />
                    <Button
                      mode="contained"
                      onPress={handleVerifyOtp}
                      loading={otpVerifying}
                      disabled={otpCode.length < 6}
                    >
                      OK
                    </Button>
                  </View>
                )}
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      {/* Connection / Offline info */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Connexion
          </Text>
          <List.Item
            title="Serveur"
            description={baseUrl}
            left={(props) => <List.Icon {...props} icon="server-network" />}
          />
          <List.Item
            title="Entité"
            description={entityId ?? "Non définie"}
            left={(props) => <List.Icon {...props} icon="domain" />}
          />
          <List.Item
            title="Permissions"
            description={`${permissionCount} permission(s) chargée(s)`}
            left={(props) => <List.Icon {...props} icon="shield-check" />}
          />
          <Divider style={{ marginVertical: 8 }} />
          <List.Item
            title="Statut"
            description={isOnline ? "En ligne" : "Hors ligne"}
            left={(props) => (
              <List.Icon
                {...props}
                icon={isOnline ? "wifi" : "wifi-off"}
                color={isOnline ? colors.success : colors.danger}
              />
            )}
          />
          {queueLength > 0 && (
            <List.Item
              title="File d'attente"
              description={`${queueLength} action(s) en attente de sync`}
              left={(props) => <List.Icon {...props} icon="cloud-upload" />}
              right={() => (
                <Button
                  compact
                  mode="outlined"
                  onPress={handleForceSync}
                  loading={syncing}
                >
                  Sync
                </Button>
              )}
            />
          )}
          {lastSyncAt && (
            <Text variant="bodySmall" style={styles.lastSync}>
              Dernière sync: {new Date(lastSyncAt).toLocaleString("fr-FR")}
            </Text>
          )}
        </Card.Content>
      </Card>

      {/* App info */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Application
          </Text>
          <List.Item title="Version" description="1.0.0" />
          <List.Item title="Plateforme" description="React Native / Expo" />
          <Button
            mode="text"
            compact
            onPress={handleClearCache}
            textColor={colors.textSecondary}
          >
            Vider le cache local
          </Button>
        </Card.Content>
      </Card>

      {/* Logout */}
      <Button
        mode="contained"
        buttonColor={colors.danger}
        onPress={handleLogout}
        style={styles.logoutButton}
      >
        Se déconnecter
      </Button>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { borderRadius: 12 },
  profileContent: { alignItems: "center", paddingVertical: 20 },
  profileName: { fontWeight: "700", color: colors.textPrimary, marginTop: 12 },
  profileEmail: { color: colors.textSecondary, marginTop: 2 },
  editForm: { width: "100%", marginTop: 16, gap: 10 },
  editInput: { backgroundColor: colors.surface },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  sectionTitle: {
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emptyText: { color: colors.textMuted },
  phoneRight: { justifyContent: "center" },
  verifiedChip: { backgroundColor: colors.success + "20" },
  otpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  otpInput: { flex: 1, backgroundColor: colors.surface },
  lastSync: { color: colors.textMuted, paddingHorizontal: 16, marginTop: 4 },
  logoutButton: { marginTop: 8, borderRadius: 12 },
});
