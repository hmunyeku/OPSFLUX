/**
 * FieldNumber — integer / decimal input via Gluestack shell.
 */

import React from "react";
import { StyleSheet, TextInput } from "react-native";
import FieldShell from "./FieldShell";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";

interface Props {
  field: FieldDefinition;
  fieldName: string;
  value: unknown;
  error?: string;
  required: boolean;
  onChange: (value: number | null) => void;
}

export default function FieldNumber({ field, value, error, required, onChange }: Props) {
  const displayValue = value !== null && value !== undefined ? String(value) : "";
  return (
    <FieldShell
      label={field.label}
      required={required}
      error={error}
      helpText={field.help_text}
    >
      <TextInput
        style={styles.input}
        placeholder={field.placeholder}
        placeholderTextColor={colors.textMuted}
        value={displayValue}
        onChangeText={(text) => {
          if (text === "") {
            onChange(null);
            return;
          }
          const num = field.type === "integer" ? parseInt(text, 10) : parseFloat(text);
          if (!isNaN(num)) onChange(num);
        }}
        keyboardType={field.type === "integer" ? "number-pad" : "decimal-pad"}
      />
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
});
