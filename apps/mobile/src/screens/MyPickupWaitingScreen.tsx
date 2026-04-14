/**
 * MyPickupWaitingScreen — passenger-side live tracking of their driver.
 *
 * Yango/Uber-style: the user sees the vehicle icon approaching on the
 * map, with a status card showing ETA, driver, and connection health.
 *
 * Navigation params:
 *   vehicleId         (UUID)           — the transport_vectors.id to track
 *   vehicleName?      (str)            — display name for the card header
 *   vehicleType?      (VehicleIconType) — "car" | "ship" | "plane" …
 *   pickupLat?        (number)         — destination for ETA estimation
 *   pickupLon?        (number)
 *   pickupLabel?      (str)            — e.g. "Parking Aéroport Douala"
 */

import React, { useEffect, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  BadgeText,
  Box,
  Heading,
  HStack,
  Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { useTranslation } from "react-i18next";
import { MIcon } from "../components/MIcon";
import FleetMap, {
  MapPosition,
  VehicleIconType,
} from "../components/FleetMap";
import { useDriverPosition } from "../hooks/useDriverPosition";
import type { DriverPosition, TrackingStatus } from "../services/trackingSocket";

interface Params {
  vehicleId: string;
  vehicleName?: string;
  vehicleType?: VehicleIconType;
  pickupLat?: number;
  pickupLon?: number;
  pickupLabel?: string;
}

interface Props {
  navigation: any;
  route: { params: Params };
}

// Haversine distance — km
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Rolling speed estimator — averages the last N position deltas.
function useAverageSpeed(position: DriverPosition | null): number | null {
  const [history, setHistory] = useState<DriverPosition[]>([]);

  useEffect(() => {
    if (!position) return;
    setHistory((prev) => {
      const next = [...prev, position];
      // Keep max 5 samples (~2.5 minutes at 30s interval)
      return next.slice(-5);
    });
  }, [position?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    // Prefer GPS-reported speed if available and recent
    if (position?.speed_knots != null) {
      // knots → km/h = 1.852
      return position.speed_knots * 1.852;
    }
    if (history.length < 2) return null;
    let totalKm = 0;
    let totalHours = 0;
    for (let i = 1; i < history.length; i++) {
      const a = history[i - 1];
      const b = history[i];
      totalKm += haversineKm(a.lat, a.lon, b.lat, b.lon);
      const dtMs =
        new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime();
      totalHours += Math.max(0, dtMs) / 3_600_000;
    }
    if (totalHours <= 0) return null;
    return totalKm / totalHours;
  }, [position, history]);
}

function statusBadge(status: TrackingStatus, t: any) {
  switch (status) {
    case "connected":
      return {
        action: "success" as const,
        icon: "wifi" as const,
        label: t("pickup.statusLive", "En direct"),
      };
    case "connecting":
    case "reconnecting":
      return {
        action: "warning" as const,
        icon: "sync" as const,
        label: t("pickup.statusReconnecting", "Reconnexion…"),
      };
    case "unauthorized":
      return {
        action: "error" as const,
        icon: "lock" as const,
        label: t("pickup.statusAuth", "Session expirée"),
      };
    case "forbidden":
      return {
        action: "error" as const,
        icon: "block" as const,
        label: t("pickup.statusForbidden", "Accès refusé"),
      };
    case "not_found":
      return {
        action: "muted" as const,
        icon: "search-off" as const,
        label: t("pickup.statusNotFound", "Véhicule introuvable"),
      };
    case "closed":
      return {
        action: "muted" as const,
        icon: "wifi-off" as const,
        label: t("pickup.statusClosed", "Déconnecté"),
      };
    default:
      return {
        action: "muted" as const,
        icon: "wifi-off" as const,
        label: t("pickup.statusIdle", "Inactif"),
      };
  }
}

function formatRelative(ts: number | null, t: any): string {
  if (!ts) return t("pickup.neverSeen", "Aucune position reçue");
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 10) return t("pickup.justNow", "À l'instant");
  if (diffSec < 60)
    return t("pickup.secondsAgo", "il y a {{count}} s", { count: diffSec });
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)
    return t("pickup.minutesAgo", "il y a {{count}} min", { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  return t("pickup.hoursAgo", "il y a {{count}} h", { count: diffH });
}

export default function MyPickupWaitingScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { vehicleId, vehicleName, vehicleType, pickupLat, pickupLon, pickupLabel } =
    route.params ?? ({} as Params);

  const { position, status, statusDetail, lastSeenAt } =
    useDriverPosition(vehicleId);

  const speedKmh = useAverageSpeed(position);

  // Tick every 10s so the "last seen X min ago" string stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(i);
  }, []);

  const distanceKm = useMemo(() => {
    if (!position || pickupLat == null || pickupLon == null) return null;
    return haversineKm(position.lat, position.lon, pickupLat, pickupLon);
  }, [position, pickupLat, pickupLon]);

  const etaMinutes = useMemo(() => {
    if (distanceKm == null || !speedKmh || speedKmh < 1) return null;
    return Math.round((distanceKm / speedKmh) * 60);
  }, [distanceKm, speedKmh]);

  const mapPositions: MapPosition[] = useMemo(() => {
    if (!position) return [];
    return [
      {
        id: position.vector_id + ":" + position.seq,
        vector_id: position.vector_id,
        vector_name: vehicleName,
        latitude: position.lat,
        longitude: position.lon,
        source: "gps",
        speed_knots: position.speed_knots ?? null,
        heading: position.heading ?? null,
        recorded_at: position.recorded_at,
        vehicle_type: vehicleType ?? "default",
      },
    ];
  }, [position, vehicleName, vehicleType]);

  const badge = statusBadge(status, t);
  const isLoading =
    status !== "connected" && status !== "closed" && !position;

  return (
    <Box flex={1} bg="$backgroundLight50">
      {/* Map — fills available space */}
      <Box flex={1}>
        {position ? (
          <FleetMap
            positions={mapPositions}
            focusVehicleId={vehicleId}
            showUserLocation
            style={{ flex: 1, borderRadius: 0 }}
          />
        ) : (
          <Box flex={1} alignItems="center" justifyContent="center" px="$6">
            {isLoading ? (
              <>
                <Spinner size="large" color="$primary600" />
                <Text size="sm" color="$textLight500" mt="$3" textAlign="center">
                  {t(
                    "pickup.waitingFirstPosition",
                    "En attente de la position du véhicule…"
                  )}
                </Text>
              </>
            ) : (
              <VStack space="sm" alignItems="center">
                <MIcon name="location-off" size="2xl" color="$textLight300" />
                <Text size="sm" color="$textLight500" textAlign="center">
                  {statusDetail ?? t("pickup.noPosition", "Aucune position disponible.")}
                </Text>
              </VStack>
            )}
          </Box>
        )}
      </Box>

      {/* Top bar with back + status */}
      <Box
        position="absolute"
        top={insets.top + 8}
        left={12}
        right={12}
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Pressable
          onPress={() => navigation.goBack()}
          bg="$white"
          borderRadius="$full"
          w={40}
          h={40}
          alignItems="center"
          justifyContent="center"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 4,
            elevation: 3,
          }}
        >
          <MIcon name="arrow-back" size="md" color="$textLight900" />
        </Pressable>

        <Badge action={badge.action} variant="solid" size="md" borderRadius="$full">
          <MIcon name={badge.icon} size="xs" color="$white" mr="$1" />
          <BadgeText>{badge.label}</BadgeText>
        </Badge>
      </Box>

      {/* Bottom card — driver/ETA panel (Uber-style) */}
      <Box
        bg="$white"
        borderTopLeftRadius="$2xl"
        borderTopRightRadius="$2xl"
        px="$5"
        pt="$4"
        pb={insets.bottom + 16}
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -2 },
          elevation: 6,
        }}
      >
        <HStack space="md" alignItems="center" mb="$3">
          <Box bg="$primary50" borderRadius="$full" p="$3">
            <MIcon
              name={iconForType(vehicleType)}
              size="lg"
              color="$primary700"
            />
          </Box>
          <VStack flex={1}>
            <Heading size="sm" color="$textLight900">
              {vehicleName ?? t("pickup.yourVehicle", "Votre véhicule")}
            </Heading>
            <Text size="xs" color="$textLight500">
              {formatRelative(lastSeenAt, t)}
            </Text>
          </VStack>
        </HStack>

        {/* Metrics row */}
        <HStack space="md" justifyContent="space-around" mt="$1">
          <Metric
            label={t("pickup.distance", "Distance")}
            value={distanceKm != null ? `${distanceKm.toFixed(1)} km` : "—"}
          />
          <Divider />
          <Metric
            label={t("pickup.eta", "ETA")}
            value={etaMinutes != null ? `${etaMinutes} min` : "—"}
          />
          <Divider />
          <Metric
            label={t("pickup.speed", "Vitesse")}
            value={speedKmh != null ? `${Math.round(speedKmh)} km/h` : "—"}
          />
        </HStack>

        {pickupLabel && (
          <HStack space="sm" alignItems="center" mt="$4" px="$2">
            <MIcon name="place" size="sm" color="$textLight500" />
            <Text size="xs" color="$textLight500" flex={1} numberOfLines={1}>
              {t("pickup.yourPickup", "Votre point de rdv :")} {pickupLabel}
            </Text>
          </HStack>
        )}
      </Box>
    </Box>
  );
}

function iconForType(t?: VehicleIconType): any {
  switch (t) {
    case "ship":
    case "boat":
      return "directions-boat";
    case "plane":
      return "flight";
    case "helicopter":
      return "flight";
    case "truck":
      return "local-shipping";
    case "bus":
      return "directions-bus";
    case "van":
    case "car":
    default:
      return "directions-car";
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <VStack alignItems="center" flex={1}>
      <Text size="sm" fontWeight="$bold" color="$textLight900">
        {value}
      </Text>
      <Text size="2xs" color="$textLight500" textTransform="uppercase">
        {label}
      </Text>
    </VStack>
  );
}

function Divider() {
  return <Box w={1} h={28} bg="$borderLight200" alignSelf="center" />;
}
