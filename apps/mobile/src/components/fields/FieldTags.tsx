/**
 * FieldTags — free-text tag input via Gluestack chrome.
 */

import React, { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@gluestack-ui/themed";
import { MIcon } from "../MIcon";
import FieldShell from "./FieldShell";
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

export default function FieldTags({
  field,
  value,
  error,
  required,
  onChange,
}: Props) {
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
    <FieldShell
      label={field.label}
      required={required}
      error={error}
      helpText={field.help_text}
      bare
    >
      {tags.length > 0 && (
        <View style={styles.chipRow}>
          {tags.map((tag) => (
            <Pressable
              key={tag}
              style={styles.chip}
              onPress={() => removeTag(tag)}
            >
              <Text size="xs" color="$primary800">
                {tag}
              </Text>
              <MIcon name="close" size="2xs" color="$primary700" ml="$1" />
            </Pressable>
          ))}
        </View>
      )}
      <View style={[styles.inputBox, error ? styles.inputBoxError : null]}>
        <TextInput
          style={styles.input}
          placeholder={field.placeholder ?? "Ajouter un tag…"}
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={addTag}
          blurOnSubmit={false}
          autoCorrect={false}
        />
        <Pressable onPress={addTag} style={styles.addBtn} hitSlop={8}>
          <MIcon name="add" size="sm" color="$primary700" />
        </Pressable>
      </View>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  inputBoxError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  addBtn: {
    paddingHorizontal: 12,
    height: "100%",
    justifyContent: "center",
  },
});
