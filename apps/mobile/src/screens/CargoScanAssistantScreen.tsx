/**
 * CargoScanAssistantScreen — opens after the scanner identifies a cargo QR.
 *
 * Flow:
 *   1. Capture GPS position via expo-location (quick, 5s timeout, cached ok)
 *   2. POST /cargo/{id}/scan with {lat, lon, accuracy_m, scanned_at}
 *   3. Backend returns a match suggestion (nearest installation within
 *      the configured radius) + an optional status transition suggestion
 *   4. User confirms / corrects (picks another installation) / skips
 *   5. If user has permission AND confirms status change, we fire a
 *      second POST /scan/confirm that commits the transition
 *
 * Yango-style UX: big cargo summary card, map-optional, one primary
 * action. Designed to work on Android with one hand while wearing
 * gloves (handheld scanning ops).
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Heading,
  HStack,
  Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { useTranslation } from "react-i18next";
import { MIcon } from "../components/MIcon";
import { useToast } from "../components/Toast";
import {
  scanCargo,
  confirmCargoScan,
  type CargoScanResult,
  type ScanMatchedLocation,
} from "../services/packlog";
import * as Application from "expo-application";

interface Props {
  navigation: any;
  route: {
    params: {
      cargoId: string;
      trackingCode?: string;
    };
  };
}

/** Status transition options keyed by the current status.
 *
 *  Mirrors `packlog_scan_service._ALLOWED_STATUS_SUGGESTIONS` plus a
 *  couple of safe manual transitions the operator can always trigger.
 */
const STATUS_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  registered: [
    { value: "in_transit", label: "En transit" },
    { value: "loaded", label: "Chargé" },
  ],
  ready: [
    { value: "in_transit", label: "En transit" },
    { value: "loaded", label: "Chargé" },
  ],
  loaded: [
    { value: "in_transit", label: "En transit" },
    { value: "delivered_final", label: "Livré" },
  ],
  in_transit: [
    { value: "delivered_intermediate", label: "Arrivé (intermédiaire)" },
    { value: "delivered_final", label: "Livré" },
  ],
  delivered_intermediate: [
    { value: "in_transit", label: "En transit" },
    { value: "delivered_final", label: "Livré" },
  ],
};

const STATUS_LABELS: Record<string, string> = {
  registered: "Enregistré",
  ready: "Prêt",
  loaded: "Chargé",
  in_transit: "En transit",
  delivered_intermediate: "Arrivé (intermédiaire)",
  delivered_final: "Livré",
  damaged: "Endommagé",
  missing: "Manquant",
};

