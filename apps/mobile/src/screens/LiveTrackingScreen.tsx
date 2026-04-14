/**
 * LiveTrackingScreen — Gluestack refonte: real-time fleet map + GPS beacon.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  BadgeText,
  Box,
  Heading,
  HStack,
    Spinner,
  Switch,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import { useAuthStore } from "../stores/auth";
import { useTrackingStore, startTracking, stopTracking } from "../services/tracking";
import FleetMap, { type MapPosition } from "../components/FleetMap";

interface VehiclePosition {
  id: string;
  vector_id: string;
  vector_name?: string;
  latitude: number;
  longitude: number;
  source: string;
  speed_knots: number | null;
  heading: number | null;
  recorded_at: string;
}

export default function LiveTrackingScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [positions, setPositions] = useState<VehiclePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const trackingEnabled = useTrackingStore((s) => s.enabled);
  const lastPosition = useTrackingStore((s) => s.lastPosition);
  const positionCount = useTrackingStore((s) => s.positionCount);

  const loadFleet = useCallback(async () => {
    try {
      const { data } = await api.get("/api/v1/travelwiz/tracking/fleet");
      setPositions(data.positions ?? []);
      setConnected(true);
    } catch {
      /* may not have permission */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFleet();
  }, [loadFleet]);

  useEffect(() => {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) return;
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await api.get("/api/v1/travelwiz/tracking/fleet");
        if (data.positions) {
          setPositions(data.positions);
          setConnected(true);
        }
      } catch {
        setConnected(false);
      }
    }, 10_000);
    return () => clearInterval(pollInterval);
  }, []);

  function toggleBeacon(enabled: boolean) {
    if (enabled) {
      Alert.alert(
        t("tracking.beaconTitle", "Tracking GPS"),
        t("tracking.beaconConfirm", "Le tracking GPS sera activé pour le vecteur assigné."),
        [
          { text: t("common.cancel", "Annuler"), style: "cancel" },
          { text: t("tracking.activate", "Activer"), onPress: () => startTracking("default") },
        ]
      );
    } else {
      stopTracking();
    }
  }

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
        {/* Connection */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" px="$3.5" py="$3">
          <HStack alignItems="center" justifyContent="space-between">
            <HStack space="sm" alignItems="center">
              <MIcon name={connected ? "wifi" : "wifi-off"} size="sm" color={connected ? "$success600" : "$error600"} />
              <Text size="sm" color="$textLight700">
                {connected
                  ? t("tracking.connected", "Connecté — suivi en temps réel")
                  : t("tracking.disconnected", "Déconnecté")}
              </Text>
            </HStack>
            <Text size="xs" color="$textLight400">
              {t("tracking.vectorCount", "{{count}} vecteur(s)", { count: positions.length })}
            </Text>
          </HStack>
        </Box>

        {/* Beacon */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <HStack alignItems="center" justifyContent="space-between">
            <HStack space="sm" alignItems="center" flex={1}>
              <MIcon name="radar" size="md" color={trackingEnabled ? "$success600" : "$textLight500"} />
              <VStack flex={1}>
                <Text size="sm" fontWeight="$semibold" color="$textLight900">
                  {t("tracking.beacon", "Balise GPS")}
                </Text>
                <Text size="xs" color="$textLight500">
                  {t(
                    "tracking.beaconDesc",
                    "Envoyez votre position en temps réel pour le suivi de voyage"
                  )}
                </Text>
              </VStack>
            </HStack>
            <Switch value={trackingEnabled} onValueChange={toggleBeacon} />
          </HStack>
          {trackingEnabled && lastPosition && (
            <Box mt="$3" pt="$3" borderTopWidth={1} borderColor="$borderLight200">
              <HStack justifyContent="space-between">
                <Text size="xs" color="$textLight500" fontFamily="$mono">
                  {lastPosition.lat.toFixed(5)}, {lastPosition.lon.toFixed(5)}
                </Text>
                <Text size="xs" color="$textLight500">
                  {t("tracking.sentCount", "{{count}} envoyée(s)", { count: positionCount })}
                </Text>
              </HStack>
            </Box>
          )}
        </Box>

        {/* Map */}
        {positions.length > 0 && (
          <Box bg="$white" borderRadius="$lg" overflow="hidden" borderWidth={1} borderColor="$borderLight200">
            <FleetMap
              positions={positions as MapPosition[]}
              showUserLocation={trackingEnabled}
              style={{ height: 280, borderRadius: 12 }}
            />
          </Box>
        )}

        {/* List */}
        <Heading size="sm" color="$textLight900" mt="$1">
          {t("tracking.fleetPositions", "Positions de la flotte")}
        </Heading>

        {loading ? (
          <Box py="$8" alignItems="center">
            <Spinner color="$primary600" />
          </Box>
        ) : positions.length === 0 ? (
          <Text size="sm" color="$textLight500" textAlign="center" py="$4">
            {t("tracking.empty", "Aucune position de vecteur disponible.")}
          </Text>
        ) : (
          positions.map((pos) => (
            <Box
              key={pos.id}
              bg="$white"
              borderRadius="$lg"
              borderWidth={1}
              borderColor="$borderLight200"
              p="$3.5"
            >
              <HStack alignItems="center" justifyContent="space-between" mb="$1.5">
                <Text size="sm" fontWeight="$bold" color="$primary700">
                  {pos.vector_name ?? pos.vector_id.slice(0, 8)}
                </Text>
                <Badge action="muted" variant="outline" size="sm">
                  <BadgeText>{pos.source.toUpperCase()}</BadgeText>
                </Badge>
              </HStack>
              <HStack space="xs" alignItems="center" mb="$1.5">
                <MIcon name="place" size="2xs" color="$textLight400" />
                <Text size="xs" color="$textLight600" fontFamily="$mono">
                  {pos.latitude.toFixed(5)}, {pos.longitude.toFixed(5)}
                </Text>
              </HStack>
              <HStack space="md" alignItems="center" flexWrap="wrap">
                {pos.speed_knots != null && (
                  <HStack space="xs" alignItems="center">
                    <MIcon name="speed" size="2xs" color="$textLight400" />
                    <Text size="xs" color="$textLight500">
                      {pos.speed_knots.toFixed(1)} kn
                    </Text>
                  </HStack>
                )}
                {pos.heading != null && (
                  <HStack space="xs" alignItems="center">
                    <MIcon name="explore" size="2xs" color="$textLight400" />
                    <Text size="xs" color="$textLight500">
                      {t("tracking.heading", "Cap")} {pos.heading.toFixed(0)}°
                    </Text>
                  </HStack>
                )}
                <Text size="xs" color="$textLight400" ml="auto">
                  {new Date(pos.recorded_at).toLocaleTimeString("fr-FR")}
                </Text>
              </HStack>
            </Box>
          ))
        )}
      </ScrollView>
    </Box>
  );
}
