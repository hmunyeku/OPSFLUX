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
  Icon,
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { ArrowRight, Package, Search, AlertTriangle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import StatusBadge from "../components/StatusBadge";
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
        p="$4"
        mb="$2.5"
        $active-bg="$backgroundLight100"
      >
        <HStack justifyContent="space-between" alignItems="center" mb="$1.5">
          <Text size="md" fontWeight="$bold" color="$primary700">
            {item.reference}
          </Text>
          <StatusBadge status={item.status} />
        </HStack>

        {item.description && (
          <Text size="sm" color="$textLight900" mb="$2" numberOfLines={1}>
            {item.description}
          </Text>
        )}

        <HStack space="md" alignItems="center" flexWrap="wrap" mb="$1">
          <HStack space="xs" alignItems="center">
            <Icon as={Package} size="2xs" color="$textLight500" />
            <Text size="xs" color="$textLight500">
              {item.cargo_type}
              {item.weight_kg ? ` · ${item.weight_kg} kg` : ""}
            </Text>
          </HStack>
          {item.hazmat && (
            <Badge action="error" variant="solid" size="sm">
              <Icon as={AlertTriangle} size="2xs" color="$white" mr="$1" />
              <BadgeText>HAZMAT</BadgeText>
            </Badge>
          )}
        </HStack>

        {(item.sender_name || item.recipient_name) && (
          <HStack space="xs" alignItems="center" mt="$1">
            <Text size="xs" color="$textLight500" numberOfLines={1} flexShrink={1}>
              {item.sender_name ?? "—"}
            </Text>
            <Icon as={ArrowRight} size="2xs" color="$textLight400" />
            <Text size="xs" color="$textLight500" numberOfLines={1} flexShrink={1}>
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
            <InputIcon as={Search} color="$textLight400" />
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
        <Box flex={1} alignItems="center" justifyContent="center">
          <Spinner color="$primary600" />
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
            <Box py="$10" alignItems="center">
              <Text color="$textLight500" textAlign="center">
                {t("cargo.empty", "Aucun colis trouvé.")}
              </Text>
            </Box>
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
