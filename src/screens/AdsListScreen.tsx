/**
 * ADS list screen — paginated list of Avis de Séjour.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors } from "../utils/colors";
import { Chip } from "react-native-paper";
import StatusBadge from "../components/StatusBadge";
import { ListSkeleton } from "../components/SkeletonLoader";
import { listAds } from "../services/paxlog";
import type { AdsSummary } from "../types/api";

interface Props {
  route?: { params?: { status?: string; scope?: string } };
  navigation: any;
}

const FILTER_OPTIONS = [
  { label: "Tous", value: "" },
  { label: "Mes ADS", value: "mine" },
  { label: "Approuvés", value: "approved" },
  { label: "En attente", value: "pending_validation" },
  { label: "Brouillons", value: "draft" },
];

export default function AdsListScreen({ route, navigation }: Props) {
  const initialStatus = route?.params?.status ?? "";
  const initialScope = route?.params?.scope ?? "";

  const [ads, setAds] = useState<AdsSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState(initialScope || initialStatus);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchAds = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        const params: any = {
          search: search || undefined,
          page: pageNum,
          page_size: 20,
        };
        // Apply filter
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
        // Silently handle — list might be empty
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [search, activeFilter]
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchAds(1);
  }, [search, activeFilter]);

  function handleRefresh() {
    setRefreshing(true);
    setPage(1);
    fetchAds(1, true);
  }

  function handleLoadMore() {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    fetchAds(next);
  }

  const renderItem = ({ item }: { item: AdsSummary }) => (
    <Pressable
      style={styles.card}
      onPress={() => navigation.navigate("AdsDetail", { adsId: item.id })}
      onLongPress={() => navigation.navigate("AdsBoardingDetail", { adsId: item.id })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.reference}>{item.reference}</Text>
        <StatusBadge status={item.status} />
      </View>
      <Text style={styles.purpose} numberOfLines={1}>
        {item.visit_purpose}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.meta}>
          {item.start_date} — {item.end_date}
        </Text>
        {item.pax_count != null && (
          <Text style={styles.meta}>{item.pax_count} pax</Text>
        )}
      </View>
      {item.site_entry_asset_name && (
        <Text style={styles.site}>{item.site_entry_asset_name}</Text>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Rechercher un ADS..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            selected={activeFilter === opt.value}
            onPress={() => setActiveFilter(opt.value)}
            compact
            mode={activeFilter === opt.value ? "flat" : "outlined"}
            selectedColor={colors.primary}
            style={styles.filterChip}
          >
            {opt.label}
          </Chip>
        ))}
      </View>

      {loading && ads.length === 0 ? (
        <ListSkeleton items={6} />
      ) : (
        <FlatList
          data={ads}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aucun ADS trouvé.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchInput: {
    margin: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  filterChip: {},
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 20,
    gap: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  reference: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  purpose: {
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  meta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  site: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  emptyText: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 15,
    marginTop: 40,
  },
});
