/**
 * FieldRepeater — dynamic list of sub-forms via Gluestack cards.
 */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, ButtonText, Text } from "@gluestack-ui/themed";
import { MIcon } from "../MIcon";
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

export default function FieldRepeater({
  field,
  value,
  error,
  required,
  onChange,
}: Props) {
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const itemFields = field.item_fields ?? {};
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
    <View style={{ marginBottom: 16 }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text
            size="xs"
            fontWeight="$semibold"
            color="$textLight600"
            textTransform="uppercase"
            letterSpacing={0.3}
          >
            {field.label}
            {required ? <Text color="$error600"> *</Text> : null}
          </Text>
          {field.help_text && (
            <Text size="2xs" color="$textLight500" mt="$0.5">
              {field.help_text}
            </Text>
          )}
        </View>
        <Button
          action="primary"
          variant="outline"
          size="sm"
          onPress={addItem}
        >
          <MIcon name="add" size="xs" color="$primary700" mr="$1" />
          <ButtonText>Ajouter</ButtonText>
        </Button>
      </View>

      {items.map((item, idx) => (
        <View key={idx} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <Text
              size="sm"
              fontWeight="$bold"
              color="$primary700"
              textTransform="uppercase"
              letterSpacing={0.3}
            >
              Item #{idx + 1}
            </Text>
            <Pressable
              onPress={() => removeItem(idx)}
              hitSlop={6}
              style={styles.removeBtn}
            >
              <MIcon name="close" size="sm" color="$error600" />
            </Pressable>
          </View>
          {orderedFieldNames.map((fn) => {
            const itemField = itemFields[fn];
            if (!itemField) return null;
            const subValue = item[fn];
            const subRequired = itemField.required ?? false;
            return (
              <View key={fn}>
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
        </View>
      ))}

      {items.length === 0 && (
        <View style={styles.emptyCard}>
          <Text
            size="sm"
            color="$textLight500"
            italic
            textAlign="center"
          >
            Aucun élément — cliquez sur "Ajouter" pour en créer un.
          </Text>
        </View>
      )}

      {error && (
        <Text size="2xs" color="$error600" mt="$1">
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
    marginBottom: 12,
    gap: 8,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 12,
    marginBottom: 10,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  removeBtn: {
    padding: 4,
  },
  emptyCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 12,
    padding: 24,
  },
});
