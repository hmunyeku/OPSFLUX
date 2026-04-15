/**
 * CargoListScreen — Gluestack refonte: paginated list of cargo items.
 *
 * Search bar + cards with hazmat badge, weight, sender → recipient.
 * Pull-to-refresh + infinite scroll.
 */

import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  BadgeText,
  Box,
  HStack,
  Input,
  InputField,
  InputSlot,
  Pressable,
  Spinner,
  Text,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { useTranslation } from "react-i18next";
import StatusBadge from "../components/StatusBadge";
import { SkeletonCard } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { listCargo } from "../services/packlog";
import type { CargoRead } from "../types/api";

interface Props {
  navigation: any;
}

export default function CargoListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [cargo, setCargo] = useState<CargoRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchCargo = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        const result = await listCargo({
          search: search || undefined,
          page: pageNum,
          page_size: 20,
        });
        if (isRefresh || pageNum === 1) {
          setCargo(result.items);
        } else {
          setCargo((prev) => [...prev, ...result.items]);
        }
        setHasMore(pageNum < result.pages);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search]
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchCargo(1);
  }, [search, fetchCargo]);

  const renderItem = useCallback(
    ({ item }: { item: CargoRead }) => (
      <Pressable
        onPress={() =>
          navigation.navigate("CargoDetail", {
            tracking: {
              reference: item.reference,
              status: item.status,
              cargo_type: item.cargo_type,
              description: item.description,
              sender_name: item.sender_name,
              recipient_name: item.recipient_name,
              destination_name: item.destination_asset_name,
              origin_name: item.origin_name,
              created_at: item.created_at,
              events: [],
            },
            trackingCode: item.tracking_code ?? item.reference,
            cargo: item,
          })
        }
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        px="$3"
        py="$2"
        mb="$1.5"
        $active-bg="$backgroundLight100"
      >
        {/* Row 1: ref + HAZMAT + type/weight chip + status */}
        <HStack alignItems="center" justifyContent="space-between" mb="$0.5">
          <HStack space="xs" alignItems="center" flex={1}>
            <Text size="sm" fontWeight="$bold" color="$primary700">
              {item.reference}
            </Text>
            {item.hazmat && (
              <Badge action="error" variant="solid" size="sm">
                <MIcon name="warning" size="2xs" color="$white" />
                <BadgeText ml="$0.5">HAZ</BadgeText>
              </Badge>
            )}
            <Text size="2xs" color="$textLight500">
              · {item.cargo_type}
              {item.weight_kg ? ` · ${item.weight_kg}kg` : ""}
            </Text>
          </HStack>
          <StatusBadge status={item.status} />
        </HStack>

        {/* Row 2: description — always present, truncated */}
        {item.description ? (
          <Text size="xs" color="$textLight900" numberOfLines={1} mb="$0.5">
            {item.description}
          </Text>
        ) : null}

        {/* Row 3: sender → recipient — only if any */}
        {(item.sender_name || item.recipient_name) && (
          <HStack space="xs" alignItems="center">
            <MIcon name="person" size="2xs" color="$textLight400" />
            <Text size="2xs" color="$textLight500" numberOfLines={1} flexShrink={1}>
              {item.sender_name ?? "—"}
            </Text>
            <MIcon name="arrow-forward" size="2xs" color="$textLight400" />
            <Text size="2xs" color="$textLight500" numberOfLines={1} flexShrink={1}>
              {item.recipient_name ?? "—"}
            </Text>
          </HStack>
        )}
      </Pressable>
    ),
    [navigation]
  );

  return (
    <Box flex={1} bg="$backgroundLight50" pt={insets.top + 8}>
      <Box px="$3.5" mb="$2">
        <Input borderColor="$borderLight300" bg="$white">
          <InputSlot pl="$3">
            <MIcon name="search" color="$textLight400" />
          </InputSlot>
          <InputField
            value={search}
            onChangeText={setSearch}
            placeholder={t("cargo.searchPlaceholder", "Rechercher un colis...")}
            autoCorrect={false}
          />
        </Input>
      </Box>

      {loading && cargo.length === 0 ? (
        <Box px="$3.5" pt="$1">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </Box>
      ) : (
        <FlatList
          data={cargo}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 14,
            paddingBottom: insets.bottom + 24,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setPage(1);
                fetchCargo(1, true);
              }}
            />
          }
          onEndReached={() => {
            if (!hasMore || loadingMore) return;
            setLoadingMore(true);
            const next = page + 1;
            setPage(next);
            fetchCargo(next);
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState
              illustration={search ? "no-results" : "inbox"}
              title={
                search
                  ? t("cargo.emptySearch", "Aucun colis ne correspond")
                  : t("cargo.emptyTitle", "Aucun colis pour l'instant")
              }
              description={
                search
                  ? t("cargo.emptySearchDesc", "Essayez d'autres mots-clés.")
                  : t(
                      "cargo.emptyDesc",
                      "Les colis envoyés ou reçus apparaîtront ici."
                    )
              }
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <Box py="$3" alignItems="center">
                <Spinner color="$primary600" />
              </Box>
            ) : null
          }
        />
      )}
    </Box>
  );
}
