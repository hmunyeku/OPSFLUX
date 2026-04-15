/**
 * SearchScreen — federated, permission-aware global search.
 *
 * - Searches ADS, colis, voyages, assets, tiers, users in parallel.
 * - Only types the current user has permission to read are queried.
 * - Each result navigates to its dedicated detail screen
 *   (AdsDetail, CargoDetail, VoyageDetail, etc.).
 * - Types without a mobile detail screen are still shown but tapping
 *   them surfaces a toast explaining the limitation.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList } from "react-native";
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
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { NoResults } from "../components/illustrations";
import { useTranslation } from "react-i18next";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import {
  globalSearch,
  type SearchResult,
  type SearchResultType,
} from "../services/search";
import { useDebounce } from "../hooks/useDebounce";
import { usePermissions } from "../stores/permissions";

interface Props {
  navigation: any;
}

const TYPE_LABELS: Record<SearchResultType, { key: string; fb: string }> = {
  ads: { key: "search.types.ads", fb: "ADS" },
  cargo: { key: "search.types.cargo", fb: "Colis" },
  voyage: { key: "search.types.voyage", fb: "Voyage" },
  user: { key: "search.types.user", fb: "Utilisateur" },
  tier: { key: "search.types.tier", fb: "Tiers" },
  asset: { key: "search.types.asset", fb: "Asset" },
};

const TYPE_BADGE_ACTION: Record<
  SearchResultType,
  "info" | "success" | "warning" | "muted" | "error"
> = {
  ads: "info",
  cargo: "warning",
  voyage: "info",
  user: "success",
  tier: "warning",
  asset: "muted",
};

const TYPE_ICON: Record<SearchResultType, string> = {
  ads: "assignment",
  cargo: "inventory-2",
  voyage: "directions-boat",
  user: "person",
  tier: "business",
  asset: "domain",
};

export default function SearchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const hasAny = usePermissions((s) => s.hasAny);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debouncedQuery = useDebounce(query, 350);

  const doSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) return;
      setLoading(true);
      setSearched(true);
      try {
        const res = await globalSearch(q.trim(), { hasAny });
        setResults(res.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [hasAny]
  );

  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      doSearch(debouncedQuery);
    } else {
      setResults([]);
      setSearched(false);
    }
  }, [debouncedQuery, doSearch]);

  function navigateToResult(item: SearchResult) {
    switch (item.type) {
      case "ads":
        navigation.navigate("AdsDetail", { adsId: item.id });
        return;
      case "cargo":
        // CargoDetail wants either a tracking object or a cargo record;
        // we have the raw payload from the federated search.
        navigation.navigate("CargoDetail", {
          tracking: {
            reference: item.reference ?? item.title,
            status: item.status ?? "unknown",
            cargo_type: (item.raw as any)?.cargo_type ?? "",
            description: item.subtitle,
            sender_name: (item.raw as any)?.sender_name ?? null,
            recipient_name: (item.raw as any)?.recipient_name ?? null,
            origin_name: (item.raw as any)?.origin_name ?? null,
            destination_name:
              (item.raw as any)?.destination_asset_name ?? null,
            created_at: (item.raw as any)?.created_at ?? "",
            events: [],
          },
          trackingCode:
            (item.raw as any)?.tracking_code ?? item.reference ?? item.id,
          cargo: item.raw,
        });
        return;
      case "voyage":
        navigation.navigate("VoyageDetail", { voyageId: item.id });
        return;
      case "user":
      case "tier":
      case "asset":
        // No dedicated mobile detail yet — explain to the user instead
        // of doing nothing on tap.
        toast.show(
          t(
            "search.noDetailScreen",
            "Ce type de fiche n'est pas encore disponible dans l'app mobile."
          ),
          "warning"
        );
        return;
      default:
        return;
    }
  }

  const renderItem = ({ item }: { item: SearchResult }) => {
    const typeLabel = TYPE_LABELS[item.type] ?? {
      key: `search.types.${item.type}`,
      fb: item.type,
    };
    const badgeAction = TYPE_BADGE_ACTION[item.type] ?? "muted";
    const icon = TYPE_ICON[item.type] ?? "find-in-page";
    return (
      <Pressable
        onPress={() => navigateToResult(item)}
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        p="$3"
        mb="$2"
        $active-bg="$backgroundLight100"
      >
        <HStack space="sm" alignItems="center">
          <Box bg="$primary50" borderRadius="$md" p="$2">
            <MIcon name={icon as any} size="md" color="$primary700" />
          </Box>
          <VStack flex={1}>
            <HStack alignItems="center" justifyContent="space-between" mb="$0.5">
              <Badge action={badgeAction as any} variant="outline" size="sm">
                <BadgeText>{t(typeLabel.key, typeLabel.fb)}</BadgeText>
              </Badge>
              {item.status && <StatusBadge status={item.status} />}
            </HStack>
            <Text
              size="sm"
              fontWeight="$semibold"
              color="$textLight900"
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {item.subtitle && (
              <Text size="xs" color="$textLight500" numberOfLines={1}>
                {item.subtitle}
              </Text>
            )}
            {item.reference && item.reference !== item.title && (
              <Text size="2xs" color="$textLight400" italic>
                {item.reference}
              </Text>
            )}
          </VStack>
          <MIcon name="chevron-right" size="sm" color="$textLight400" />
        </HStack>
      </Pressable>
    );
  };

  return (
    <Box flex={1} bg="$backgroundLight50">
      <Box px="$3.5" pt={insets.top + 12} pb="$3">
        <Input borderColor="$borderLight300" bg="$white" size="lg">
          <InputSlot pl="$3">
            <MIcon name="search" size="sm" color="$textLight400" />
          </InputSlot>
          <InputField
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => doSearch(query)}
            placeholder={t(
              "search.placeholder",
              "Rechercher ADS, colis, voyages..."
            )}
            autoFocus
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8} pr="$3">
              <MIcon name="cancel" size="sm" color="$textLight400" />
            </Pressable>
          )}
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
            <VStack space="md" alignItems="center" mt="$10" p="$6">
              {searched ? (
                <NoResults width={180} />
              ) : (
                <MIcon name="search" size={64} color="$textLight300" />
              )}
              <Text size="sm" color="$textLight500" textAlign="center">
                {searched
                  ? t(
                      "search.noResults",
                      `Aucun résultat pour "{{query}}"`,
                      { query }
                    )
                  : t(
                      "search.minChars",
                      "Tapez au moins 2 caractères pour rechercher"
                    )}
              </Text>
            </VStack>
          }
        />
      )}
    </Box>
  );
}
