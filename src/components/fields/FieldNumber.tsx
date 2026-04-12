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
  onChange: (value: number | null) => void;
}

export default function FieldNumber({ field, value, error, required, onChange }: Props) {
  const displayValue = value !== null && value !== undefined ? String(value) : "";

  return (
    <>
      <TextInput
        mode="outlined"
        label={field.label + (required ? " *" : "")}
        placeholder={field.placeholder}
        value={displayValue}
        onChangeText={(text) => {
          if (text === "") {
            onChange(null);
            return;
          }
          const num = field.type === "integer" ? parseInt(text, 10) : parseFloat(text);
          if (!isNaN(num)) onChange(num);
        }}
        error={!!error}
        keyboardType={field.type === "integer" ? "number-pad" : "decimal-pad"}
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
