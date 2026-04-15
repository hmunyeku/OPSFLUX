/**
 * FieldShell — chrome partagé pour tous les form fields.
 *
 * Fournit:
 *   - Le label avec l'asterisque si required
 *   - Le conteneur de l'input (rendu via children) avec bordure + focus state
 *   - Le helper text / message d'erreur
 *
 * Remplace les `TextInput mode="outlined"` de react-native-paper pour
 * uniformiser le look avec le reste de l'app (Gluestack). Toute la
 * famille de form fields utilise ce shell.
 */

import React, { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@gluestack-ui/themed";
import { colors } from "../../utils/colors";
import { spacing } from "../../utils/design";

interface Props {
  label: string;
  required?: boolean;
  error?: string;
  helpText?: string;
  /** Input widget — TextInput, date picker trigger, toggle, etc. */
  children: ReactNode;
  /** Optional header-right slot (ex: clear button). */
  rightSlot?: ReactNode;
  /** Remove the container border (for fields that render their own box). */
  bare?: boolean;
}

export default function FieldShell({
  label,
  required,
  error,
  helpText,
  children,
  rightSlot,
  bare,
}: Props) {
  const borderColor = error
    ? colors.danger
    : colors.border;

  return (
    <View style={styles.root}>
      <View style={styles.labelRow}>
        <Text
          size="xs"
          fontWeight="$medium"
          color="$textLight600"
          style={styles.label}
        >
          {label}
          {required ? <Text color="$error600"> *</Text> : null}
        </Text>
        {rightSlot ? <View>{rightSlot}</View> : null}
      </View>
      <View
        style={[
          bare ? null : styles.container,
          bare ? null : { borderColor },
        ]}
      >
        {children}
      </View>
      {(error || helpText) && (
        <Text
          size="2xs"
          color={error ? "$error600" : "$textLight500"}
          style={styles.helper}
        >
          {error || helpText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: {
    letterSpacing: 0.2,
  },
  container: {
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: colors.surface,
    minHeight: 44,
    justifyContent: "center",
  },
  helper: {
    marginTop: 4,
    marginLeft: 2,
  },
});
