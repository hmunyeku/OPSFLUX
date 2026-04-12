/**
 * ADS list screen — paginated list of Avis de Séjour.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors } from "../utils/colors";
import StatusBadge from "../components/StatusBadge";
import { listAds } from "../services/paxlog";
import type { AdsSummary } from "../types/api";

interface Props {
  navigation: any;
}

export default function AdsListScreen({ navigation }: Props) {
  const [ads, setAds] = useState<AdsSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchAds = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        const result = await listAds({
          search: search || undefined,
          page: pageNum,
          page_size: 20,
        });
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
    [search]
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchAds(1);
  }, [search]);

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

      {loading && ads.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
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
