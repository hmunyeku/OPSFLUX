/**
 * FieldText / Email / URL / Textarea — text input via Gluestack.
 *
 * Rewritten off react-native-paper to eliminate the "texte invisible"
 * bug and the dual-UI-lib inconsistency. Uses FieldShell for label +
 * error chrome.
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
  onChange: (value: string) => void;
}

export default function FieldText({ field, value, error, required, onChange }: Props) {
  const isTextarea = field.type === "textarea";
  const keyboardType =
    field.type === "email"
      ? "email-address"
      : field.type === "url"
      ? "url"
      : "default";
  const autoCapitalize =
    field.type === "email" || field.type === "url" ? "none" : "sentences";

  return (
    <FieldShell
      label={field.label}
      required={required}
      error={error}
      helpText={field.help_text}
    >
      <TextInput
        style={[styles.input, isTextarea ? styles.textarea : null]}
        placeholder={field.placeholder}
        placeholderTextColor={colors.textMuted}
        value={String(value ?? "")}
        onChangeText={onChange}
        multiline={isTextarea}
        numberOfLines={isTextarea ? 4 : 1}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={keyboardType === "default"}
      />
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    // Force text color — fixes the "texte invisible" reports where the
    // default RN input color was picking up a grey from the OS theme.
    color: colors.textPrimary,
  },
  textarea: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: "top",
  },
});
