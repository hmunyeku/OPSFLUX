/**
 * Cargo detail screen — shows tracking info after scanning a colis.
 *
 * Displays:
 *  - Cargo summary (reference, type, status, sender/recipient)
 *  - Tracking timeline
 *  - Compliance check results
 *  - Package elements
 *  - "Confirm reception" action button
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "../utils/colors";
import StatusBadge from "../components/StatusBadge";
import {
  getCargo,
  getCargoComplianceCheck,
  listPackageElements,
  receiveCargo,
} from "../services/packlog";
import type {
  CargoComplianceCheck,
  CargoRead,
  CargoReceiptConfirm,
  CargoTrackingRead,
  PackageElement,
} from "../types/api";
import { downloadAndOpenPdf } from "../services/pdf";
import AttachmentsSection from "../components/AttachmentsSection";

interface Props {
  route: {
    params: {
      tracking: CargoTrackingRead;
      trackingCode: string;
      /** If navigated from an authenticated cargo list, we get the full cargo. */
      cargo?: CargoRead;
    };
  };
  navigation: any;
}

export default function CargoDetailScreen({ route, navigation }: Props) {
  const { tracking, trackingCode } = route.params;
  const [cargo, setCargo] = useState<CargoRead | null>(
    route.params.cargo ?? null
  );
  const [compliance, setCompliance] = useState<CargoComplianceCheck | null>(
    null
  );
  const [elements, setElements] = useState<PackageElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingLt, setDownloadingLt] = useState(false);
  const [receiving, setReceiving] = useState(false);

  // Load full cargo detail + compliance if we have auth
  useEffect(() => {
    if (cargo) {
      loadDetails(cargo.id);
    }
  }, [cargo?.id]);

  async function loadDetails(cargoId: string) {
    try {
      const [complianceRes, elementsRes] = await Promise.all([
        getCargoComplianceCheck(cargoId).catch(() => null),
        listPackageElements(cargoId).catch(() => []),
      ]);
      if (complianceRes) setCompliance(complianceRes);
      setElements(elementsRes);
    } catch {
      // Non-critical — just show what we have
    }
  }

  const handleReceive = useCallback(async () => {
    if (!cargo) {
      Alert.alert("Info", "Connectez-vous pour confirmer la réception.");
      return;
    }

    Alert.alert(
      "Confirmer réception",
      `Confirmez-vous la réception du colis ${tracking.reference} ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "État: Bon",
          onPress: () => confirmReceive({ recipient_available: true, signature_collected: true }),
        },
        {
          text: "État: Endommagé",
          style: "destructive",
          onPress: () =>
            confirmReceive({
              recipient_available: true,
              signature_collected: true,
              damage_notes: "Colis endommagé — état constaté à la réception",
            }),
        },
      ]
    );
  }, [cargo, tracking.reference]);

  async function confirmReceive(body: CargoReceiptConfirm) {
    if (!cargo) return;
    setReceiving(true);
    try {
      const updated = await receiveCargo(cargo.id, body);
      setCargo(updated);
      Alert.alert("Succès", "Réception confirmée.");
    } catch (err: any) {
      Alert.alert(
        "Erreur",
        err?.response?.data?.detail || "Impossible de confirmer la réception."
      );
    } finally {
      setReceiving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Cargo header */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.reference}>{tracking.reference}</Text>
          <StatusBadge status={tracking.status} size="md" />
        </View>

        {tracking.cargo_type && (
          <Text style={styles.cargoType}>
            Type: {tracking.cargo_type}
          </Text>
        )}

        {tracking.description && (
          <Text style={styles.description}>{tracking.description}</Text>
        )}

        <View style={styles.infoGrid}>
          {tracking.sender_name && (
            <InfoRow label="Expéditeur" value={tracking.sender_name} />
          )}
          {tracking.recipient_name && (
            <InfoRow label="Destinataire" value={tracking.recipient_name} />
          )}
          {tracking.origin_name && (
            <InfoRow label="Origine" value={tracking.origin_name} />
          )}
          {tracking.destination_name && (
            <InfoRow label="Destination" value={tracking.destination_name} />
          )}
        </View>
      </View>

      {/* Compliance check */}
      {compliance && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Conformité</Text>
          <StatusBadge
            status={compliance.overall_status}
            size="md"
          />
          {(compliance.checks ?? []).map((check, i) => (
            <View key={i} style={styles.checkRow}>
              <View
                style={[
                  styles.checkDot,
                  {
                    backgroundColor:
                      check.status === "pass"
                        ? colors.success
                        : check.status === "fail"
                        ? colors.danger
                        : colors.warning,
                  },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.checkRule}>{check.rule}</Text>
                {check.message && (
                  <Text style={styles.checkMessage}>{check.message}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Tracking timeline */}
      {tracking.events && tracking.events.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Suivi</Text>
          {(tracking.events ?? []).map((event, i) => (
            <View key={i} style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              {i < (tracking.events?.length ?? 0) - 1 && (
                <View style={styles.timelineLine} />
              )}
              <View style={styles.timelineContent}>
                <Text style={styles.timelineStatus}>{event.status}</Text>
                {event.location && (
                  <Text style={styles.timelineLocation}>{event.location}</Text>
                )}
                {event.notes && (
                  <Text style={styles.timelineNotes}>{event.notes}</Text>
                )}
                <Text style={styles.timelineDate}>
                  {new Date(event.timestamp).toLocaleString("fr-FR")}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Package elements */}
      {elements.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Contenu ({elements.length} élément{elements.length > 1 ? "s" : ""})
          </Text>
          {elements.map((el) => (
            <View key={el.id} style={styles.elementRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.elementDesc}>{el.description}</Text>
                <Text style={styles.elementMeta}>
                  Qté: {el.quantity}
                  {el.weight_kg ? ` — ${el.weight_kg} kg` : ""}
                  {el.sap_code ? ` — SAP: ${el.sap_code}` : ""}
                </Text>
              </View>
              {el.return_status && (
                <StatusBadge status={el.return_status} />
              )}
            </View>
          ))}
        </View>
      )}

      {/* LT (Lettre de transport) PDF download */}
      {cargo?.request_id && (
        <Pressable
          style={styles.pdfButton}
          disabled={downloadingLt}
          onPress={async () => {
            setDownloadingLt(true);
            const result = await downloadAndOpenPdf(
              `/api/v1/travelwiz/cargo-requests/${cargo.request_id}/pdf/lt`,
              `LT_${cargo.reference}`
            );
            setDownloadingLt(false);
            if (!result.ok) {
              Alert.alert(
                "Erreur",
                "Téléchargement de la lettre de transport impossible."
              );
            }
          }}
        >
          {downloadingLt ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.pdfButtonText}>
              📄 Télécharger la lettre de transport
            </Text>
          )}
        </Pressable>
      )}

      {/* Pièces jointes */}
      {cargo?.id && (
        <View style={{ marginTop: 12 }}>
          <AttachmentsSection ownerType="cargo_item" ownerId={cargo.id} />
        </View>
      )}

      {/* Receive button — navigates to full reception workflow */}
      {cargo &&
        !["received", "delivered_final", "returned"].includes(
          cargo.status
        ) && (
          <Pressable
            style={styles.receiveButton}
            onPress={() =>
              navigation.navigate("CargoReception", { cargo })
            }
          >
            <Text style={styles.receiveButtonText}>
              Confirmer la réception
            </Text>
          </Pressable>
        )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 14,
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  reference: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
  },
  cargoType: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  infoGrid: {
    gap: 6,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
    marginLeft: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 12,
  },
  // Compliance
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
    gap: 10,
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  checkRule: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  checkMessage: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  // Timeline
  timelineItem: {
    flexDirection: "row",
    marginBottom: 2,
    minHeight: 50,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 4,
    marginRight: 12,
    zIndex: 1,
  },
  timelineLine: {
    position: "absolute",
    left: 4,
    top: 14,
    bottom: -2,
    width: 2,
    backgroundColor: colors.border,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 14,
  },
  timelineStatus: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  timelineLocation: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  timelineNotes: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 1,
  },
  timelineDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Elements
  elementRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  elementDesc: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  elementMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // PDF button (outline secondary)
  pdfButton: {
    backgroundColor: colors.surface ?? "#fff",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  pdfButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  // Receive button
  receiveButton: {
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  receiveButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "700",
  },
});
