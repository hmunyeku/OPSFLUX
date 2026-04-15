/**
 * FieldLookup — server-side autocomplete picker via Gluestack modal.
 *
 * Rewritten off react-native-paper (which produced the "trop arrondi"
 * dialog + invisible list text bugs on mobile). Now a proper bottom
 * sheet with rounded-top-only corners, clearly-readable labels, and
 * inline search bar.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  Button,
  ButtonText,
  Heading,
  HStack,
  Text,
} from "@gluestack-ui/themed";
import { MIcon } from "../MIcon";
import FieldShell from "./FieldShell";
import { api } from "../../services/api";
import { fetchWithOfflineFallback } from "../../services/offline";
import { getCachedLookup } from "../../services/lookupCache";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";

interface Props {
  field: FieldDefinition;
  fieldName: string;
  value: unknown;
  error?: string;
  required: boolean;
  onChange: (value: string | null) => void;
}

interface LookupItem {
  id: string;
  [key: string]: unknown;
}

/**
 * Compute a human-readable label for a lookup item.
 *
 * Priority:
 *   1. The `display` field configured on the lookup source.
 *   2. Common composite fields: `display_name`, `full_name`, `name`,
 *      `title`, `label`.
 *   3. `first_name + last_name` (users / contacts API shape).
 *   4. `email` then `username` then `code`.
 *   5. Last resort: a short id snippet, never an empty "(sans nom)".
 */
function computeLabel(
  item: Record<string, unknown>,
  primaryKey?: string
): string {
  if (primaryKey) {
    const v = item[primaryKey];
    if (v !== null && v !== undefined && String(v).trim()) return String(v);
  }
  for (const k of ["display_name", "full_name", "name", "title", "label"]) {
    const v = item[k];
    if (v && String(v).trim()) return String(v);
  }
  const fn = item.first_name ? String(item.first_name).trim() : "";
  const ln = item.last_name ? String(item.last_name).trim() : "";
  if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
  for (const k of ["email", "username", "code", "reference"]) {
    const v = item[k];
    if (v && String(v).trim()) return String(v);
  }
  const id = item.id ? String(item.id) : "";
  return id ? `#${id.slice(0, 8)}` : "—";
}

/** Compute a secondary line (subtitle) for richer rows. */
function computeSecondary(item: Record<string, unknown>): string | undefined {
  // Show email if we already used names for primary, or position/code
  for (const k of ["email", "code", "position", "reference", "phone"]) {
    const v = item[k];
    if (v && String(v).trim()) return String(v);
  }
  return undefined;
}

