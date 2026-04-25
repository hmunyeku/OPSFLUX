/**
 * AdsListScreen — Gluestack refonte: paginated list of Avis de Séjour.
 *
 * Filter chips at top, search bar, FlatList of cards with status badge,
 * pull-to-refresh, infinite scroll, server-driven libellés.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Box,
  HStack,
    Input,
  InputField,
    InputSlot,
  Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { useTranslation } from "react-i18next";
import StatusBadge from "../components/StatusBadge";
import { listAds } from "../services/paxlog";
import type { AdsSummary } from "../types/api";

interface Props {
  route?: { params?: { status?: string; scope?: string } };
  navigation: any;
}

interface FilterOption {
  labelKey: string;
  labelFallback: string;
  value: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { labelKey: "ads.filter.all", labelFallback: "Tous", value: "" },
  { labelKey: "ads.filter.mine", labelFallback: "Mes ADS", value: "mine" },
  { labelKey: "ads.filter.approved", labelFallback: "Approuvés", value: "approved" },
  { labelKey: "ads.filter.pending", labelFallback: "En attente", value: "pending_validation" },
  { labelKey: "ads.filter.draft", labelFallback: "Brouillons", value: "draft" },
];

export default function AdsListScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const initialStatus = route?.params?.status ?? "";
  const initialScope = route?.params?.scope ?? "";

  const [ads, setAds] = useState<AdsSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState(initialScope || initialStatus);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchAds = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        const params: any = {
          search: search || undefined,
          page: pageNum,
          page_size: 20,
        };
        if (activeFilter === "mine") {
          params.scope = "mine";
        } else if (activeFilter) {
          params.status = activeFilter;
        }
        const result = await listAds(params);
        if (isRefresh || pageNum === 1) {
          setAds(result.items);
        } else {
          setAds((prev) => [...prev, ...result.items]);
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
    [search, activeFilter]
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchAds(1);
  }, [search, activeFilter, fetchAds]);

  const renderItem = useCallback(
    ({ item }: { item: AdsSummary }) => (
      <Pressable
        onPress={() => navigation.navigate("AdsDetail", { adsId: item.id })}
        onLongPress={() =>
          navigation.navigate("AdsBoardingDetail", { adsId: item.id })
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
        <Text size="sm" color="$textLight900" mb="$2" numberOfLines={2}>
          {item.visit_purpose}
        </Text>
        <HStack space="md" alignItems="center" flexWrap="wrap">
          <HStack space="xs" alignItems="center">
            <MIcon name="calendar-today" size="2xs" color="$textLight500" />
            <Text size="xs" color="$textLight500">
              {item.start_date} → {item.end_date}
            </Text>
          </HStack>
          {item.pax_count != null && (
            <HStack space="xs" alignItems="center">
              <MIcon name="people" size="2xs" color="$textLight500" />
              <Text size="xs" color="$textLight500">
                {t("ads.paxCount", "{{count}} pax", { count: item.pax_count })}
              </Text>
            </HStack>
          )}
        </HStack>
        {item.site_entry_asset_name && (
          <HStack space="xs" alignItems="center" mt="$1.5">
            <MIcon name="place" size="2xs" color="$textLight400" />
            <Text size="xs" color="$textLight400">
              {item.site_entry_asset_name}
            </Text>
          </HStack>
        )}
      </Pressable>
    ),
    [navigation, t]
  );

  return (
    <Box flex={1} bg="$backgroundLight50" pt={insets.top + 8}>
      {/* Search */}
      <Box px="$3.5" mb="$2">
        <Input borderColor="$borderLight300" bg="$white">
          <InputSlot pl="$3">
            <MIcon name="search" color="$textLight400" />
          </InputSlot>
          <InputField
            value={search}
            onChangeText={setSearch}
            placeholder={t("ads.searchPlaceholder", "Rechercher un ADS...")}
            autoCorrect={false}
          />
        </Input>
      </Box>

      {/* Filter chips */}
      <Box px="$3.5" mb="$2">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTER_OPTIONS}
          keyExtractor={(o) => o.value}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          renderItem={({ item: opt }) => {
            const isActive = activeFilter === opt.value;
            return (
              <Pressable
                onPress={() => setActiveFilter(opt.value)}
                bg={isActive ? "$primary600" : "$white"}
                borderWidth={1}
                borderColor={isActive ? "$primary600" : "$borderLight200"}
                px="$3"
                py="$1.5"
                borderRadius="$full"
              >
                <Text
                  size="sm"
                  fontWeight="$semibold"
                  color={isActive ? "$white" : "$textLight700"}
                >
                  {t(opt.labelKey, opt.labelFallback)}
                </Text>
              </Pressable>
            );
          }}
        />
      </Box>

      {/* List */}
      {loading && ads.length === 0 ? (
        <Box flex={1} alignItems="center" justifyContent="center">
          <Spinner color="$primary600" />
        </Box>
      ) : (
        <FlatList
          data={ads}
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
                fetchAds(1, true);
              }}
            />
          }
          onEndReached={() => {
            if (!hasMore || loadingMore) return;
            setLoadingMore(true);
            const next = page + 1;
            setPage(next);
            fetchAds(next);
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <Box py="$10" alignItems="center">
              <Text color="$textLight500" textAlign="center">
                {t("ads.empty", "Aucun ADS trouvé.")}
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
