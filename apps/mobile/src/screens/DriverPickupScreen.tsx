/**
 * DriverPickupScreen — Gluestack refonte: Yango/CartoGo-style pickup mode.
 *
 * Flow:
 *   1. Driver enters 6-digit rotation code → captain auth endpoint
 *   2. Server returns session token + voyage context
 *   3. Mobile loads manifest, computes distance/ETA per passenger via
 *      driver's current GPS (Haversine), sorts by proximity
 *   4. For each passenger : navigation link (native maps), "Ramassé"
 *      button (POST /captain/{id}/event), "Absent" button
 *   5. GPS beacon runs continuously every 15s
 */

import React, { useCallback, useState } from "react";
import { Alert, FlatList, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Heading,
  HStack,
    Input,
  InputField,
  Progress,
  ProgressFilledTrack,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import * as Location from "expo-location";
import { MIcon } from "../components/MIcon";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import { startTracking, stopTracking } from "../services/tracking";

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
  distance_km?: number;
  eta_minutes?: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateEta(distanceKm: number): number {
  return Math.round((distanceKm / 30) * 60);
}

export default function DriverPickupScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [step, setStep] = useState<"auth" | "pickup">("auth");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [voyageId, setVoyageId] = useState<string | null>(null);
  const [voyageCode, setVoyageCode] = useState("");

  const [passengers, setPassengers] = useState<PickupPassenger[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleAuth = useCallback(async () => {
    if (code.length < 4) return;
    setLoading(true);
    try {
      const { data } = await api.post(
        "/api/v1/travelwiz/captain/authenticate",
        null,
        { params: { access_code: code } }
      );

      setSessionToken(data.session_token);
      setVoyageId(data.voyage_id);
      setVoyageCode(data.voyage_code ?? code);

      const manifest = await api.get(
        `/api/v1/travelwiz/captain/${data.voyage_id}/manifest`,
        { headers: { "X-Captain-Session": data.session_token } }
      );

      const pax: PickupPassenger[] = (manifest.data.passengers ?? []).map((p: any) => ({
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
      }));

      setStep("pickup");

      if (data.vehicle_id) startTracking(data.vehicle_id, 15_000);

      // Compute distances & sort by proximity
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        const dLat = loc.coords.latitude;
        const dLon = loc.coords.longitude;

        const enriched = pax.map((p) => {
          if (p.pickup_lat != null && p.pickup_lon != null) {
            const dist = haversineKm(dLat, dLon, p.pickup_lat, p.pickup_lon);
            return { ...p, distance_km: dist, eta_minutes: estimateEta(dist) };
          }
          return p;
        });
        enriched.sort((a, b) => (a.distance_km ?? 9999) - (b.distance_km ?? 9999));
        setPassengers(enriched);
      } else {
        setPassengers(pax);
      }
    } catch (err: any) {
      Alert.alert(
        t("common.error", "Erreur"),
        err?.response?.data?.detail || t("driver.codeInvalid", "Code invalide.")
      );
    } finally {
      setLoading(false);
    }
  }, [code, t]);

  const markPickedUp = useCallback(
    async (passengerId: string) => {
      if (!voyageId || !sessionToken) return;
      setUpdatingId(passengerId);
      try {
        await api.post(
          `/api/v1/travelwiz/captain/${voyageId}/event`,
          { event_type: "pax_pickup", notes: `Passager ${passengerId} ramassé` },
          { headers: { "X-Captain-Session": sessionToken } }
        );
        setPassengers((prev) =>
          prev.map((p) => (p.id === passengerId ? { ...p, boarding_status: "boarded" } : p))
        );
      } catch (err: any) {
        Alert.alert(
          t("common.error", "Erreur"),
          err?.response?.data?.detail || t("driver.updateFail", "Impossible de mettre à jour.")
        );
      } finally {
        setUpdatingId(null);
      }
    },
    [voyageId, sessionToken, t]
  );

  const markNoShow = useCallback(
    async (passengerId: string) => {
      if (!voyageId || !sessionToken) return;
      setUpdatingId(passengerId);
      try {
        await api.post(
          `/api/v1/travelwiz/captain/${voyageId}/event`,
          { event_type: "pax_no_show", notes: `Passager ${passengerId} absent` },
          { headers: { "X-Captain-Session": sessionToken } }
        );
        setPassengers((prev) =>
          prev.map((p) => (p.id === passengerId ? { ...p, boarding_status: "no_show" } : p))
        );
      } catch {
        Alert.alert(t("common.error", "Erreur"), t("driver.updateFail", "Impossible de mettre à jour."));
      } finally {
        setUpdatingId(null);
      }
    },
    [voyageId, sessionToken, t]
  );

  function openNavigation(lat: number, lon: number, name: string) {
    const scheme = Platform.select({
      ios: `maps:0,0?q=${name}&ll=${lat},${lon}`,
      android: `geo:${lat},${lon}?q=${lat},${lon}(${name})`,
    });
    if (scheme) Linking.openURL(scheme);
  }

  /* ── Auth view ────────────────────────────────────────────────────── */
  if (step === "auth") {
    return (
      <Box flex={1} bg="$primary900" justifyContent="center" alignItems="center" p="$6">
        <Box maxWidth={400} w="$full" bg="$white" borderRadius="$xl" p="$6" alignItems="center">
          <Box bg="$success50" borderRadius="$full" p="$3" mb="$3">
            <MIcon name="directions-car" size="xl" color="$success700" />
          </Box>
          <Heading size="lg" color="$primary700" mb="$1">
            {t("driver.title", "Mode Ramassage")}
          </Heading>
          <Text size="sm" color="$textLight600" textAlign="center" mb="$5">
            {t("driver.subtitle", "Entrez le code de la rotation pour commencer le ramassage")}
          </Text>
          <Input size="xl" w="$full" mb="$4" borderColor="$borderLight300">
            <InputField
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              textAlign="center"
              fontSize={28}
              letterSpacing={8}
              placeholder="••••••"
            />
          </Input>
          <Button
            size="xl"
            action="positive"
            w="$full"
            onPress={handleAuth}
            isDisabled={loading || code.length < 4}
          >
            {loading && <ButtonSpinner mr="$2" />}
            <ButtonText>{t("driver.start", "Démarrer le ramassage")}</ButtonText>
          </Button>
        </Box>
      </Box>
    );
  }

  /* ── Pickup view ──────────────────────────────────────────────────── */
  const pickedUp = passengers.filter((p) => p.boarding_status === "boarded").length;
  const noShow = passengers.filter((p) => p.boarding_status === "no_show").length;
  const remaining = passengers.filter((p) => p.boarding_status === "pending");
  const done = passengers.filter((p) => p.boarding_status !== "pending");
  const progress = passengers.length ? ((pickedUp + noShow) / passengers.length) * 100 : 0;

  const renderPassenger = ({ item }: { item: PickupPassenger }) => {
    const isPending = item.boarding_status === "pending";
    const isBoarded = item.boarding_status === "boarded";
    const isNoShow = item.boarding_status === "no_show";
    const isUpdating = updatingId === item.id;

    return (
      <Box
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        borderLeftWidth={isBoarded ? 4 : isNoShow ? 4 : 1}
        borderLeftColor={isBoarded ? "$success500" : isNoShow ? "$error500" : "$borderLight200"}
        opacity={isNoShow ? 0.7 : 1}
        p="$4"
      >
        <HStack alignItems="center" mb="$1">
          <VStack flex={1}>
            <Text size="md" fontWeight="$bold" color="$textLight900">
              {item.name}
            </Text>
            {item.company && (
              <Text size="xs" color="$textLight500">
                {item.company}
              </Text>
            )}
          </VStack>
          {!isPending && (
            <Badge action={isBoarded ? "success" : "error"} variant="solid" size="sm">
              <BadgeText>
                {isBoarded ? t("driver.pickedUp", "Ramassé") : t("driver.noShow", "Absent")}
              </BadgeText>
            </Badge>
          )}
        </HStack>

        {item.pickup_address && (
          <Text size="sm" color="$textLight700" mt="$1">
            {item.pickup_address}
          </Text>
        )}

        {/* Distance & ETA */}
        {(item.distance_km != null || item.eta_minutes != null) && isPending && (
          <HStack space="xs" mt="$2">
            {item.distance_km != null && (
              <Badge action="info" variant="outline" size="sm">
                <MIcon name="place" size="2xs" color="$info600" mr="$1" />
                <BadgeText>
                  {item.distance_km < 1
                    ? `${Math.round(item.distance_km * 1000)}m`
                    : `${item.distance_km.toFixed(1)} km`}
                </BadgeText>
              </Badge>
            )}
            {item.eta_minutes != null && (
              <Badge action="muted" variant="outline" size="sm">
                <MIcon name="schedule" size="2xs" color="$textLight500" mr="$1" />
                <BadgeText>~{item.eta_minutes < 1 ? "<1" : item.eta_minutes} min</BadgeText>
              </Badge>
            )}
          </HStack>
        )}

        {/* Phone */}
        {item.phone && (
          <Button
            size="xs"
            variant="link"
            onPress={() => Linking.openURL(`tel:${item.phone}`)}
            alignSelf="flex-start"
            mt="$1"
          >
            <MIcon name="phone" size="2xs" color="$primary600" mr="$1" />
            <ButtonText size="xs">{item.phone}</ButtonText>
          </Button>
        )}

        {/* Action buttons */}
        {isPending && (
          <HStack space="xs" mt="$3">
            {item.pickup_lat && item.pickup_lon && (
              <Button
                size="md"
                variant="outline"
                action="primary"
                onPress={() => openNavigation(item.pickup_lat!, item.pickup_lon!, item.name)}
                flex={1}
              >
                <MIcon name="navigation" size="xs" color="$primary600" mr="$1" />
                <ButtonText size="sm">{t("driver.route", "Itinéraire")}</ButtonText>
              </Button>
            )}
            <Button
              size="md"
              action="positive"
              flex={2}
              onPress={() => markPickedUp(item.id)}
              isDisabled={isUpdating}
            >
              {isUpdating ? (
                <ButtonSpinner mr="$1" />
              ) : (
                <MIcon name="check" size="xs" color="$white" mr="$1" />
              )}
              <ButtonText size="sm">{t("driver.pickup", "Ramassé")}</ButtonText>
            </Button>
            <Button
              size="md"
              variant="outline"
              action="negative"
              onPress={() => markNoShow(item.id)}
              isDisabled={isUpdating}
            >
              <MIcon name="person-off" size="xs" color="$error600" />
            </Button>
          </HStack>
        )}
      </Box>
    );
  };

  return (
    <Box flex={1} bg="$backgroundLight50">
      {/* Header */}
      <Box bg="$white" pt={insets.top + 8} pb="$3" px="$4" borderBottomWidth={1} borderColor="$borderLight200">
        <HStack justifyContent="space-between" alignItems="center">
          <Heading size="md" color="$primary700">
            {t("driver.rotation", "Rotation")} {voyageCode}
          </Heading>
          <Text size="lg" fontWeight="$bold" color="$success600">
            {pickedUp}/{passengers.length}
          </Text>
        </HStack>
        <Progress value={progress} h={6} mt="$2.5">
          <ProgressFilledTrack bg="$success500" />
        </Progress>
        <HStack space="xs" mt="$2.5">
          <Badge action="muted" variant="outline" size="sm">
            <BadgeText>
              {t("driver.remaining", "{{count}} restant(s)", { count: remaining.length })}
            </BadgeText>
          </Badge>
          <Badge action="success" variant="outline" size="sm">
            <MIcon name="check" size="2xs" color="$success600" mr="$1" />
            <BadgeText>
              {t("driver.pickedUpCount", "{{count}} ramassé(s)", { count: pickedUp })}
            </BadgeText>
          </Badge>
          {noShow > 0 && (
            <Badge action="error" variant="outline" size="sm">
              <BadgeText>
                {t("driver.noShowCount", "{{count}} absent(s)", { count: noShow })}
              </BadgeText>
            </Badge>
          )}
        </HStack>
      </Box>

      {/* Passenger list */}
      <FlatList
        data={[...remaining, ...done]}
        keyExtractor={(item) => item.id}
        renderItem={renderPassenger}
        contentContainerStyle={{ padding: 14, gap: 10 }}
      />

      {/* Footer */}
      <Box
        bg="$white"
        borderTopWidth={1}
        borderColor="$borderLight200"
        p="$4"
        pb={16 + Math.max(insets.bottom, 8)}
      >
        <Button
          size="lg"
          variant="outline"
          action="negative"
          onPress={() => {
            stopTracking();
            setStep("auth");
            setCode("");
            setPassengers([]);
          }}
        >
          <MIcon name="close" size="md" color="$error600" mr="$2" />
          <ButtonText>{t("driver.endPickup", "Terminer le ramassage")}</ButtonText>
        </Button>
      </Box>
    </Box>
  );
}
