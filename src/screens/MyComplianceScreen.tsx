/**
 * My Compliance Screen — personal credentials, documents, compliance status.
 *
 * Shows:
 *  - Overall compliance status (OK / issues / expired)
 *  - List of credentials with expiry dates and status
 *  - Alerts for expiring/expired documents
 *  - Quick action to upload/renew a credential
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
  ProgressBar,
  Surface,
  Text,
} from "react-native-paper";
import { useTranslation } from "react-i18next";
import StatusBadge from "../components/StatusBadge";
import { api } from "../services/api";
import { useAuthStore } from "../stores/auth";
import { colors } from "../utils/colors";

interface Credential {
  id: string;
  credential_type_name: string;
  credential_type_category: string;
  status: "valid" | "expired" | "pending" | "pending_validation" | "rejected";
  obtained_date: string | null;
  expiry_date: string | null;
  document_reference: string | null;
  days_until_expiry: number | null;
}

interface ComplianceStats {
  total: number;
  valid: number;
  expired: number;
  pending: number;
  expiring_soon: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  safety: "shield-check",
  medical: "heart-pulse",
  technical: "wrench",
  administrative: "file-document",
  training: "school",
};

export default function MyComplianceScreen({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.userId);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await api.get(`/api/v1/paxlog/profiles/${userId}/credentials`);
      const items = Array.isArray(data) ? data : data?.items ?? [];
      // Enrich with days until expiry
      const enriched = items.map((c: any) => ({
        ...c,
        days_until_expiry: c.expiry_date
          ? Math.ceil((new Date(c.expiry_date).getTime() - Date.now()) / 86_400_000)
          : null,
      }));
      setCredentials(enriched);
    } catch {
      // May not have permissions
    } finally {
      setLoading(false);
    }
  }, [userId]);

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

  // Compute stats
  const stats: ComplianceStats = {
    total: credentials.length,
    valid: credentials.filter((c) => c.status === "valid").length,
    expired: credentials.filter((c) => c.status === "expired").length,
    pending: credentials.filter((c) => c.status === "pending" || c.status === "pending_validation").length,
    expiring_soon: credentials.filter(
      (c) => c.days_until_expiry !== null && c.days_until_expiry > 0 && c.days_until_expiry <= 30
    ).length,
  };

  const complianceRate = stats.total > 0 ? stats.valid / stats.total : 0;
  const overallStatus =
    stats.expired > 0
      ? "danger"
      : stats.expiring_soon > 0
      ? "warning"
      : "ok";

  // Sort: expired first, then expiring soon, then pending, then valid
  const sorted = [...credentials].sort((a, b) => {
    const order = { expired: 0, pending: 1, pending_validation: 1, rejected: 2, valid: 3 };
    const oa = order[a.status] ?? 4;
    const ob = order[b.status] ?? 4;
    if (oa !== ob) return oa - ob;
    if (a.days_until_expiry !== null && b.days_until_expiry !== null) {
      return a.days_until_expiry - b.days_until_expiry;
    }
    return 0;
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Overall status card */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.statusHeader}>
            <Text variant="titleLarge" style={styles.statusTitle}>
              Ma conformité
            </Text>
            <Chip
              compact
              style={{
                backgroundColor:
                  overallStatus === "ok"
                    ? colors.success + "20"
                    : overallStatus === "warning"
                    ? colors.warning + "20"
                    : colors.danger + "20",
              }}
              textStyle={{
                color:
                  overallStatus === "ok"
                    ? colors.success
                    : overallStatus === "warning"
                    ? colors.warning
                    : colors.danger,
                fontWeight: "700",
              }}
            >
              {overallStatus === "ok"
                ? "Conforme"
                : overallStatus === "warning"
                ? "Attention"
                : "Non conforme"}
            </Chip>
          </View>

          <ProgressBar
            progress={complianceRate}
            color={
              overallStatus === "ok"
                ? colors.success
                : overallStatus === "warning"
                ? colors.warning
                : colors.danger
            }
            style={styles.progressBar}
          />

          <View style={styles.statsRow}>
            <StatBox label="Valides" value={stats.valid} color={colors.success} />
            <StatBox label="Expirants" value={stats.expiring_soon} color={colors.warning} />
            <StatBox label="Expirés" value={stats.expired} color={colors.danger} />
            <StatBox label="En attente" value={stats.pending} color={colors.info} />
          </View>
        </Card.Content>
      </Card>

      {/* Alerts */}
      {stats.expired > 0 && (
        <Surface style={styles.alertBanner} elevation={1}>
          <Text variant="bodyMedium" style={styles.alertText}>
            {stats.expired} document(s) expiré(s) — veuillez les renouveler rapidement.
          </Text>
        </Surface>
      )}
      {stats.expiring_soon > 0 && stats.expired === 0 && (
        <Surface style={styles.warningBanner} elevation={1}>
          <Text variant="bodyMedium" style={styles.warningText}>
            {stats.expiring_soon} document(s) expire(nt) dans les 30 prochains jours.
          </Text>
        </Surface>
      )}

      {/* Credential list */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Mes documents ({credentials.length})
          </Text>
          {sorted.map((cred) => (
            <View key={cred.id} style={styles.credRow}>
              <List.Icon
                icon={CATEGORY_ICONS[cred.credential_type_category] ?? "file-document"}
                color={
                  cred.status === "valid"
                    ? colors.success
                    : cred.status === "expired"
                    ? colors.danger
                    : colors.warning
                }
              />
              <View style={styles.credInfo}>
                <Text variant="bodyMedium" style={styles.credName}>
                  {cred.credential_type_name}
                </Text>
                {cred.expiry_date && (
                  <Text
                    variant="bodySmall"
                    style={[
                      styles.credExpiry,
                      cred.days_until_expiry !== null && cred.days_until_expiry <= 0
                        ? { color: colors.danger }
                        : cred.days_until_expiry !== null && cred.days_until_expiry <= 30
                        ? { color: colors.warning }
                        : {},
                    ]}
                  >
                    {cred.days_until_expiry !== null && cred.days_until_expiry <= 0
                      ? `Expiré depuis ${Math.abs(cred.days_until_expiry)}j`
                      : cred.days_until_expiry !== null && cred.days_until_expiry <= 30
                      ? `Expire dans ${cred.days_until_expiry}j`
                      : `Expire le ${new Date(cred.expiry_date).toLocaleDateString("fr-FR")}`}
                  </Text>
                )}
                {cred.document_reference && (
                  <Text variant="bodySmall" style={styles.credRef}>
                    Réf: {cred.document_reference}
                  </Text>
                )}
              </View>
              <StatusBadge status={cred.status} />
            </View>
          ))}

          {credentials.length === 0 && (
            <Text style={styles.emptyText}>
              Aucun document enregistré.
            </Text>
          )}
        </Card.Content>
      </Card>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text variant="headlineSmall" style={[styles.statValue, { color }]}>
        {value}
      </Text>
      <Text variant="bodySmall" style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { borderRadius: 12 },
  statusHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  statusTitle: { fontWeight: "700", color: colors.textPrimary },
  progressBar: { height: 8, borderRadius: 4, marginBottom: 16 },
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  statBox: { alignItems: "center" },
  statValue: { fontWeight: "700" },
  statLabel: { color: colors.textSecondary, marginTop: 2 },
  alertBanner: {
    backgroundColor: colors.danger + "10",
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
  },
  alertText: { color: colors.danger, fontWeight: "600" },
  warningBanner: {
    backgroundColor: colors.warning + "10",
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  warningText: { color: colors.warning, fontWeight: "600" },
  sectionTitle: {
    fontWeight: "700", color: colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10,
  },
  credRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  credInfo: { flex: 1, marginLeft: 4 },
  credName: { fontWeight: "600", color: colors.textPrimary },
  credExpiry: { color: colors.textSecondary, marginTop: 1 },
  credRef: { color: colors.textMuted, marginTop: 1, fontFamily: "monospace", fontSize: 11 },
  emptyText: { color: colors.textMuted, fontStyle: "italic", textAlign: "center", marginTop: 16 },
});
