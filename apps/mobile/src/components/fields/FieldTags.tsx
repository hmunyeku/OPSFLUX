/**
 * Tags field — free-text tag input with chip display.
 */

import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Chip, HelperText, Text, TextInput } from "react-native-paper";
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

export default function FieldTags({ field, value, error, required, onChange }: Props) {
  const tags = Array.isArray(value) ? (value as string[]) : [];
  const [input, setInput] = useState("");

  function addTag() {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <View>
      <Text variant="bodySmall" style={styles.label}>
        {field.label}{required ? " *" : ""}
      </Text>

      {tags.length > 0 && (
        <View style={styles.chipRow}>
          {tags.map((tag) => (
            <Chip
              key={tag}
              onClose={() => removeTag(tag)}
              compact
              style={styles.chip}
            >
              {tag}
            </Chip>
          ))}
        </View>
      )}

      <TextInput
        mode="outlined"
        placeholder={field.placeholder ?? "Ajouter un tag..."}
        value={input}
        onChangeText={setInput}
        onSubmitEditing={addTag}
        right={<TextInput.Icon icon="plus" onPress={addTag} />}
        dense
        outlineColor={colors.border}
        activeOutlineColor={colors.primary}
        style={styles.input}
      />

      {(error || field.help_text) && (
        <HelperText type={error ? "error" : "info"} visible>
          {error || field.help_text}
        </HelperText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textSecondary, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: {},
  input: { backgroundColor: colors.surface },
});