export default function FieldLookup({
  field,
  value,
  error,
  required,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const [resolvingLabel, setResolvingLabel] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const source = field.lookup_source;

  useEffect(() => {
    if (!source || !value) {
      setSelectedLabel("");
      return;
    }
    const found = items.find((i) => String(i[source.value]) === String(value));
    if (found) {
      setSelectedLabel(computeLabel(found, source.display));
      return;
    }
    (async () => {
      try {
        const cached = await getCachedLookup(source.endpoint);
        if (cached) {
          const cachedItem = (cached as LookupItem[]).find(
            (i) => String(i[source.value]) === String(value)
          );
          if (cachedItem) {
            setSelectedLabel(computeLabel(cachedItem, source.display));
            return;
          }
        }
      } catch {}
      setResolvingLabel(true);
      try {
        const { data } = await api.get(`${source.endpoint}/${value}`);
        setSelectedLabel(computeLabel(data, source.display));
      } catch {
        setSelectedLabel(String(value).slice(0, 8) + "…");
      } finally {
        setResolvingLabel(false);
      }
    })();
  }, [value, items, source?.endpoint]);

  const doSearch = useCallback(
    async (query: string) => {
      if (!source?.endpoint) return;
      setLoading(true);
      try {
        const params: Record<string, unknown> = {
          ...(source.filter || {}),
          page_size: 30,
        };
        if (query && source.search_param) {
          params[source.search_param] = query;
        }
        let list: LookupItem[];
        try {
          const result = await fetchWithOfflineFallback<any>(
            source.endpoint,
            params
          );
          const data = result.data;
          list = Array.isArray(data) ? data : data?.items ?? [];
        } catch {
          const cached = await getCachedLookup(source.endpoint);
          if (cached) {
            list = cached as LookupItem[];
            if (query && source.display) {
              const q = query.toLowerCase();
              list = list.filter((item) =>
                String(item[source.display] ?? "")
                  .toLowerCase()
                  .includes(q)
              );
            }
          } else {
            list = [];
          }
        }
        setItems(list);
      } finally {
        setLoading(false);
      }
    },
    [source]
  );

  useEffect(() => {
    if (!open) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      doSearch(search);
    }, 300);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [search, open]);

  useEffect(() => {
    if (open) doSearch("");
  }, [open]);

  if (!source) {
    return (
      <FieldShell label={field.label} required={required} error="Configuration manquante" bare>
        <View style={styles.trigger} />
      </FieldShell>
    );
  }

  return (
    <FieldShell
      label={field.label}
      required={required}
      error={error}
      helpText={field.help_text}
      bare
    >
      <Pressable
        style={[styles.trigger, error ? styles.triggerError : null]}
        onPress={() => setOpen(true)}
      >
        {resolvingLabel ? (
          <>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text size="md" color="$textLight500" ml="$2" flex={1}>
              Chargement…
            </Text>
          </>
        ) : (
          <Text
            size="md"
            color={value && selectedLabel ? "$textLight900" : "$textLight400"}
            numberOfLines={1}
            flex={1}
          >
            {value && selectedLabel
              ? selectedLabel
              : field.placeholder ?? "Sélectionner…"}
          </Text>
        )}
        <MIcon name="search" size="sm" color="$textLight500" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setOpen(false)}
          />
          <View style={styles.modalSheet}>
            <HStack alignItems="center" justifyContent="space-between" mb="$3">
              <Heading size="sm">{field.label}</Heading>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <MIcon name="close" size="md" color="$textLight600" />
              </Pressable>
            </HStack>

            <View style={styles.searchBox}>
              <MIcon name="search" size="sm" color="$textLight500" />
              <TextInput
                placeholder="Rechercher…"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
                autoFocus
                autoCorrect={false}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <MIcon name="close" size="xs" color="$textLight500" />
                </Pressable>
              )}
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) =>
                  String(item[source.value] ?? item.id)
                }
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const itemId = String(item[source.value] ?? item.id);
                  const label = computeLabel(item, source.display);
                  const secondary = computeSecondary(item);
                  const isSelected = itemId === String(value);
                  return (
                    <Pressable
                      style={[
                        styles.option,
                        isSelected ? styles.optionSelected : null,
                      ]}
                      onPress={() => {
                        onChange(itemId);
                        setSelectedLabel(label);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          size="md"
                          color={isSelected ? "$primary700" : "$textLight900"}
                          fontWeight={isSelected ? "$semibold" : "$normal"}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                        {secondary && secondary !== label && (
                          <Text size="xs" color="$textLight500" mt="$0.5">
                            {secondary}
                          </Text>
                        )}
                      </View>
                      {isSelected && (
                        <MIcon name="check" size="sm" color="$primary700" />
                      )}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <MIcon
                      name="search-off"
                      size="xl"
                      color="$textLight300"
                    />
                    <Text size="sm" color="$textLight500" mt="$2">
                      {search
                        ? `Aucun résultat pour "${search}"`
                        : "Aucune donnée"}
                    </Text>
                  </View>
                }
              />
            )}

            <HStack space="sm" mt="$3">
              {Boolean(value) && (
                <Button
                  variant="outline"
                  action="negative"
                  flex={1}
                  onPress={() => {
                    onChange(null);
                    setSelectedLabel("");
                    setOpen(false);
                  }}
                >
                  <ButtonText>Effacer</ButtonText>
                </Button>
              )}
              <Button
                variant="outline"
                action="secondary"
                flex={1}
                onPress={() => setOpen(false)}
              >
                <ButtonText>Fermer</ButtonText>
              </Button>
            </HStack>
          </View>
        </View>
      </Modal>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  triggerError: {
    borderColor: colors.danger,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: "85%",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 8,
    backgroundColor: colors.surfaceAlt,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  list: {
    maxHeight: 400,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  optionSelected: {
    backgroundColor: "#eff6ff",
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyContainer: {
    padding: 48,
    alignItems: "center",
  },
});
