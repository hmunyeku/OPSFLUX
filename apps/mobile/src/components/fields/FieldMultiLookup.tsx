/**
 * FieldMultiLookup — multi-select server autocomplete via Gluestack sheet.
 *
 * Rewritten off react-native-paper (Dialog + Chip). Bottom-sheet modal
 * with search, checkable rows, selected chips wrap under the label.
 */

import React, { useCallback, useEffect, useState } from "react";
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
  Badge,
  BadgeText,
  Button,
  ButtonText,
  Heading,
  HStack,
  Text,
} from "@gluestack-ui/themed";
import { MIcon } from "../MIcon";
import FieldShell from "./FieldShell";
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
  onChange: (value: string[]) => void;
}

interface LookupItem {
  id: string;
  [key: string]: unknown;
}

/** Same fallback chain as FieldLookup — keeps user/contact rows readable. */
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

export default function FieldMultiLookup({
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
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>(
    {}
  );

  const selected = Array.isArray(value) ? (value as string[]) : [];
  const source = field.lookup_source;

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
          list = Array.isArray(result.data)
            ? result.data
            : result.data?.items ?? [];
        } catch {
          const cached = await getCachedLookup(source.endpoint);
          list = (cached as LookupItem[]) ?? [];
          if (query && source.display) {
            const q = query.toLowerCase();
            list = list.filter((item) =>
              String(item[source.display] ?? "")
                .toLowerCase()
                .includes(q)
            );
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
    if (open) doSearch(search);
  }, [search, open]);

  useEffect(() => {
    if (open) doSearch("");
  }, [open]);

  if (!source) return null;

  function toggleItem(item: LookupItem) {
    const itemId = String(item[source!.value] ?? item.id);
    const label = computeLabel(item, source!.display);
    if (selected.includes(itemId)) {
      onChange(selected.filter((id) => id !== itemId));
      setSelectedLabels((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } else {
      onChange([...selected, itemId]);
      setSelectedLabels((prev) => ({ ...prev, [itemId]: label }));
    }
  }

  return (
    <FieldShell
      label={`${field.label} (${selected.length})`}
      required={required}
      error={error}
      helpText={field.help_text}
      bare
    >
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.trigger, error ? styles.triggerError : null]}
      >
        {selected.length === 0 ? (
          <Text size="md" color="$textLight400" flex={1}>
            {field.placeholder ?? "Rechercher et ajouter…"}
          </Text>
        ) : (
          <View style={styles.chipRow}>
            {selected.slice(0, 4).map((id) => (
              <View key={id} style={styles.chip}>
                <Text size="xs" color="$primary800" numberOfLines={1}>
                  {selectedLabels[id] ?? id.slice(0, 8) + "…"}
                </Text>
              </View>
            ))}
            {selected.length > 4 && (
              <View style={styles.chip}>
                <Text size="xs" color="$primary800">
                  +{selected.length - 4}
                </Text>
              </View>
            )}
          </View>
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
              <Badge action="info" variant="solid" size="sm">
                <BadgeText>
                  {selected.length} sélectionné{selected.length > 1 ? "s" : ""}
                </BadgeText>
              </Badge>
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
                  const isSelected = selected.includes(itemId);
                  return (
                    <Pressable
                      style={[
                        styles.option,
                        isSelected ? styles.optionSelected : null,
                      ]}
                      onPress={() => toggleItem(item)}
                    >
                      <MIcon
                        name={
                          isSelected
                            ? "check-box"
                            : "check-box-outline-blank"
                        }
                        size="sm"
                        color={isSelected ? "$primary700" : "$textLight400"}
                        mr="$3"
                      />
                      <Text
                        size="md"
                        color="$textLight900"
                        flex={1}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
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
                      Aucun résultat
                    </Text>
                  </View>
                }
              />
            )}

            <Button action="primary" mt="$3" onPress={() => setOpen(false)}>
              <ButtonText>OK</ButtonText>
            </Button>
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
    paddingVertical: 10,
    backgroundColor: colors.surface,
    minHeight: 44,
    gap: 8,
  },
  triggerError: {
    borderColor: colors.danger,
  },
  chipRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  chip: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 120,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
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
  loadingContainer: { padding: 32, alignItems: "center" },
  emptyContainer: { padding: 48, alignItems: "center" },
});
