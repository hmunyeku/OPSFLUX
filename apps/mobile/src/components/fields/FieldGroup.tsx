/**
 * Group field — visual section/card containing sub-fields.
 * Currently renders as a titled card with a hint that sub-fields
 * are handled at the step level.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, HelperText, Text } from "react-native-paper";
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
    <Card style={styles.card} mode="outlined">
      <Card.Content>
        <Text variant="titleSmall" style={styles.title}>
          {field.label}
        </Text>
        {field.help_text && (
          <Text variant="bodySmall" style={styles.help}>
            {field.help_text}
          </Text>
        )}
      </Card.Content>
      {error && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: colors.border },
  title: { fontWeight: "700", color: colors.primary },
  help: { color: colors.textSecondary, marginTop: 4 },
});
