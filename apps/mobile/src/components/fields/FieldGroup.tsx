/**
 * FieldGroup — visual section/card containing sub-fields.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@gluestack-ui/themed";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";

interface Props {
  field: FieldDefinition;
  fieldName: string;
  value: unknown;
  error?: string;
  required: boolean;
  onChange: (value: unknown) => void;
}

export default function FieldGroup({ field, error }: Props) {
  return (
    <View style={styles.card}>
      <Text
        size="sm"
        fontWeight="$bold"
        color="$primary700"
        style={styles.title}
      >
        {field.label}
      </Text>
      {field.help_text && (
        <Text size="xs" color="$textLight500" mt="$1">
          {field.help_text}
        </Text>
      )}
      {error && (
        <Text size="2xs" color="$error600" mt="$2">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  title: {
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
