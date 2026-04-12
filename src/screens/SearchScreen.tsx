/**
 * Global search screen — find ADS, colis, missions, users, etc.
 *
 * Queries the /api/v1/search endpoint and shows results
 * grouped by type with navigation to detail screens.
 */

import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Chip,
  Divider,
  Searchbar,
  Text,
} from "react-native-paper";
import StatusBadge from "../components/StatusBadge";
import { globalSearch, SearchResult } from "../services/search";
import { useDebounce } from "../hooks/useDebounce";
import { colors } from "../utils/colors";

const TYPE_LABELS: Record<string, string> = {
  ads: "ADS",
  cargo: "Colis",
  mission_notice: "Mission",
  user: "Utilisateur",
  tier: "Tiers",
  project: "Projet",
  voyage: "Voyage",
};

const TYPE_COLORS: Record<string, string> = {
  ads: colors.info,
  cargo: colors.accent,
  mission_notice: colors.primaryLight,
  user: colors.success,
  tier: colors.warning,
  project: colors.primary,
  voyage: colors.primaryDark,
};

interface Props {
  navigation: any;
}

export default function SearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debouncedQuery = useDebounce(query, 350);

  // Auto-search on debounced query change
  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      doSearch(debouncedQuery);
    }
  }, [debouncedQuery]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await globalSearch(q.trim());
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function navigateToResult(item: SearchResult) {
    switch (item.type) {
      case "ads":
        navigation.navigate("AdsList", { highlightId: item.id });
        break;
      case "cargo":
        navigation.navigate("CargoList", { highlightId: item.id });
        break;
      case "voyage":
        navigation.navigate("LiveTracking", { voyageId: item.id });
        break;
      default:
        // For other types, we'd navigate to a generic detail screen
        break;
    }
  }

  const renderItem = ({ item }: { item: SearchResult }) => (
    <Pressable style={styles.resultCard} onPress={() => navigateToResult(item)}>
      <View style={styles.resultHeader}>
        <Chip
          compact
          style={[styles.typeChip, { backgroundColor: (TYPE_COLORS[item.type] ?? colors.textMuted) + "20" }]}
          textStyle={[styles.typeChipText, { color: TYPE_COLORS[item.type] ?? colors.textMuted }]}
        >
          {TYPE_LABELS[item.type] ?? item.type}
        </Chip>
        {item.status && <StatusBadge status={item.status} />}
      </View>
      <Text variant="titleSmall" style={styles.resultTitle}>
        {item.title}
      </Text>
      {item.subtitle && (
        <Text variant="bodySmall" style={styles.resultSubtitle}>
          {item.subtitle}
        </Text>
      )}
      {item.reference && (
        <Text variant="bodySmall" style={styles.resultRef}>
          {item.reference}
        </Text>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Rechercher ADS, colis, missions..."
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => doSearch(query)}
        style={styles.searchbar}
        autoFocus
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          renderItem={renderItem}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            searched ? (
              <Text style={styles.emptyText}>
                Aucun résultat pour "{query}"
              </Text>
            ) : (
              <Text style={styles.emptyText}>
                Tapez au moins 2 caractères pour rechercher
              </Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchbar: { margin: 14 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { paddingHorizontal: 14, paddingBottom: 20 },
  resultCard: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  typeChip: { height: 24 },
  typeChipText: { fontSize: 11, fontWeight: "700" },
  resultTitle: { fontWeight: "600", color: colors.textPrimary },
  resultSubtitle: { color: colors.textSecondary, marginTop: 2 },
  resultRef: { color: colors.textMuted, marginTop: 2, fontStyle: "italic" },
  emptyText: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 15,
    marginTop: 40,
  },
});
