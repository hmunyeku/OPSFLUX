/**
 * SearchScreen — Gluestack refonte: global search across resource types.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList } from "react-native";
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
import { Search as SearchIcon, SearchX } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import StatusBadge from "../components/StatusBadge";
import { globalSearch, type SearchResult } from "../services/search";
import { useDebounce } from "../hooks/useDebounce";

interface Props {
  navigation: any;
}

const TYPE_LABELS: Record<string, { key: string; fb: string }> = {
  ads: { key: "search.types.ads", fb: "ADS" },
  cargo: { key: "search.types.cargo", fb: "Colis" },
  mission_notice: { key: "search.types.mission_notice", fb: "Mission" },
  user: { key: "search.types.user", fb: "Utilisateur" },
  tier: { key: "search.types.tier", fb: "Tiers" },
  project: { key: "search.types.project", fb: "Projet" },
  voyage: { key: "search.types.voyage", fb: "Voyage" },
};

const TYPE_BADGE_ACTION: Record<string, "info" | "success" | "warning" | "muted" | "error"> = {
  ads: "info",
  cargo: "warning",
  mission_notice: "info",
  user: "success",
  tier: "warning",
  project: "info",
  voyage: "info",
};

export default function SearchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debouncedQuery = useDebounce(query, 350);

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

  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      doSearch(debouncedQuery);
    }
  }, [debouncedQuery, doSearch]);

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
        break;
    }
  }

  const renderItem = ({ item }: { item: SearchResult }) => {
    const typeLabel = TYPE_LABELS[item.type] ?? { key: `search.types.${item.type}`, fb: item.type };
    const badgeAction = TYPE_BADGE_ACTION[item.type] ?? "muted";
    return (
      <Pressable
        onPress={() => navigateToResult(item)}
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        p="$3.5"
        mb="$2"
        $active-bg="$backgroundLight100"
      >
        <HStack alignItems="center" justifyContent="space-between" mb="$1">
          <Badge action={badgeAction as any} variant="outline" size="sm">
            <BadgeText>{t(typeLabel.key, typeLabel.fb)}</BadgeText>
          </Badge>
          {item.status && <StatusBadge status={item.status} />}
        </HStack>
        <Text size="sm" fontWeight="$semibold" color="$textLight900">
          {item.title}
        </Text>
        {item.subtitle && (
          <Text size="xs" color="$textLight500" mt="$0.5">
            {item.subtitle}
          </Text>
        )}
        {item.reference && (
          <Text size="xs" color="$textLight400" italic mt="$0.5">
            {item.reference}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <Box flex={1} bg="$backgroundLight50">
      <Box px="$3.5" pt={insets.top + 12} pb="$3">
        <Input borderColor="$borderLight300" bg="$white" size="lg">
          <InputSlot pl="$3">
            <InputIcon as={SearchIcon} color="$textLight400" />
          </InputSlot>
          <InputField
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => doSearch(query)}
            placeholder={t("search.placeholder", "Rechercher ADS, colis, missions...")}
            autoFocus
            autoCorrect={false}
          />
        </Input>
      </Box>

      {loading ? (
        <Box flex={1} alignItems="center" justifyContent="center">
          <Spinner color="$primary600" />
        </Box>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 14,
            paddingBottom: insets.bottom + 24,
          }}
          ListEmptyComponent={
            <VStack space="sm" alignItems="center" mt="$10" p="$6">
              <Icon as={searched ? SearchX : SearchIcon} size="xl" color="$textLight300" />
              <Text size="sm" color="$textLight500" textAlign="center">
                {searched
                  ? t("search.noResults", `Aucun résultat pour "{{query}}"`, { query })
                  : t("search.minChars", "Tapez au moins 2 caractères pour rechercher")}
              </Text>
            </VStack>
          }
        />
      )}
    </Box>
  );
}
