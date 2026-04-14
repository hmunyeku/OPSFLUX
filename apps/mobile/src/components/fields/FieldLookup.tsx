/**
 * Lookup field — searches server entities, supports offline cache fallback.
 *
 * When the field has a pre-existing value (UUID), we resolve the label
 * by fetching /<endpoint>/<value> to show the name instead of the UUID.
 * Search is debounced 300ms to avoid hammering the server.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Dialog,
  Divider,
  HelperText,
  List,
  Portal,
  Searchbar,
  Text,
  TouchableRipple,
} from "react-native-paper";
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

export default function FieldLookup({ field, value, error, required, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const [resolvingLabel, setResolvingLabel] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const source = field.lookup_source;

  // Resolve label for existing value by calling GET /<endpoint>/<id>
  useEffect(() => {
    if (!source || !value) {
      setSelectedLabel("");
      return;
    }

    // First check if we already have it in the loaded items
    const found = items.find((i) => String(i[source.value]) === String(value));
    if (found) {
      setSelectedLabel(String(found[source.display] ?? ""));
      return;
    }

    // Then check the offline cache
    (async () => {
      try {
        const cached = await getCachedLookup(source.endpoint);
        if (cached) {
          const cachedItem = (cached as LookupItem[]).find(
            (i) => String(i[source.value]) === String(value)
          );
          if (cachedItem) {
            setSelectedLabel(String(cachedItem[source.display] ?? ""));
            return;
          }
        }
      } catch {}

      // Fallback: fetch the specific item via GET /<endpoint>/<value>
      setResolvingLabel(true);
      try {
        const { data } = await api.get(`${source.endpoint}/${value}`);
        const label = data?.[source.display] ?? data?.name ?? data?.display_name;
        if (label) {
          setSelectedLabel(String(label));
        } else {
          // Last resort — show the UUID truncated
          setSelectedLabel(String(value).slice(0, 8) + "…");
        }
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
          const result = await fetchWithOfflineFallback<any>(source.endpoint, params);
          const data = result.data;
          list = Array.isArray(data) ? data : data?.items ?? [];
        } catch {
          const cached = await getCachedLookup(source.endpoint);
          if (cached) {
            list = cached as LookupItem[];
            if (query && source.display) {
              const q = query.toLowerCase();
              list = list.filter((item) =>
                String(item[source.display] ?? "").toLowerCase().includes(q)
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

  // Debounced search
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

  // Initial load when dialog opens
  useEffect(() => {
    if (open) doSearch("");
  }, [open]);

  if (!source) {
    return (
      <View style={styles.triggerInner}>
        <Text variant="bodySmall" style={styles.triggerLabel}>
          {field.label}
        </Text>
        <Text variant="bodyMedium" style={{ color: colors.danger }}>
          Configuration manquante
        </Text>
      </View>
    );
  }

  return (
    <>
      <TouchableRipple onPress={() => setOpen(true)} style={styles.trigger}>
        <View style={[styles.triggerInner, error ? styles.triggerError : null]}>
          <Text variant="bodySmall" style={styles.triggerLabel}>
            {field.label}{required ? " *" : ""}
          </Text>
          {resolvingLabel ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="bodyLarge" style={[styles.triggerValue, { marginLeft: 8 }]}>
                Chargement…
              </Text>
            </View>
          ) : value && selectedLabel ? (
            <Text variant="bodyLarge" style={styles.triggerValue} numberOfLines={1}>
              {selectedLabel}
            </Text>
          ) : (
            <Text variant="bodyLarge" style={styles.triggerPlaceholder}>
              {field.placeholder ?? "Sélectionner…"}
            </Text>
          )}
        </View>
      </TouchableRipple>

      {(error || field.help_text) && (
        <HelperText type={error ? "error" : "info"} visible>
          {error || field.help_text}
        </HelperText>
      )}

      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)} style={styles.dialog}>
          <Dialog.Title>{field.label}</Dialog.Title>
          <Dialog.Content style={styles.content}>
            <Searchbar
              placeholder="Rechercher…"
              value={search}
              onChangeText={setSearch}
              style={styles.searchbar}
              autoFocus
            />
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => String(item[source.value] ?? item.id)}
                style={styles.list}
                ItemSeparatorComponent={Divider}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <List.Item
                    title={String(item[source.display] ?? "")}
                    description={item.code ? String(item.code) : undefined}
                    onPress={() => {
                      const itemId = String(item[source.value] ?? item.id);
                      const label = String(item[source.display] ?? "");
                      onChange(itemId);
                      setSelectedLabel(label);
                      setOpen(false);
                      setSearch("");
                    }}
                    left={(props) =>
                      String(item[source.value] ?? item.id) === String(value) ? (
                        <List.Icon {...props} icon="check" color={colors.primary} />
                      ) : null
                    }
                  />
                )}
                ListEmptyComponent={
                  <Text style={styles.empty}>
                    {search ? `Aucun résultat pour "${search}"` : "Aucune donnée"}
                  </Text>
                }
              />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            {Boolean(value) && (
              <Button
                onPress={() => {
                  onChange(null);
                  setSelectedLabel("");
                  setOpen(false);
                }}
                textColor={colors.danger}
              >
                Effacer
              </Button>
            )}
            <Button onPress={() => setOpen(false)}>Fermer</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { borderRadius: 4 },
  triggerInner: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    minHeight: 56,
    justifyContent: "center",
  },
  triggerError: { borderColor: colors.danger },
  triggerLabel: { color: colors.textSecondary, marginBottom: 2 },
  triggerValue: { color: colors.textPrimary },
  triggerPlaceholder: { color: colors.textMuted },
  dialog: { maxHeight: "85%" },
  content: { paddingHorizontal: 0 },
  searchbar: { marginHorizontal: 16, marginBottom: 8, elevation: 0 },
  list: { maxHeight: 380 },
  loadingContainer: { padding: 24, alignItems: "center" },
  empty: { textAlign: "center", padding: 24, color: colors.textMuted },
});
