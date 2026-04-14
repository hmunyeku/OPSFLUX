/**
 * ADS Detail Screen — full view of a single Avis de Séjour.
 *
 * Shows:
 *  - Header with reference, status, dates
 *  - Site information
 *  - Transport details (outbound/return)
 *  - PAX list with compliance status
 *  - Action buttons (submit, approve, reject based on permissions)
 *  - History/timeline
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  List,
  Surface,
  Text,
} from "react-native-paper";
import { useTranslation } from "react-i18next";
import StatusBadge from "../components/StatusBadge";
import { api } from "../services/api";
import { usePermissions } from "../stores/permissions";
import { useToast } from "../components/Toast";
import { colors } from "../utils/colors";
import type { AdsSummary } from "../types/api";

interface Props {
  route: { params: { adsId: string } };
  navigation: any;
}

interface AdsDetail extends AdsSummary {
  visit_purpose: string;
  visit_category: string;
  site_entry_asset_name: string;
  requester_display_name: string;
  outbound_transport_mode: string | null;
  outbound_departure_base_name: string | null;
  return_transport_mode: string | null;
  return_departure_base_name: string | null;
  is_round_trip_no_overnight: boolean;
  pax_entries: Array<{
    id: string;
    display_name: string;
    status: string;
    compliance_ok: boolean;
    company_name: string | null;
  }>;
}

const TRANSPORT_LABELS: Record<string, string> = {
  helicopter: "Hélicoptère",
  boat: "Bateau",
  road: "Route",
  other: "Autre",
};

const CATEGORY_LABELS: Record<string, string> = {
  project_work: "Travaux projet",
  maintenance: "Maintenance",
  inspection: "Inspection",
  visit: "Visite",
  permanent_ops: "Opérations permanentes",
  other: "Autre",
};

export default function AdsDetailScreen({ route, navigation }: Props) {
  const { adsId } = route.params;
  const { t } = useTranslation();
  const [ads, setAds] = useState<AdsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const canApprove = usePermissions((s) => s.has("paxlog.ads.approve"));
  const canSubmit = usePermissions((s) => s.has("paxlog.ads.submit"));
  const toast = useToast();

  const loadAds = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/v1/pax/ads/${adsId}`);
      setAds(data);
    } catch {
      toast.show("Impossible de charger l'ADS", "error");
    } finally {
      setLoading(false);
    }
  }, [adsId]);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  async function handleAction(action: "submit" | "approve" | "reject") {
    if (!ads) return;
    const confirmMessages = {
      submit: "Soumettre cet ADS pour validation ?",
      approve: "Approuver cet ADS ?",
      reject: "Rejeter cet ADS ?",
    };

    Alert.alert("Confirmation", confirmMessages[action], [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.confirm"),
        onPress: async () => {
          setActing(true);
          try {
            const { data } = await api.post(`/api/v1/pax/ads/${adsId}/${action}`);
            setAds(data);
            toast.show(
              action === "approve" ? "ADS approuvé" : action === "reject" ? "ADS rejeté" : "ADS soumis",
              "success"
            );
          } catch (err: any) {
            toast.show(err?.response?.data?.detail || "Erreur", "error");
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!ads) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium">ADS introuvable</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.headerRow}>
            <Text variant="headlineSmall" style={styles.reference}>
              {ads.reference}
            </Text>
            <StatusBadge status={ads.status} size="md" />
          </View>
          <Text variant="bodyLarge" style={styles.purpose}>
            {ads.visit_purpose}
          </Text>
          <Chip compact style={styles.categoryChip}>
            {CATEGORY_LABELS[ads.visit_category] ?? ads.visit_category}
          </Chip>
          {ads.is_round_trip_no_overnight && (
            <Chip compact icon="repeat" style={styles.roundTripChip}>
              A/R sans nuitée
            </Chip>
          )}
        </Card.Content>
      </Card>

      {/* Dates & Site */}
      <Card style={styles.card}>
        <Card.Content>
          <List.Item
            title="Site d'accueil"
            description={ads.site_entry_asset_name}
            left={(props) => <List.Icon {...props} icon="map-marker" />}
          />
          <List.Item
            title="Période"
            description={`${ads.start_date} — ${ads.end_date}`}
            left={(props) => <List.Icon {...props} icon="calendar" />}
          />
          <List.Item
            title="Demandeur"
            description={ads.requester_display_name}
            left={(props) => <List.Icon {...props} icon="account" />}
          />
        </Card.Content>
      </Card>

      {/* Transport */}
      {(ads.outbound_transport_mode || ads.return_transport_mode) && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionTitle}>
              Transport
            </Text>
            {ads.outbound_transport_mode && (
              <List.Item
                title="Aller"
                description={`${TRANSPORT_LABELS[ads.outbound_transport_mode] ?? ads.outbound_transport_mode}${ads.outbound_departure_base_name ? ` — ${ads.outbound_departure_base_name}` : ""}`}
                left={(props) => <List.Icon {...props} icon="arrow-right" />}
              />
            )}
            {ads.return_transport_mode && (
              <List.Item
                title="Retour"
                description={`${TRANSPORT_LABELS[ads.return_transport_mode] ?? ads.return_transport_mode}${ads.return_departure_base_name ? ` — ${ads.return_departure_base_name}` : ""}`}
                left={(props) => <List.Icon {...props} icon="arrow-left" />}
              />
            )}
          </Card.Content>
        </Card>
      )}

      {/* PAX List */}
      {ads.pax_entries && ads.pax_entries.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionTitle}>
              Personnel ({ads.pax_entries.length})
            </Text>
            {(ads.pax_entries ?? []).map((pax) => (
              <View key={pax.id} style={styles.paxRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={styles.paxName}>
                    {pax.display_name}
                  </Text>
                  {pax.company_name && (
                    <Text variant="bodySmall" style={styles.paxCompany}>
                      {pax.company_name}
                    </Text>
                  )}
                </View>
                <View style={styles.paxRight}>
                  <StatusBadge status={pax.status} />
                  {!pax.compliance_ok && (
                    <Text style={styles.nonCompliant}>Non conforme</Text>
                  )}
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {ads.status === "draft" && canSubmit && (
          <Button
            mode="contained"
            onPress={() => handleAction("submit")}
            loading={acting}
            style={styles.actionButton}
            buttonColor={colors.info}
          >
            Soumettre
          </Button>
        )}
        {(ads.status === "pending_validation" || ads.status === "pending_compliance") && canApprove && (
          <View style={styles.approvalRow}>
            <Button
              mode="contained"
              onPress={() => handleAction("approve")}
              loading={acting}
              style={[styles.actionButton, { flex: 2 }]}
              buttonColor={colors.success}
            >
              Approuver
            </Button>
            <Button
              mode="outlined"
              onPress={() => handleAction("reject")}
              loading={acting}
              style={[styles.actionButton, { flex: 1 }]}
              textColor={colors.danger}
            >
              Rejeter
            </Button>
          </View>
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { borderRadius: 12 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  reference: { fontWeight: "700", color: colors.primary },
  purpose: { color: colors.textPrimary, marginBottom: 8, lineHeight: 22 },
  categoryChip: { alignSelf: "flex-start", marginRight: 8 },
  roundTripChip: { alignSelf: "flex-start", marginTop: 6 },
  sectionTitle: {
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
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
  nonCompliant: { fontSize: 11, color: colors.danger, fontWeight: "600" },
  actions: { marginTop: 4 },
  actionButton: { borderRadius: 10 },
  approvalRow: { flexDirection: "row", gap: 10 },
});
