/**
 * FieldToggle — boolean switch via Gluestack (rewritten off Paper).
 */

import React from "react";
import { StyleSheet, Switch, View } from "react-native";
import { Text } from "@gluestack-ui/themed";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";
import { spacing } from "../../utils/design";

interface Props {
  field: FieldDefinition;
  fieldName: string;
  value: unknown;
  error?: string;
  required: boolean;
  onChange: (value: boolean) => void;
}

export default function FieldToggle({
  field,
  value,
  error,
  required,
  onChange,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.labelContainer}>
          <Text size="md" color="$textLight900" fontWeight="$medium">
            {field.label}
            {required ? (
              <Text color="$error600"> *</Text>
            ) : null}
          </Text>
          {field.help_text && (
            <Text size="xs" color="$textLight500" mt="$1">
              {field.help_text}
            </Text>
          )}
        </View>
        <Switch
          value={!!value}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#ffffff"
          ios_backgroundColor={colors.border}
        />
      </View>
      {error && (
        <Text size="2xs" color="$error600" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  labelContainer: {
    flex: 1,
    marginRight: 12,
  },
  error: {
    marginTop: 4,
    marginLeft: 2,
  },
});
