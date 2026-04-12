/**
 * Lookup field — searches server entities with offline cache fallback.
 *
 * Displays a searchable modal that queries the API endpoint
 * defined in the field's lookup_source configuration.
 */

import React, { useCallback, useEffect, useState } from "react";
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

  const source = field.lookup_source;
  if (!source) return null;

  // Resolve display label for current value
  useEffect(() => {
    if (!value) {
      setSelectedLabel("");
      return;
    }
    // Try to find in already-loaded items
    const found = items.find((i) => i[source.value] === value);
    if (found) {
      setSelectedLabel(String(found[source.display] ?? ""));
    }
  }, [value, items]);

  const doSearch = useCallback(
    async (query: string) => {
      if (!source.endpoint) return;
      setLoading(true);
      try {
        const params: Record<string, unknown> = {
          ...(source.filter || {}),
          page_size: 20,
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
          // Offline — fallback to pre-fetched lookup cache
          const cached = await getCachedLookup(source.endpoint);
          if (cached) {
            list = cached as LookupItem[];
            // Client-side filter if we have a search query
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
      } catch {
        // Keep existing items on error
      } finally {
        setLoading(false);
      }
    },
    [source]
  );

  useEffect(() => {
    if (open) doSearch(search);
  }, [open]);

  return (
    <>
      <TouchableRipple onPress={() => setOpen(true)} style={styles.trigger}>
        <View style={[styles.triggerInner, error ? styles.triggerError : null]}>
          <Text variant="bodySmall" style={styles.triggerLabel}>
            {field.label}{required ? " *" : ""}
          </Text>
          <Text
            variant="bodyLarge"
            style={selectedLabel ? styles.triggerValue : styles.triggerPlaceholder}
            numberOfLines={1}
          >
            {selectedLabel || field.placeholder || "Rechercher..."}
          </Text>
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
              placeholder="Rechercher..."
              value={search}
              onChangeText={(text) => {
                setSearch(text);
                doSearch(text);
              }}
              style={styles.searchbar}
            />
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" />
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => String(item[source.value] ?? item.id)}
                style={styles.list}
                ItemSeparatorComponent={Divider}
                renderItem={({ item }) => (
                  <List.Item
                    title={String(item[source.display] ?? "")}
                    onPress={() => {
                      onChange(String(item[source.value] ?? item.id));
                      setSelectedLabel(String(item[source.display] ?? ""));
                      setOpen(false);
                    }}
                    left={(props) =>
                      String(item[source.value]) === String(value) ? (
                        <List.Icon {...props} icon="check" color={colors.primary} />
                      ) : null
                    }
                  />
                )}
                ListEmptyComponent={
                  <Text style={styles.empty}>Aucun résultat</Text>
                }
              />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            {value && (
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
  },
  triggerError: { borderColor: colors.danger },
  triggerLabel: { color: colors.textSecondary, marginBottom: 2 },
  triggerValue: { color: colors.textPrimary },
  triggerPlaceholder: { color: colors.textMuted },
  dialog: { maxHeight: "80%" },
  content: { paddingHorizontal: 0 },
  searchbar: { marginHorizontal: 16, marginBottom: 8 },
  list: { maxHeight: 300 },
  loadingContainer: { padding: 24, alignItems: "center" },
  empty: { textAlign: "center", padding: 24, color: colors.textMuted },
});
