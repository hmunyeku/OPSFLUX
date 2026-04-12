/**
 * Repeater field — dynamic list of sub-forms (e.g. pax_entries, line items).
 *
 * Renders a card for each item with add/remove controls.
 * Each item's fields are rendered using the item_fields definition.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Divider, IconButton, Text, TextInput } from "react-native-paper";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";

interface Props {
  field: FieldDefinition;
  fieldName: string;
  value: unknown;
  error?: string;
  required: boolean;
  onChange: (value: Record<string, unknown>[]) => void;
}

export default function FieldRepeater({ field, value, error, required, onChange }: Props) {
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const itemFields = field.item_fields ?? {};
  const fieldNames = Object.keys(itemFields);

  function addItem() {
    const empty: Record<string, unknown> = {};
    for (const fn of fieldNames) {
      empty[fn] = null;
    }
    onChange([...items, empty]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, fieldKey: string, val: unknown) {
    const updated = items.map((item, i) =>
      i === index ? { ...item, [fieldKey]: val } : item
    );
    onChange(updated);
  }

  return (
    <View>
      <View style={styles.header}>
        <Text variant="bodySmall" style={styles.label}>
          {field.label}{required ? " *" : ""} ({items.length})
        </Text>
        <Button mode="outlined" compact onPress={addItem} icon="plus">
          Ajouter
        </Button>
      </View>

      {items.map((item, idx) => (
        <Card key={idx} style={styles.itemCard}>
          <Card.Content>
            <View style={styles.itemHeader}>
              <Text variant="titleSmall" style={styles.itemIndex}>
                #{idx + 1}
              </Text>
              <IconButton
                icon="close"
                size={18}
                onPress={() => removeItem(idx)}
                iconColor={colors.danger}
              />
            </View>
            {fieldNames.map((fn) => {
              const itemField = itemFields[fn];
              if (!itemField) return null;
              return (
                <View key={fn} style={styles.subField}>
                  <TextInput
                    mode="outlined"
                    label={itemField.label}
                    value={String(item[fn] ?? "")}
                    onChangeText={(text) => updateItem(idx, fn, text || null)}
                    dense
                    style={styles.subInput}
                    outlineColor={colors.border}
                    activeOutlineColor={colors.primary}
                  />
                </View>
              );
            })}
          </Card.Content>
        </Card>
      ))}

      {error && (
        <Text variant="bodySmall" style={styles.error}>
          {error}
        </Text>
      )}
      {field.help_text && !error && (
        <Text variant="bodySmall" style={styles.help}>
          {field.help_text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: { color: colors.textSecondary },
  itemCard: { marginBottom: 8, borderRadius: 10 },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  itemIndex: { fontWeight: "700", color: colors.primary },
  subField: { marginBottom: 8 },
  subInput: { backgroundColor: colors.surface },
  error: { color: colors.danger, marginTop: 4, paddingHorizontal: 4 },
  help: { color: colors.textSecondary, marginTop: 4, paddingHorizontal: 4 },
});
