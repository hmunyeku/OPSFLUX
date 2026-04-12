/**
 * My Contacts & Addresses — manage personal phones, emails, addresses.
 *
 * Allows the user to:
 *  - View/add/edit/delete phone numbers (with OTP verification)
 *  - View/add/edit/delete email addresses
 *  - View/add/edit/delete physical addresses
 *  - View emergency contacts
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  List,
  Text,
  TextInput,
} from "react-native-paper";
import { api } from "../services/api";
import { sendPhoneOtp, verifyPhoneOtp } from "../services/profile";
import { useToast } from "../components/Toast";
import { colors } from "../utils/colors";

interface Phone { id: string; number: string; label: string | null; verified: boolean; is_primary: boolean }
interface Email { id: string; email: string; verified: boolean; is_primary: boolean }
interface Address { id: string; label: string | null; street: string; city: string; postal_code: string; country: string }

export default function MyContactsScreen({ navigation }: { navigation: any }) {
  const toast = useToast();
  const [phones, setPhones] = useState<Phone[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  // OTP
  const [otpPhoneId, setOtpPhoneId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [phonesRes, emailsRes, addrRes] = await Promise.all([
        api.get("/api/v1/phones").catch(() => ({ data: [] })),
        api.get("/api/v1/contact-emails").catch(() => ({ data: [] })),
        api.get("/api/v1/addresses").catch(() => ({ data: [] })),
      ]);
      setPhones(Array.isArray(phonesRes.data) ? phonesRes.data : phonesRes.data?.items ?? []);
      setEmails(Array.isArray(emailsRes.data) ? emailsRes.data : emailsRes.data?.items ?? []);
      setAddresses(Array.isArray(addrRes.data) ? addrRes.data : addrRes.data?.items ?? []);
    } catch {
      // partial load ok
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSendOtp(phoneId: string) {
    setOtpLoading(true);
    try {
      await sendPhoneOtp(phoneId);
      setOtpPhoneId(phoneId);
      setOtpCode("");
      toast.show("Code envoyé par SMS", "success");
    } catch (err: any) {
      toast.show(err?.response?.data?.detail || "Erreur envoi code", "error");
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otpPhoneId || otpCode.length < 6) return;
    setOtpLoading(true);
    try {
      await verifyPhoneOtp(otpPhoneId, otpCode);
      toast.show("Numéro vérifié", "success");
      setOtpPhoneId(null);
      setOtpCode("");
      load();
    } catch (err: any) {
      toast.show(err?.response?.data?.detail || "Code invalide", "error");
      setOtpPhoneId(null);
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleDeletePhone(id: string) {
    Alert.alert("Supprimer", "Supprimer ce numéro ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/api/v1/phones/${id}`);
            load();
            toast.show("Numéro supprimé", "success");
          } catch { toast.show("Erreur", "error"); }
        },
      },
    ]);
  }

  async function handleDeleteAddress(id: string) {
    Alert.alert("Supprimer", "Supprimer cette adresse ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/api/v1/addresses/${id}`);
            load();
            toast.show("Adresse supprimée", "success");
          } catch { toast.show("Erreur", "error"); }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Phones */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Téléphones ({phones.length})
          </Text>
          {phones.map((p) => (
            <View key={p.id}>
              <View style={styles.itemRow}>
                <List.Icon icon="phone" color={p.verified ? colors.success : colors.textMuted} />
                <View style={styles.itemInfo}>
                  <Text variant="bodyLarge" style={styles.itemValue}>{p.number}</Text>
                  {p.label && <Text variant="bodySmall" style={styles.itemLabel}>{p.label}</Text>}
                </View>
                {p.verified ? (
                  <Chip compact icon="check" style={styles.verifiedChip}>Vérifié</Chip>
                ) : (
                  <Button compact mode="outlined" loading={otpLoading} onPress={() => handleSendOtp(p.id)}>
                    Vérifier
                  </Button>
                )}
                <IconButton icon="delete" size={18} onPress={() => handleDeletePhone(p.id)} iconColor={colors.danger} />
              </View>
              {otpPhoneId === p.id && (
                <View style={styles.otpRow}>
                  <TextInput
                    mode="outlined" label="Code à 6 chiffres" value={otpCode}
                    onChangeText={setOtpCode} keyboardType="number-pad" maxLength={6}
                    style={styles.otpInput} dense
                  />
                  <Button mode="contained" compact onPress={handleVerifyOtp} disabled={otpCode.length < 6}>
                    OK
                  </Button>
                </View>
              )}
            </View>
          ))}
          {phones.length === 0 && <Text style={styles.empty}>Aucun numéro.</Text>}
        </Card.Content>
      </Card>

      {/* Emails */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Emails ({emails.length})
          </Text>
          {emails.map((e) => (
            <View key={e.id} style={styles.itemRow}>
              <List.Icon icon="email" color={e.verified ? colors.success : colors.textMuted} />
              <View style={styles.itemInfo}>
                <Text variant="bodyLarge" style={styles.itemValue}>{e.email}</Text>
              </View>
              {e.verified ? (
                <Chip compact icon="check" style={styles.verifiedChip}>Vérifié</Chip>
              ) : (
                <Chip compact style={styles.pendingChip}>Non vérifié</Chip>
              )}
              {e.is_primary && <Chip compact style={styles.primaryChip}>Principal</Chip>}
            </View>
          ))}
          {emails.length === 0 && <Text style={styles.empty}>Aucun email.</Text>}
        </Card.Content>
      </Card>

      {/* Addresses */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Adresses ({addresses.length})
          </Text>
          {addresses.map((a) => (
            <View key={a.id} style={styles.itemRow}>
              <List.Icon icon="map-marker" />
              <View style={styles.itemInfo}>
                {a.label && <Text variant="bodySmall" style={styles.itemLabel}>{a.label}</Text>}
                <Text variant="bodyMedium" style={styles.itemValue}>{a.street}</Text>
                <Text variant="bodySmall" style={styles.itemLabel}>{a.postal_code} {a.city}, {a.country}</Text>
              </View>
              <IconButton icon="delete" size={18} onPress={() => handleDeleteAddress(a.id)} iconColor={colors.danger} />
            </View>
          ))}
          {addresses.length === 0 && <Text style={styles.empty}>Aucune adresse.</Text>}
        </Card.Content>
      </Card>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { borderRadius: 12 },
  sectionTitle: { fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  itemInfo: { flex: 1, marginLeft: 4 },
  itemValue: { fontWeight: "600", color: colors.textPrimary },
  itemLabel: { color: colors.textSecondary },
  verifiedChip: { backgroundColor: colors.success + "20", marginRight: 4 },
  pendingChip: { backgroundColor: colors.warning + "20", marginRight: 4 },
  primaryChip: { backgroundColor: colors.primary + "20" },
  otpRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 40, paddingVertical: 8 },
  otpInput: { flex: 1, backgroundColor: colors.surface },
  empty: { color: colors.textMuted, fontStyle: "italic", textAlign: "center", marginTop: 8 },
});
