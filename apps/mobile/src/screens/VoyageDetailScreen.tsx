/**
 * VoyageDetailScreen — Gluestack refonte: full view of a voyage.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  BadgeText,
  Box,
  Divider,
  Heading,
  HStack,
    Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon, type MIconName } from "../components/MIcon";
import { useTranslation } from "react-i18next";
import StatusBadge from "../components/StatusBadge";
import FleetMap, { type MapPosition } from "../components/FleetMap";
import { api } from "../services/api";

interface Props {
  route: { params: { voyageId: string } };
}

interface VoyageDetail {
  id: string;
  code: string;
  status: string;
  vector_name: string;
  vector_type: string;
  scheduled_departure: string;
  scheduled_arrival: string;
  actual_departure: string | null;
  actual_arrival: string | null;
  delay_reason: string | null;
  departure_base_name: string | null;
  arrival_base_name: string | null;
  pax_count: number;
  cargo_count: number;
  stop_count: number;
}

interface VoyageLog {
  id: string;
  event_type: string;
  timestamp: string;
  description: string;
  created_by_name: string | null;
}

const EVENT_ICONS: Record<string, MIconName> = {
  departure: "flight-takeoff",
  arrival: "flight-land",
  weather: "cloud",
  technical: "build",
  fuel: "local-gas-station",
  safety: "shield",
  incident: "warning",
};

export default function VoyageDetailScreen({ route }: Props) {
  const { voyageId } = route.params;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [voyage, setVoyage] = useState<VoyageDetail | null>(null);
  const [logs, setLogs] = useState<VoyageLog[]>([]);
  const [positions, setPositions] = useState<MapPosition[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [voyageRes, logsRes, trackRes] = await Promise.all([
        api.get(`/api/v1/travelwiz/voyages/${voyageId}`),
        api.get(`/api/v1/travelwiz/voyages/${voyageId}/logs`).catch(() => ({ data: [] })),
        api.get(`/api/v1/travelwiz/tracking/fleet`).catch(() => ({ data: { positions: [] } })),
      ]);
      setVoyage(voyageRes.data);
      setLogs(logsRes.data);
      setPositions(trackRes.data.positions ?? []);
    } catch {
      /* partial */
    } finally {
      setLoading(false);
    }
  }, [voyageId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center">
        <Spinner color="$primary600" />
      </Box>
    );
  }

  if (!voyage) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center">
        <Text color="$textLight500">{t("voyage.notFound", "Voyage introuvable")}</Text>
      </Box>
    );
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
        {/* Header */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <HStack justifyContent="space-between" alignItems="center">
            <Heading size="lg" color="$primary700">
              {voyage.code}
            </Heading>
            <StatusBadge status={voyage.status} size="md" />
          </HStack>
          <Heading size="sm" color="$textLight900" mt="$1">
            {voyage.vector_name}
          </Heading>
          <Box mt="$2" alignSelf="flex-start">
            <Badge action="muted" variant="solid" size="sm">
              <MIcon name="flight" size="2xs" color="$white" mr="$1" />
              <BadgeText>{voyage.vector_type}</BadgeText>
            </Badge>
          </Box>
        </Box>

        {/* Schedule */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$3">
            {t("voyage.schedule", "Horaires")}
          </Heading>
          <ScheduleRow
            icon="schedule"
            label={t("voyage.scheduledDeparture", "Départ prévu")}
            value={new Date(voyage.scheduled_departure).toLocaleString("fr-FR")}
          />
          {voyage.actual_departure && (
            <>
              <Divider my="$2" />
              <ScheduleRow
                icon="flight-takeoff"
                label={t("voyage.actualDeparture", "Départ effectif")}
                value={new Date(voyage.actual_departure).toLocaleString("fr-FR")}
                iconColor="$success600"
              />
            </>
          )}
          <Divider my="$2" />
          <ScheduleRow
            icon="schedule"
            label={t("voyage.scheduledArrival", "Arrivée prévue")}
            value={new Date(voyage.scheduled_arrival).toLocaleString("fr-FR")}
          />
          {voyage.actual_arrival && (
            <>
              <Divider my="$2" />
              <ScheduleRow
                icon="flight-land"
                label={t("voyage.actualArrival", "Arrivée effective")}
                value={new Date(voyage.actual_arrival).toLocaleString("fr-FR")}
                iconColor="$success600"
              />
            </>
          )}
          {voyage.delay_reason && (
            <>
              <Divider my="$2" />
              <ScheduleRow
                icon="warning"
                label={t("voyage.delayReason", "Motif de retard")}
                value={voyage.delay_reason}
                iconColor="$warning600"
              />
            </>
          )}
        </Box>

        {/* Route */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$3">
            {t("voyage.route", "Itinéraire")}
          </Heading>
          {voyage.departure_base_name && (
            <>
              <ScheduleRow
                icon="place"
                label={t("voyage.departure", "Départ")}
                value={voyage.departure_base_name}
              />
            </>
          )}
          {voyage.stop_count > 0 && (
            <>
              {voyage.departure_base_name && <Divider my="$2" />}
              <ScheduleRow
                icon="more-horiz"
                label={t("voyage.stops", "Escales")}
                value={t("voyage.stopCount", "{{count}} escale(s)", { count: voyage.stop_count })}
              />
            </>
          )}
          {voyage.arrival_base_name && (
            <>
              {(voyage.departure_base_name || voyage.stop_count > 0) && <Divider my="$2" />}
              <ScheduleRow
                icon="place"
                label={t("voyage.arrival", "Arrivée")}
                value={voyage.arrival_base_name}
                iconColor="$success600"
              />
            </>
          )}
        </Box>

        {/* Stats */}
        <HStack space="md">
          <Box flex={1} bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4" alignItems="center">
            <Heading size="xl" color="$primary700">
              {voyage.pax_count}
            </Heading>
            <Text size="xs" color="$textLight500">
              {t("voyage.passengers", "Passagers")}
            </Text>
          </Box>
          <Box flex={1} bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4" alignItems="center">
            <Heading size="xl" color="$primary700">
              {voyage.cargo_count}
            </Heading>
            <Text size="xs" color="$textLight500">
              {t("voyage.cargo", "Cargo")}
            </Text>
          </Box>
        </HStack>

        {/* Map */}
        {positions.length > 0 && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" overflow="hidden">
            <FleetMap
              positions={positions}
              focusVehicleId={voyage.id}
              style={{ height: 250, borderRadius: 12 }}
            />
          </Box>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
            <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$3">
              {t("voyage.logs", "Journal de bord")} ({logs.length})
            </Heading>
            {logs.map((log, idx) => {
              const LogIcon = EVENT_ICONS[log.event_type] ?? "sticky-note-2";
              return (
                <HStack
                  key={log.id}
                  space="sm"
                  alignItems="flex-start"
                  py="$3"
                  borderTopWidth={idx === 0 ? 0 : 1}
                  borderColor="$borderLight100"
                >
                  <Box bg="$backgroundLight100" borderRadius="$md" p="$2">
                    <MIcon name={LogIcon} size="sm" color="$textLight600" />
                  </Box>
                  <VStack flex={1}>
                    <Text size="sm" fontWeight="$semibold" color="$textLight900" textTransform="capitalize">
                      {log.event_type}
                    </Text>
                    <Text size="sm" color="$textLight700">
                      {log.description}
                    </Text>
                    <Text size="2xs" color="$textLight400" mt="$0.5">
                      {new Date(log.timestamp).toLocaleString("fr-FR")}
                      {log.created_by_name ? ` · ${log.created_by_name}` : ""}
                    </Text>
                  </VStack>
                </HStack>
              );
            })}
          </Box>
        )}
      </ScrollView>
    </Box>
  );
}

function ScheduleRow({
  icon,
  label,
  value,
  iconColor = "$textLight600",
}: {
  icon: MIconName;
  label: string;
  value: string;
  iconColor?: string;
}) {
  return (
    <HStack space="sm" alignItems="center">
      <Box bg="$backgroundLight100" borderRadius="$md" p="$1.5">
        <MIcon name={icon} size="xs" color={iconColor} />
      </Box>
      <VStack flex={1}>
        <Text size="xs" color="$textLight500">
          {label}
        </Text>
        <Text size="sm" fontWeight="$medium" color="$textLight900">
          {value}
        </Text>
      </VStack>
    </HStack>
  );
}
