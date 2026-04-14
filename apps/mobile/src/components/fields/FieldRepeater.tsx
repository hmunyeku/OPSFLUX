/**
 * Repeater field — dynamic list of sub-forms.
 *
 * Renders each item using the SAME field renderers as top-level fields
 * (text, lookup, select, date, etc.) based on the item_fields definition.
 *
 * This uses the DynamicFieldRenderer shared with DynamicForm so that
 * nested lookups, selects with options, and all other types work.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, IconButton, Text } from "react-native-paper";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";
import { renderFieldByType } from "./renderField";

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

  // Order sub-fields by their declared order
  const orderedFieldNames = Object.entries(itemFields)
    .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
    .map(([name]) => name);

  function addItem() {
    const empty: Record<string, unknown> = {};
    for (const fn of orderedFieldNames) {
      const f = itemFields[fn];
      if (f.default !== undefined) empty[fn] = f.default;
      else if (f.type === "toggle") empty[fn] = false;
      else if (f.type === "tags" || f.type === "multi_lookup") empty[fn] = [];
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
        <View style={{ flex: 1 }}>
          <Text variant="bodySmall" style={styles.label}>
            {field.label}{required ? " *" : ""}
          </Text>
          {field.help_text && (
            <Text variant="bodySmall" style={styles.help}>
              {field.help_text}
            </Text>
          )}
        </View>
        <Button mode="outlined" compact onPress={addItem} icon="plus">
          Ajouter
        </Button>
      </View>

      {items.map((item, idx) => (
        <Card key={idx} style={styles.itemCard} mode="outlined">
          <Card.Content>
            <View style={styles.itemHeader}>
              <Text variant="titleSmall" style={styles.itemIndex}>
                Item #{idx + 1}
              </Text>
              <IconButton
                icon="close"
                size={18}
                onPress={() => removeItem(idx)}
                iconColor={colors.danger}
              />
            </View>
            {orderedFieldNames.map((fn) => {
              const itemField = itemFields[fn];
              if (!itemField) return null;
              const subValue = item[fn];
              const subRequired = itemField.required ?? false;

              return (
                <View key={fn} style={styles.subField}>
                  {renderFieldByType(
                    itemField,
                    fn,
                    subValue,
                    undefined,
                    subRequired,
                    (_name, v) => updateItem(idx, fn, v)
                  )}
                </View>
              );
            })}
          </Card.Content>
        </Card>
      ))}

      {items.length === 0 && (
        <Card style={styles.emptyCard} mode="outlined">
          <Card.Content>
            <Text variant="bodyMedium" style={styles.emptyText}>
              Aucun élément — cliquez sur "Ajouter" pour en créer un.
            </Text>
          </Card.Content>
        </Card>
      )}

      {error && (
        <Text variant="bodySmall" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  label: { color: colors.textSecondary, fontWeight: "600" },
  help: { color: colors.textMuted, marginTop: 2 },
  itemCard: { marginBottom: 10, borderColor: colors.border },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  itemIndex: { fontWeight: "700", color: colors.primary },
  subField: { marginBottom: 12 },
  emptyCard: { borderStyle: "dashed", borderColor: colors.border },
  emptyText: {
    color: colors.textMuted,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
  },
  error: { color: colors.danger, marginTop: 4, paddingHorizontal: 4 },
});
