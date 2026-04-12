import React from "react";
import { StyleSheet, View } from "react-native";
import { HelperText, Switch, Text } from "react-native-paper";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";

interface Props {
  field: FieldDefinition;
  fieldName: string;
  value: unknown;
  error?: string;
  required: boolean;
  onChange: (value: boolean) => void;
}

export default function FieldToggle({ field, value, error, required, onChange }: Props) {
  return (
    <>
      <View style={styles.row}>
        <View style={styles.labelContainer}>
          <Text variant="bodyLarge" style={styles.label}>
            {field.label}{required ? " *" : ""}
          </Text>
          {field.help_text && (
            <Text variant="bodySmall" style={styles.help}>
              {field.help_text}
            </Text>
          )}
        </View>
        <Switch
          value={!!value}
          onValueChange={onChange}
          color={colors.primary}
        />
      </View>
      {error && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  labelContainer: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    color: colors.textPrimary,
  },
  help: {
    color: colors.textSecondary,
    marginTop: 2,
  },
});
