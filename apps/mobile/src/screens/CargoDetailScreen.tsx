/**
 * Cargo detail screen — full Gluestack rewrite.
 *
 * Sections:
 *  - Header: reference + status + hazmat badge + cargo type
 *  - Description (if present)
 *  - Identification card: tracking code + LT reference + created date
 *  - Logistics card: sender → recipient + origin → destination + weight
 *  - Compliance card: overall status + per-rule check rows
 *  - Tracking timeline (icon dots + status / location / notes / date)
 *  - Package contents (each element with status badge)
 *  - Attachments (photos + files)
 *  - Actions: Download LT PDF, Receive
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Divider,
  Heading,
  HStack,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon, type MIconName } from "../components/MIcon";
import StatusBadge from "../components/StatusBadge";
import AttachmentsSection from "../components/AttachmentsSection";
import {
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
import { colors } from "../utils/colors";

interface Props {
  route: {
    params: {
      tracking: CargoTrackingRead;
      trackingCode: string;
      cargo?: CargoRead;
    };
  };
  navigation: any;
}

export default function CargoDetailScreen({ route, navigation }: Props) {
  const { tracking, trackingCode } = route.params;
  const insets = useSafeAreaInsets();
  const [cargo, setCargo] = useState<CargoRead | null>(
    route.params.cargo ?? null
  );
  const [compliance, setCompliance] = useState<CargoComplianceCheck | null>(
    null
  );
  const [elements, setElements] = useState<PackageElement[]>([]);
  const [downloadingLt, setDownloadingLt] = useState(false);
  const [receiving, setReceiving] = useState(false);

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
      /* non-critical */
    }
  }

  const handleReceive = useCallback(() => {
    if (!cargo) {
      Alert.alert("Info", "Connectez-vous pour confirmer la réception.");
      return;
    }
    // Route the user through the dedicated reception workflow
    // (signature, photos, condition assessment).
    navigation.navigate("CargoReception", { cargo });
  }, [cargo, navigation]);

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <Box flex={1} bg="$backgroundLight50">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 14,
          paddingBottom: insets.bottom + 32,
          gap: 12,
        }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$3" style={styles.shadow}>
          <HStack justifyContent="space-between" alignItems="center" mb="$2">
            <Heading size="lg" color="$primary700" flex={1} numberOfLines={1}>
              {tracking.reference}
            </Heading>
            <StatusBadge status={tracking.status} size="md" />
          </HStack>
          <HStack space="xs" alignItems="center" flexWrap="wrap">
            {tracking.cargo_type && (
              <Badge action="muted" variant="solid" size="sm">
                <MIcon name="inventory-2" size="2xs" color="$textLight700" mr="$1" />
                <BadgeText>{tracking.cargo_type}</BadgeText>
              </Badge>
            )}
            {cargo?.hazmat && (
              <Badge action="error" variant="solid" size="sm">
                <MIcon name="warning" size="2xs" color="$white" mr="$1" />
                <BadgeText>HAZMAT</BadgeText>
              </Badge>
            )}
            {cargo?.weight_kg != null && (
              <Badge action="info" variant="solid" size="sm">
                <MIcon name="scale" size="2xs" color="$white" mr="$1" />
                <BadgeText>{cargo.weight_kg} kg</BadgeText>
              </Badge>
            )}
          </HStack>
          {tracking.description && (
            <Text size="sm" color="$textLight900" mt="$3" lineHeight={20}>
              {tracking.description}
            </Text>
          )}
        </Box>

        {/* ── Identification ──────────────────────────────────────── */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$3" style={styles.shadow}>
          <SectionTitle icon="badge" label="Identification" />
          {cargo?.tracking_code && (
            <DetailRow
              icon="qr-code"
              label="Code de suivi"
              value={cargo.tracking_code}
            />
          )}
          {!cargo?.tracking_code && trackingCode && (
            <DetailRow icon="qr-code" label="Code de suivi" value={trackingCode} />
          )}
          {cargo?.request_id && (
            <>
              <Divider my="$1" />
              <DetailRow
                icon="description"
                label="Lettre de transport"
                value={`#${cargo.request_id.slice(0, 8)}`}
              />
            </>
          )}
          {cargo?.created_at && (
            <>
              <Divider my="$1" />
              <DetailRow
                icon="event"
                label="Créé le"
                value={formatDate(cargo.created_at) ?? cargo.created_at}
              />
            </>
          )}
          {cargo?.received_at && (
            <>
              <Divider my="$1" />
              <DetailRow
                icon="check-circle"
                label="Reçu le"
                value={
                  (formatDate(cargo.received_at) ?? cargo.received_at) +
                  (cargo.received_by_name ? ` · ${cargo.received_by_name}` : "")
                }
              />
            </>
          )}
        </Box>

        {/* ── Logistics ───────────────────────────────────────────── */}
        {(tracking.sender_name ||
          tracking.recipient_name ||
          tracking.origin_name ||
          tracking.destination_name) && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$3" style={styles.shadow}>
            <SectionTitle icon="local-shipping" label="Logistique" />
            {(tracking.sender_name || tracking.recipient_name) && (
              <DetailRow
                icon="swap-horiz"
                label="Expéditeur → Destinataire"
                value={`${tracking.sender_name ?? "—"}  →  ${tracking.recipient_name ?? "—"}`}
              />
            )}
            {tracking.origin_name && (
              <>
                <Divider my="$1" />
                <DetailRow
                  icon="flight-takeoff"
                  label="Origine"
                  value={tracking.origin_name}
                />
              </>
            )}
            {tracking.destination_name && (
              <>
                <Divider my="$1" />
                <DetailRow
                  icon="flight-land"
                  label="Destination"
                  value={tracking.destination_name}
                />
              </>
            )}
          </Box>
        )}

        {/* ── Dimensions & colisage ───────────────────────────────── */}
        {(cargo?.length_cm != null ||
          cargo?.width_cm != null ||
          cargo?.height_cm != null ||
          cargo?.surface_m2 != null ||
          (cargo?.package_count != null && cargo.package_count > 1) ||
          cargo?.stackable != null) && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$3" style={styles.shadow}>
            <SectionTitle icon="straighten" label="Dimensions" />
            {(cargo.length_cm != null ||
              cargo.width_cm != null ||
              cargo.height_cm != null) && (
              <DetailRow
                icon="aspect-ratio"
                label="L × l × h (cm)"
                value={`${cargo.length_cm ?? "—"} × ${cargo.width_cm ?? "—"} × ${cargo.height_cm ?? "—"}`}
              />
            )}
            {cargo.surface_m2 != null && (
              <>
                <Divider my="$1" />
                <DetailRow
                  icon="crop-square"
                  label="Surface"
                  value={`${cargo.surface_m2} m²`}
                />
              </>
            )}
            {cargo.package_count != null && cargo.package_count > 0 && (
              <>
                <Divider my="$1" />
                <DetailRow
                  icon="inventory"
                  label="Nombre de colis"
                  value={String(cargo.package_count)}
                />
              </>
            )}
            {cargo.stackable != null && (
              <>
                <Divider my="$1" />
                <HStack space="sm" alignItems="center" py="$1">
                  <MIcon
                    name={cargo.stackable ? "layers" : "layers-clear"}
                    size="xs"
                    color={cargo.stackable ? "$success600" : "$warning600"}
                  />
                  <Text size="xs" color="$textLight500" flex={1}>
                    Gerbable
                  </Text>
                  <Text
                    size="xs"
                    fontWeight="$semibold"
                    color={cargo.stackable ? "$success700" : "$warning700"}
                  >
                    {cargo.stackable ? "Oui" : "Non"}
                  </Text>
                </HStack>
              </>
            )}
          </Box>
        )}

        {/* ── Ramassage / Pickup ──────────────────────────────────── */}
        {(cargo?.pickup_location_label ||
          cargo?.pickup_contact_display_name ||
          cargo?.pickup_contact_phone ||
          cargo?.requester_name) && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$3" style={styles.shadow}>
            <SectionTitle icon="where-to-vote" label="Ramassage" />
            {cargo.pickup_location_label && (
              <DetailRow
                icon="place"
                label="Lieu"
                value={cargo.pickup_location_label}
              />
            )}
            {(cargo.pickup_latitude != null ||
              cargo.pickup_longitude != null) && (
              <>
                {cargo.pickup_location_label && <Divider my="$1" />}
                <DetailRow
                  icon="my-location"
                  label="Coordonnées"
                  value={`${cargo.pickup_latitude?.toFixed(5) ?? "—"}, ${cargo.pickup_longitude?.toFixed(5) ?? "—"}`}
                />
              </>
            )}
            {cargo.pickup_contact_display_name && (
              <>
                <Divider my="$1" />
                <DetailRow
                  icon="person"
                  label="Contact"
                  value={cargo.pickup_contact_display_name}
                />
              </>
            )}
            {cargo.pickup_contact_phone && (
              <>
                <Divider my="$1" />
                <DetailRow
                  icon="phone"
                  label="Téléphone"
                  value={cargo.pickup_contact_phone}
                />
              </>
            )}
            {cargo.requester_name && (
              <>
                <Divider my="$1" />
                <DetailRow
                  icon="badge"
                  label="Demandeur"
                  value={cargo.requester_name}
                />
              </>
            )}
          </Box>
        )}

        {/* ── Imputation / Référencement ──────────────────────────── */}
        {(cargo?.imputation_reference_code ||
          cargo?.imputation_reference_name ||
          cargo?.sap_article_code ||
          cargo?.request_code ||
          cargo?.planned_zone_name) && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$3" style={styles.shadow}>
            <SectionTitle icon="assignment-turned-in" label="Référencement" />
            {cargo.imputation_reference_code && (
              <DetailRow
                icon="qr-code-2"
                label="Imputation"
                value={`${cargo.imputation_reference_code}${cargo.imputation_reference_name ? ` · ${cargo.imputation_reference_name}` : ""}`}
              />
            )}
            {cargo.sap_article_code && (
              <>
                {cargo.imputation_reference_code && <Divider my="$1" />}
                <DetailRow
                  icon="tag"
                  label="Code SAP"
                  value={cargo.sap_article_code}
                />
              </>
            )}
            {cargo.request_code && (
              <>
                <Divider my="$1" />
                <DetailRow
                  icon="description"
                  label="Demande"
                  value={
                    cargo.request_title
                      ? `${cargo.request_code} · ${cargo.request_title}`
                      : cargo.request_code
                  }
                />
              </>
            )}
            {cargo.planned_zone_name && (
              <>
                <Divider my="$1" />
                <DetailRow
                  icon="grid-view"
                  label="Zone planifiée"
                  value={cargo.planned_zone_name}
                />
              </>
            )}
          </Box>
        )}

        {/* ── Preuves & validation ────────────────────────────────── */}
        {(cargo?.lifting_provider ||
          cargo?.lifting_points_certified != null ||
          cargo?.weight_ticket_provided != null ||
          cargo?.hazmat_validated != null ||
          cargo?.damage_notes) && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$3" style={styles.shadow}>
            <SectionTitle icon="verified" label="Preuves & validation" />
            {cargo.lifting_provider && (
              <DetailRow
                icon="construction"
                label="Prestataire levage"
                value={cargo.lifting_provider}
              />
            )}
            {cargo.lifting_points_certified != null && (
              <>
                {cargo.lifting_provider && <Divider my="$1" />}
                <HStack space="sm" alignItems="center" py="$1">
                  <MIcon
                    name={cargo.lifting_points_certified ? "check-circle" : "error"}
                    size="xs"
                    color={cargo.lifting_points_certified ? "$success600" : "$warning600"}
                  />
                  <Text size="xs" color="$textLight500" flex={1}>
                    Points de levage certifiés
                  </Text>
                  <Text
                    size="xs"
                    fontWeight="$semibold"
                    color={cargo.lifting_points_certified ? "$success700" : "$warning700"}
                  >
                    {cargo.lifting_points_certified ? "Oui" : "Non"}
                  </Text>
                </HStack>
              </>
            )}
            {cargo.weight_ticket_provided != null && (
              <>
                <Divider my="$1" />
                <HStack space="sm" alignItems="center" py="$1">
                  <MIcon
                    name={cargo.weight_ticket_provided ? "receipt" : "receipt-long"}
                    size="xs"
                    color={cargo.weight_ticket_provided ? "$success600" : "$textLight400"}
                  />
                  <Text size="xs" color="$textLight500" flex={1}>
                    Ticket de pesée
                  </Text>
                  <Text
                    size="xs"
                    fontWeight="$semibold"
                    color={cargo.weight_ticket_provided ? "$success700" : "$textLight500"}
                  >
                    {cargo.weight_ticket_provided ? "Fourni" : "Non fourni"}
                  </Text>
                </HStack>
              </>
            )}
            {cargo.hazmat && cargo.hazmat_validated != null && (
              <>
                <Divider my="$1" />
                <HStack space="sm" alignItems="center" py="$1">
                  <MIcon
                    name={cargo.hazmat_validated ? "verified" : "warning"}
                    size="xs"
                    color={cargo.hazmat_validated ? "$success600" : "$error600"}
                  />
                  <Text size="xs" color="$textLight500" flex={1}>
                    HAZMAT validé
                  </Text>
                  <Text
                    size="xs"
                    fontWeight="$semibold"
                    color={cargo.hazmat_validated ? "$success700" : "$error700"}
                  >
                    {cargo.hazmat_validated ? "Oui" : "Non"}
                  </Text>
                </HStack>
              </>
            )}
            {cargo.damage_notes && (
              <>
                <Divider my="$1" />
                <VStack py="$1">
                  <HStack space="sm" alignItems="center">
                    <MIcon name="report-problem" size="xs" color="$error600" />
                    <Text size="xs" color="$error600" fontWeight="$semibold">
                      Notes de dommage
                    </Text>
                  </HStack>
                  <Text size="xs" color="$textLight900" mt="$1" ml="$5">
                    {cargo.damage_notes}
                  </Text>
                </VStack>
              </>
            )}
          </Box>
        )}

        {/* ── Compliance ──────────────────────────────────────────── */}
        {compliance && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$3" style={styles.shadow}>
            <HStack justifyContent="space-between" alignItems="center" mb="$3">
              <SectionTitle icon="verified" label="Conformité" inline />
              <StatusBadge status={compliance.overall_status} size="md" />
            </HStack>
            {(compliance.checks ?? []).map((check, i) => (
              <View key={i}>
                {i > 0 && <Divider my="$1" />}
                <HStack space="sm" alignItems="flex-start">
                  <Box
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
                  <VStack flex={1}>
                    <Text size="sm" fontWeight="$semibold" color="$textLight900">
                      {check.rule}
                    </Text>
                    {check.message && (
                      <Text size="xs" color="$textLight500" mt="$0.5">
                        {check.message}
                      </Text>
                    )}
                  </VStack>
                </HStack>
              </View>
            ))}
          </Box>
        )}

        {/* ── Timeline ────────────────────────────────────────────── */}
        {tracking.events && tracking.events.length > 0 && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$3" style={styles.shadow}>
            <SectionTitle icon="timeline" label="Suivi" />
            {tracking.events.map((event, i) => (
              <View key={i} style={styles.timelineRow}>
                <View style={styles.timelineDot} />
                {i < (tracking.events?.length ?? 0) - 1 && (
                  <View style={styles.timelineLine} />
                )}
                <VStack flex={1} pb="$3" pl="$3">
                  <Text size="sm" fontWeight="$semibold" color="$textLight900">
                    {event.status}
                  </Text>
                  {event.location && (
                    <Text size="xs" color="$textLight600" mt="$0.5">
                      {event.location}
                    </Text>
                  )}
                  {event.notes && (
                    <Text size="xs" color="$textLight500" italic mt="$0.5">
                      {event.notes}
                    </Text>
                  )}
                  <Text size="2xs" color="$textLight400" mt="$0.5">
                    {formatDate(event.timestamp) ?? event.timestamp}
                  </Text>
                </VStack>
              </View>
            ))}
          </Box>
        )}

        {/* ── Package elements ────────────────────────────────────── */}
        {elements.length > 0 && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$3" style={styles.shadow}>
            <SectionTitle
              icon="list-alt"
              label={`Contenu (${elements.length} élément${elements.length > 1 ? "s" : ""})`}
            />
            {elements.map((el, i) => (
              <View key={el.id}>
                {i > 0 && <Divider my="$1" />}
                <HStack space="sm" alignItems="center">
                  <VStack flex={1}>
                    <Text size="sm" fontWeight="$medium" color="$textLight900">
                      {el.description}
                    </Text>
                    <Text size="xs" color="$textLight500" mt="$0.5">
                      Qté: {el.quantity}
                      {el.weight_kg ? ` · ${el.weight_kg} kg` : ""}
                      {el.sap_code ? ` · SAP: ${el.sap_code}` : ""}
                    </Text>
                  </VStack>
                  {el.return_status && <StatusBadge status={el.return_status} />}
                </HStack>
              </View>
            ))}
          </Box>
        )}

        {/* ── Attachments ─────────────────────────────────────────── */}
        {cargo?.id && (
          <AttachmentsSection ownerType="cargo_item" ownerId={cargo.id} />
        )}

        {/* ── Actions ─────────────────────────────────────────────── */}
        <VStack space="sm">
          {cargo?.request_id && (
            <Button
              size="lg"
              variant="outline"
              action="secondary"
              isDisabled={downloadingLt}
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
                <ButtonSpinner mr="$2" />
              ) : (
                <MIcon name="picture-as-pdf" size="sm" color="$primary700" mr="$2" />
              )}
              <ButtonText>Télécharger la lettre de transport</ButtonText>
            </Button>
          )}

          {cargo &&
            !["received", "delivered_final", "returned"].includes(cargo.status) && (
              <Button
                size="lg"
                action="positive"
                bg="$success600"
                $active-bg="$success700"
                onPress={handleReceive}
                isDisabled={receiving}
              >
                {receiving ? (
                  <ButtonSpinner mr="$2" color="$white" />
                ) : (
                  <MIcon name="check" size="md" color="$white" mr="$2" />
                )}
                <ButtonText color="$white">Confirmer la réception</ButtonText>
              </Button>
            )}
        </VStack>
      </ScrollView>
    </Box>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function SectionTitle({
  icon,
  label,
  inline = false,
}: {
  icon: MIconName;
  label: string;
  inline?: boolean;
}) {
  return (
    <HStack alignItems="center" space="sm" mb={inline ? "$0" : "$3"}>
      <MIcon name={icon} size="sm" color="$textLight600" />
      <Heading
        size="xs"
        color="$textLight500"
        textTransform="uppercase"
        letterSpacing={0.5}
      >
        {label}
      </Heading>
    </HStack>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: MIconName;
  label: string;
  value: string;
}) {
  return (
    <HStack space="sm" alignItems="center" py="$1">
      <MIcon name={icon} size="xs" color="$textLight500" />
      <Text size="xs" color="$textLight500" minWidth={110}>
        {label}
      </Text>
      <Text
        size="xs"
        fontWeight="$semibold"
        color="$textLight900"
        flex={1}
        textAlign="right"
        numberOfLines={2}
      >
        {value}
      </Text>
    </HStack>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  timelineRow: {
    flexDirection: "row",
    minHeight: 50,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginTop: 4,
    zIndex: 1,
  },
  timelineLine: {
    position: "absolute",
    left: 5,
    top: 16,
    bottom: -2,
    width: 2,
    backgroundColor: colors.border,
  },
});
