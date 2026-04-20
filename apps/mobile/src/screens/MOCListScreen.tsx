/**
 * MOCListScreen — paginated list of Management of Change requests.
 *
 * Same visual language as AdsListScreen: search + filter chips +
 * FlatList of cards with status badge + pull-to-refresh + infinite
 * scroll. Tap a card to drill into the detail.
 *
 * Phase 1 (read-only): status filters + "mine as manager" shortcut.
 */

import React, { useCallback, useEffect, useState } from "react";
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
} from "@gluestack-ui/themed";
import { useTranslation } from "react-i18next";
import { MIcon } from "../components/MIcon";
import StatusBadge from "../components/StatusBadge";
import { SkeletonCard } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import {
  listMOCs,
  MOC_STATUS_LABELS,
  type MOCSummary,
  type MOCStatus,
} from "../services/moc";

interface Props {
  route?: { params?: { status?: string; mine_as_manager?: boolean } };
  navigation: any;
}

interface FilterOption {
  labelKey: string;
  labelFallback: string;
  value: string; // "" = all, "mine" = mine_as_manager, else a status
}

const FILTER_OPTIONS: FilterOption[] = [
  { labelKey: "moc.filter.all", labelFallback: "Tous", value: "" },
  { labelKey: "moc.filter.mine", labelFallback: "Mes MOC", value: "mine" },
  { labelKey: "moc.filter.created", labelFallback: "À approuver", value: "created" },
  { labelKey: "moc.filter.under_study", labelFallback: "En étude", value: "under_study" },
  { labelKey: "moc.filter.validated", labelFallback: "Validés", value: "validated" },
  { labelKey: "moc.filter.execution", labelFallback: "Exécution", value: "execution" },
];

const PRIORITY_COLOR: Record<string, string> = {
  "1": "$red500",
  "2": "$amber500",
  "3": "$emerald500",
};

export default function MOCListScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const initialFilter = route?.params?.status
    ?? (route?.params?.mine_as_manager ? "mine" : "");

  const [mocs, setMocs] = useState<MOCSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>(initialFilter);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchMOCs = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        const params: {
          search?: string;
          page?: number;
          page_size?: number;
          status?: MOCStatus;
          mine_as_manager?: boolean;
        } = {
          search: search || undefined,
          page: pageNum,
          page_size: 20,
        };
        if (activeFilter === "mine") {
          params.mine_as_manager = true;
        } else if (activeFilter) {
          params.status = activeFilter as MOCStatus;
        }
        const result = await listMOCs(params);
        if (isRefresh || pageNum === 1) {
          setMocs(result.items);
        } else {
          setMocs((prev) => [...prev, ...result.items]);
        }
        setHasMore(pageNum < result.pages);
      } catch {
        // Offline fallback handled inside listMOCs via fetchWithOfflineFallback.
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search, activeFilter],
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchMOCs(1, true);
  }, [fetchMOCs]);

  const renderItem = useCallback(
    ({ item }: { item: MOCSummary }) => (
      <Pressable
        onPress={() => navigation.navigate("MOCDetail", { mocId: item.id })}
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        px="$3"
        py="$2"
        mb="$1.5"
        $active-bg="$backgroundLight100"
      >
        {/* Row 1: ref + priority dot + status */}
        <HStack alignItems="center" justifyContent="space-between" mb="$0.5">
          <HStack space="xs" alignItems="center" flex={1}>
            <Text size="sm" fontWeight="$bold" color="$primary700">
              {item.reference}
            </Text>
            {item.priority && (
              <Box
                w="$2"
                h="$2"
                borderRadius="$full"
                bg={PRIORITY_COLOR[item.priority] ?? "$textLight400"}
              />
            )}
            {item.project_id && (
              <MIcon name="rocket-launch" size="2xs" color="$emerald600" />
            )}
          </HStack>
          <StatusBadge status={item.status} />
        </HStack>
        {/* Row 2: title or reference as headline */}
        <Text
          size="xs"
          color="$textLight900"
          numberOfLines={2}
          fontWeight="$medium"
        >
          {item.title || t("moc.untitled", "MOC sans titre")}
        </Text>
        {/* Row 3: site + platform + initiator */}
        <HStack alignItems="center" space="sm" mt="$0.5">
          <HStack space="xs" alignItems="center">
            <MIcon name="place" size="2xs" color="$textLight400" />
            <Text size="2xs" color="$textLight500">
              {item.site_label} · {item.platform_code}
            </Text>
          </HStack>
          <Text
            size="2xs"
            color="$textLight400"
            numberOfLines={1}
            flex={1}
            textAlign="right"
          >
            {item.initiator_display ?? "—"}
          </Text>
        </HStack>
      </Pressable>
    ),
    [navigation, t],
  );

  return (
    <Box flex={1} bg="$backgroundLight50" pt={insets.top + 8}>
      <HStack px="$3.5" mb="$2" space="sm" alignItems="center">
        <Box flex={1}>
          <Input borderColor="$borderLight300" bg="$white">
            <InputSlot pl="$3">
              <MIcon name="search" color="$textLight400" />
            </InputSlot>
            <InputField
              value={search}
              onChangeText={setSearch}
              placeholder={t("moc.searchPlaceholder", "Rechercher un MOC...")}
              autoCorrect={false}
            />
          </Input>
        </Box>
        <Pressable
          onPress={() => navigation.navigate("MOCCreate")}
          bg="$primary600"
          borderRadius="$full"
          w="$10"
          h="$10"
          alignItems="center"
          justifyContent="center"
          $active-bg="$primary700"
        >
          <MIcon name="add" color="$white" size="sm" />
        </Pressable>
      </HStack>


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

      {loading && mocs.length === 0 ? (
        <Box px="$3.5" pt="$1">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </Box>
      ) : (
        <FlatList
          data={mocs}
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
                fetchMOCs(1, true);
              }}
            />
          }
          onEndReached={() => {
            if (!hasMore || loadingMore) return;
            setLoadingMore(true);
            const next = page + 1;
            setPage(next);
            fetchMOCs(next);
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState
              illustration={search ? "no-results" : "inbox"}
              title={
                search
                  ? t("moc.emptySearch", "Aucun MOC ne correspond")
                  : t("moc.empty", "Aucun MOC")
              }
              description={
                search
                  ? t("moc.emptySearchDesc", "Essayez d'autres mots-clés.")
                  : t(
                      "moc.emptyDesc",
                      "Vos demandes de modification apparaîtront ici.",
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