export default function CargoScanAssistantScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const { cargoId, trackingCode } = route.params;

  const [scanResult, setScanResult] = useState<CargoScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] =
    useState<ScanMatchedLocation | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ── 1. GPS ─────────────────────────────────────────────
      const perm = await Location.getForegroundPermissionsAsync();
      let finalPerm = perm;
      if (!perm.granted) {
        finalPerm = await Location.requestForegroundPermissionsAsync();
      }
      if (!finalPerm.granted) {
        throw new Error(
          t(
            "scan.gpsDenied",
            "Autorisation GPS refusée. Le scan nécessite la position pour détecter la localisation du colis."
          )
        );
      }

      // 5s timeout on the GPS fix; we'd rather scan fast with 50m
      // accuracy than wait forever for a 3m one.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // ── 2. Call backend ───────────────────────────────────
      const result = await scanCargo(cargoId, {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy_m: position.coords.accuracy ?? undefined,
        scanned_at: new Date(position.timestamp).toISOString(),
        device_id:
          Application.applicationId ??
          Application.nativeApplicationVersion ??
          null,
      });

      setScanResult(result);
      setSelectedLocation(result.matched_installation);
      if (result.status_suggestion) {
        setSelectedStatus(result.status_suggestion);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ?? err?.message ?? "Erreur de scan";
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [cargoId, t]);

  useEffect(() => {
    runScan();
  }, [runScan]);

  async function handleConfirm() {
    if (!scanResult) return;
    setSubmitting(true);
    try {
      await confirmCargoScan(cargoId, {
        scan_event_id: scanResult.scan_event_id,
        confirmed_asset_id: selectedLocation?.id ?? null,
        new_status:
          selectedStatus && selectedStatus !== scanResult.status_current
            ? selectedStatus
            : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(
        t("scan.confirmed", "Scan enregistré"),
        "success"
      );
      navigation.goBack();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(
        err?.response?.data?.detail ?? t("scan.confirmError", "Erreur"),
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading view ─────────────────────────────────────────
  if (loading) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center" px="$6">
        <Spinner size="large" color="$primary600" />
        <Text size="sm" color="$textLight500" mt="$4" textAlign="center">
          {t("scan.capturingGps", "Capture de votre position…")}
        </Text>
      </Box>
    );
  }

  if (error || !scanResult) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center" px="$6">
        <MIcon name="error-outline" size="2xl" color="$error500" />
        <Heading size="sm" color="$textLight900" mt="$3" textAlign="center">
          {t("scan.failed", "Scan impossible")}
        </Heading>
        <Text size="sm" color="$textLight500" mt="$2" textAlign="center">
          {error ?? t("scan.unknown", "Erreur inconnue")}
        </Text>
        <VStack space="sm" mt="$5" width="100%">
          <Button action="primary" onPress={runScan}>
            <ButtonText>{t("scan.retry", "Réessayer")}</ButtonText>
          </Button>
          <Button variant="outline" action="secondary" onPress={() => navigation.goBack()}>
            <ButtonText>{t("common.back", "Retour")}</ButtonText>
          </Button>
        </VStack>
      </Box>
    );
  }

  const { cargo, matched_installation, nearby_installations, radius_m } =
    scanResult;
  const hasMatch = matched_installation != null;
  const availableStatuses = STATUS_OPTIONS[cargo.status] ?? [];
  const canUpdate = scanResult.can_update_status && availableStatuses.length > 0;

  return (
    <Box flex={1} bg="$backgroundLight50">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 14,
          paddingBottom: insets.bottom + 16,
          gap: 12,
        }}
      >
        {/* Cargo summary card */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <HStack space="sm" alignItems="center" mb="$2">
            <MIcon name="inventory-2" size="md" color="$primary700" />
            <Heading size="sm" color="$textLight900" flex={1} numberOfLines={1}>
              {cargo.tracking_code}
            </Heading>
            {cargo.hazmat && (
              <Badge action="error" variant="solid" size="sm">
                <MIcon name="warning" size="2xs" color="$white" mr="$1" />
                <BadgeText>HAZMAT</BadgeText>
              </Badge>
            )}
          </HStack>
          {cargo.description && (
            <Text size="sm" color="$textLight700" mb="$1">
              {cargo.description}
            </Text>
          )}
          <HStack space="md" alignItems="center">
            <Text size="xs" color="$textLight500">
              {t("scan.currentStatus", "Statut :")}
            </Text>
            <Badge action="muted" variant="outline" size="sm">
              <BadgeText>
                {STATUS_LABELS[cargo.status] ?? cargo.status}
              </BadgeText>
            </Badge>
          </HStack>
        </Box>

        {/* Location match card */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <HStack space="sm" alignItems="center" mb="$3">
            <MIcon name="place" size="md" color="$primary700" />
            <Heading size="xs" color="$textLight500" textTransform="uppercase">
              {t("scan.locationMatch", "Localisation détectée")}
            </Heading>
          </HStack>

          {hasMatch ? (
            <Box
              bg="$primary50"
              borderWidth={1}
              borderColor="$primary300"
              borderRadius="$md"
              p="$3"
              mb="$2"
            >
              <HStack alignItems="center" space="sm">
                <MIcon name="gps-fixed" size="sm" color="$primary700" />
                <VStack flex={1}>
                  <Text size="sm" fontWeight="$semibold" color="$primary900">
                    {matched_installation!.name}
                  </Text>
                  <Text size="xs" color="$primary800">
                    {t("scan.distanceLabel", "à environ {{d}} m", {
                      d: Math.round(matched_installation!.distance_m),
                    })}
                    {matched_installation!.is_destination &&
                      ` · ${t("scan.isDestination", "destination du colis")}`}
                  </Text>
                </VStack>
                {selectedLocation?.id === matched_installation!.id && (
                  <MIcon name="check-circle" size="md" color="$primary700" />
                )}
              </HStack>
            </Box>
          ) : (
            <Text size="sm" color="$textLight500" italic mb="$3">
              {t(
                "scan.noMatch",
                "Aucune installation connue dans un rayon de {{r}} m.",
                { r: radius_m }
              )}
            </Text>
          )}

          {/* Nearby alternatives — tap to override the match */}
          {nearby_installations.length > 0 && (
            <>
              <Text size="xs" color="$textLight500" mb="$2" mt="$1">
                {t("scan.alternatives", "Ou choisir une autre installation :")}
              </Text>
              <VStack space="xs">
                {nearby_installations.map((loc) => {
                  const selected = selectedLocation?.id === loc.id;
                  return (
                    <Pressable
                      key={loc.id}
                      onPress={() => setSelectedLocation(loc)}
                      bg={selected ? "$primary50" : "$backgroundLight50"}
                      borderWidth={1}
                      borderColor={selected ? "$primary300" : "$borderLight200"}
                      borderRadius="$md"
                      p="$2.5"
                    >
                      <HStack alignItems="center" space="sm">
                        <MIcon
                          name={selected ? "check-circle" : "radio-button-unchecked"}
                          size="sm"
                          color={selected ? "$primary700" : "$textLight400"}
                        />
                        <VStack flex={1}>
                          <Text size="sm" color="$textLight900">
                            {loc.name}
                          </Text>
                          <Text size="2xs" color="$textLight500">
                            {Math.round(loc.distance_m)} m
                          </Text>
                        </VStack>
                      </HStack>
                    </Pressable>
                  );
                })}
              </VStack>
            </>
          )}
        </Box>

        {/* Status change suggestions */}
        {canUpdate && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
            <HStack space="sm" alignItems="center" mb="$3">
              <MIcon name="swap-horiz" size="md" color="$primary700" />
              <Heading size="xs" color="$textLight500" textTransform="uppercase">
                {t("scan.statusUpdate", "Mettre à jour le statut")}
              </Heading>
            </HStack>
            {scanResult.status_suggestion_reason && (
              <Text size="xs" color="$textLight600" mb="$2" italic>
                {scanResult.status_suggestion_reason}
              </Text>
            )}
            <VStack space="xs">
              {availableStatuses.map((opt) => {
                const selected = selectedStatus === opt.value;
                const isSuggested = scanResult.status_suggestion === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() =>
                      setSelectedStatus(selected ? null : opt.value)
                    }
                    bg={selected ? "$primary50" : "$backgroundLight50"}
                    borderWidth={1}
                    borderColor={selected ? "$primary300" : "$borderLight200"}
                    borderRadius="$md"
                    p="$2.5"
                  >
                    <HStack alignItems="center" space="sm">
                      <MIcon
                        name={selected ? "check-circle" : "radio-button-unchecked"}
                        size="sm"
                        color={selected ? "$primary700" : "$textLight400"}
                      />
                      <Text size="sm" flex={1} color="$textLight900">
                        {opt.label}
                      </Text>
                      {isSuggested && !selected && (
                        <Badge action="info" variant="outline" size="sm">
                          <BadgeText>
                            {t("scan.suggested", "Suggéré")}
                          </BadgeText>
                        </Badge>
                      )}
                    </HStack>
                  </Pressable>
                );
              })}
            </VStack>
          </Box>
        )}

        {/* Actions */}
        <VStack space="sm" mt="$2">
          <Button
            size="lg"
            action="primary"
            onPress={handleConfirm}
            isDisabled={submitting}
          >
            {submitting && <ButtonSpinner mr="$2" />}
            <ButtonText>
              {selectedStatus && selectedStatus !== cargo.status
                ? t("scan.confirmAndUpdate", "Confirmer + mettre à jour")
                : t("scan.confirmLocation", "Confirmer la localisation")}
            </ButtonText>
          </Button>
          <Button
            size="md"
            variant="outline"
            action="secondary"
            onPress={() => navigation.goBack()}
            isDisabled={submitting}
          >
            <ButtonText>{t("common.cancel", "Annuler")}</ButtonText>
          </Button>
        </VStack>
      </ScrollView>
    </Box>
  );
}
