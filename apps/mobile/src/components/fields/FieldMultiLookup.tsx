/**
 * Multi-lookup field — search and select multiple items from a server entity.
 *
 * Displays selected items as chips, opens a search dialog to add more.
 */

import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Chip,
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
  onChange: (value: string[]) => void;
}

interface LookupItem {
  id: string;
  [key: string]: unknown;
}

export default function FieldMultiLookup({ field, value, error, required, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>({});

  const selected = Array.isArray(value) ? (value as string[]) : [];
  const source = field.lookup_source!;
  if (!field.lookup_source) return null;

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
          list = Array.isArray(result.data) ? result.data : result.data?.items ?? [];
        } catch {
          const cached = await getCachedLookup(source.endpoint);
          list = (cached as LookupItem[]) ?? [];
          if (query && source.display) {
            const q = query.toLowerCase();
            list = list.filter((item) =>
              String(item[source.display] ?? "").toLowerCase().includes(q)
            );
          }
        }
        setItems(list);
      } catch {
        // keep existing
      } finally {
        setLoading(false);
      }
    },
    [source]
  );

  function toggleItem(item: LookupItem) {
    const itemId = String(item[source.value] ?? item.id);
    const label = String(item[source.display] ?? "");

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
    <>
      <TouchableRipple onPress={() => { setOpen(true); doSearch(""); }} style={styles.trigger}>
        <View style={[styles.triggerInner, error ? styles.triggerError : null]}>
          <Text variant="bodySmall" style={styles.triggerLabel}>
            {field.label}{required ? " *" : ""} ({selected.length})
          </Text>
          {selected.length > 0 ? (
            <View style={styles.chipRow}>
              {selected.slice(0, 4).map((id) => (
                <Chip
                  key={id}
                  compact
                  onClose={() => onChange(selected.filter((s) => s !== id))}
                  style={styles.chip}
                >
                  {selectedLabels[id] ?? id.slice(0, 8)}
                </Chip>
              ))}
              {selected.length > 4 && (
                <Chip compact style={styles.chip}>+{selected.length - 4}</Chip>
              )}
            </View>
          ) : (
            <Text variant="bodyLarge" style={styles.placeholder}>
              {field.placeholder ?? "Rechercher..."}
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
          <Dialog.Content style={styles.dialogContent}>
            <Searchbar
              placeholder="Rechercher..."
              value={search}
              onChangeText={(t) => { setSearch(t); doSearch(t); }}
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
                renderItem={({ item }) => {
                  const itemId = String(item[source.value] ?? item.id);
                  const isSelected = selected.includes(itemId);
                  return (
                    <List.Item
                      title={String(item[source.display] ?? "")}
                      onPress={() => toggleItem(item)}
                      left={(props) => (
                        <List.Icon
                          {...props}
                          icon={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                          color={isSelected ? colors.primary : colors.textMuted}
                        />
                      )}
                    />
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.empty}>Aucun résultat</Text>
                }
              />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>
              OK ({selected.length} sélectionné{selected.length > 1 ? "s" : ""})
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { borderRadius: 4 },
  triggerInner: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 4,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface,
  },
  triggerError: { borderColor: colors.danger },
  triggerLabel: { color: colors.textSecondary, marginBottom: 4 },
  placeholder: { color: colors.textMuted },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: { height: 28 },
  dialog: { maxHeight: "80%" },
  dialogContent: { paddingHorizontal: 0 },
  searchbar: { marginHorizontal: 16, marginBottom: 8 },
  list: { maxHeight: 300 },
  loadingContainer: { padding: 24, alignItems: "center" },
  empty: { textAlign: "center", padding: 24, color: colors.textMuted },
});
