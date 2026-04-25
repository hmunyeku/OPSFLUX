import React from "react";
import { TextInput, HelperText } from "react-native-paper";
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

  return (
    <>
      <TextInput
        mode="outlined"
        label={field.label + (required ? " *" : "")}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChangeText={onChange}
        error={!!error}
        multiline={isTextarea}
        numberOfLines={isTextarea ? 4 : 1}
        keyboardType={
          field.type === "email" ? "email-address" :
          field.type === "url" ? "url" :
          "default"
        }
        autoCapitalize={field.type === "email" || field.type === "url" ? "none" : "sentences"}
        outlineColor={colors.border}
        activeOutlineColor={colors.primary}
        style={{ backgroundColor: colors.surface }}
      />
      {(error || field.help_text) && (
        <HelperText type={error ? "error" : "info"} visible>
          {error || field.help_text}
        </HelperText>
      )}
    </>
  );
}
