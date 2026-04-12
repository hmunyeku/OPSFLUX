/**
 * Dynamic Form Screen — fetches a form definition by ID and renders it.
 *
 * This is the generic screen for all server-defined forms.
 * It receives a form_id via navigation params, looks it up in
 * the cached form registry, and passes it to DynamicForm.
 */

import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import DynamicForm from "../components/DynamicForm";
import { useFormRegistry } from "../hooks/useFormRegistry";
import { colors } from "../utils/colors";
import type { FormDefinition } from "../types/forms";

interface Props {
  route: {
    params: {
      formId: string;
      /** Pre-loaded form definition (skip fetch if available). */
      formDef?: FormDefinition;
    };
  };
  navigation: any;
}

export default function DynamicFormScreen({ route, navigation }: Props) {
  const { formId, formDef: preloaded } = route.params;
  const { forms, loading } = useFormRegistry();

  const form = preloaded ?? forms.find((f) => f.id === formId);

  if (loading && !form) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="bodyMedium" style={styles.loadingText}>
          Chargement du formulaire...
        </Text>
      </View>
    );
  }

  if (!form) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={styles.errorText}>
          Formulaire introuvable
        </Text>
        <Text variant="bodyMedium" style={styles.errorDetail}>
          Le formulaire "{formId}" n'est pas disponible.
        </Text>
      </View>
    );
  }

  return (
    <DynamicForm
      form={form}
      onSuccess={() => navigation.goBack()}
      onCancel={() => navigation.goBack()}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  errorDetail: {
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
});
