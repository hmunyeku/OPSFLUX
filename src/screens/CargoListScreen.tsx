/**
 * Cargo list screen — paginated list of colis/cargo items.
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
import { listCargo } from "../services/packlog";
import type { CargoRead } from "../types/api";

interface Props {
  navigation: any;
}

export default function CargoListScreen({ navigation }: Props) {
  const [cargo, setCargo] = useState<CargoRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

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
        // Silently handle
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
    fetchCargo(1);
  }, [search]);

  function handleRefresh() {
    setRefreshing(true);
    setPage(1);
    fetchCargo(1, true);
  }

  function handleLoadMore() {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    fetchCargo(next);
  }

  const renderItem = ({ item }: { item: CargoRead }) => (
    <Pressable
      style={styles.card}
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
    >
      <View style={styles.cardHeader}>
        <Text style={styles.reference}>{item.reference}</Text>
        <StatusBadge status={item.status} />
      </View>

      {item.description && (
        <Text style={styles.description} numberOfLines={1}>
          {item.description}
        </Text>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.meta}>
          {item.cargo_type}
          {item.weight_kg ? ` — ${item.weight_kg} kg` : ""}
        </Text>
        {item.hazmat && (
          <View style={styles.hazmatBadge}>
            <Text style={styles.hazmatText}>HAZMAT</Text>
          </View>
        )}
      </View>

      {(item.sender_name || item.recipient_name) && (
        <Text style={styles.route}>
          {item.sender_name ?? "—"} → {item.recipient_name ?? "—"}
        </Text>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Rechercher un colis..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />

      {loading && cargo.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={cargo}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aucun colis trouvé.</Text>
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
  description: {
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  meta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  hazmatBadge: {
    backgroundColor: colors.danger + "20",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hazmatText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.danger,
  },
  route: {
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
