/**
 * DynamicForm — renders any form from a server-provided JSON definition.
 *
 * This is the core of the mobile app's form engine.
 * It uses useFormEngine for state management and renders
 * the appropriate field component for each field type.
 *
 * Features:
 *  - Multi-step wizard with animated transitions
 *  - Step progress indicator
 *  - Conditional field visibility
 *  - Inline validation with error messages
 *  - Submit with offline queue fallback
 *  - Responsive layout (half/full width fields on tablets)
 */

import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Card,
  Divider,
  ProgressBar,
  Surface,
  Text,
} from "react-native-paper";
import { useFormEngine } from "../hooks/useFormEngine";
import { useResponsive } from "../hooks/useResponsive";
import {
  FieldText,
  FieldNumber,
  FieldSelect,
  FieldDate,
  FieldToggle,
  FieldLookup,
  FieldPhoto,
  FieldBarcode,
  FieldSignature,
  FieldLocation,
  FieldRepeater,
  FieldMultiSelect,
  FieldTags,
  FieldGroup,
  FieldMultiLookup,
} from "./fields";
import type { FieldDefinition, FormDefinition } from "../types/forms";
import { colors } from "../utils/colors";

interface Props {
  form: FormDefinition;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function DynamicForm({ form, onSuccess, onCancel }: Props) {
  const engine = useFormEngine(form);
  const { deviceType, contentPadding } = useResponsive();
  const isTablet = deviceType === "tablet";

  // ── Success State ─────────────────────────────────────────────────

  if (engine.submitted) {
    return (
      <View style={styles.successContainer}>
        <Surface style={styles.successCard} elevation={2}>
          <Text variant="headlineMedium" style={styles.successIcon}>
            {engine.queuedOffline ? "~" : "\u2713"}
          </Text>
          <Text variant="titleLarge" style={styles.successTitle}>
            {engine.queuedOffline
              ? "Enregistré hors-ligne"
              : "Soumis avec succès"}
          </Text>
          <Text variant="bodyMedium" style={styles.successMessage}>
            {engine.queuedOffline
              ? "Votre demande sera envoyée automatiquement dès que la connexion sera rétablie."
              : "Votre demande a été envoyée avec succès."}
          </Text>
          <View style={styles.successActions}>
            <Button mode="contained" onPress={onSuccess ?? engine.reset}>
              Terminé
            </Button>
            <Button mode="outlined" onPress={engine.reset} style={{ marginTop: 8 }}>
              Nouvelle demande
            </Button>
          </View>
        </Surface>
      </View>
    );
  }

  // ── Step Progress ─────────────────────────────────────────────────

  const progress = engine.totalSteps > 1
    ? (engine.currentStep + 1) / engine.totalSteps
    : 1;

  // ── Field Renderer ────────────────────────────────────────────────

  function renderField(fieldName: string) {
    const field = form.fields[fieldName];
    if (!field) return null;

    const value = engine.values[fieldName];
    const error = engine.errors[fieldName];
    const required = engine.isFieldRequired(fieldName);
    const halfWidth = isTablet && field.ui_width === "half";

    const fieldElement = renderFieldByType(
      field,
      fieldName,
      value,
      error,
      required,
      engine.setValue
    );

    return (
      <View
        key={fieldName}
        style={[styles.fieldWrapper, halfWidth && styles.fieldHalf]}
      >
        {fieldElement}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <Surface style={styles.header} elevation={1}>
        <Text variant="titleLarge" style={styles.headerTitle}>
          {form.title}
        </Text>
        {engine.totalSteps > 1 && (
          <>
            <View style={styles.stepInfo}>
              <Text variant="bodySmall" style={styles.stepLabel}>
                Étape {engine.currentStep + 1} sur {engine.totalSteps}
              </Text>
              <Text variant="titleSmall" style={styles.stepTitle}>
                {engine.currentStepDef?.title}
              </Text>
            </View>
            <ProgressBar
              progress={progress}
              color={colors.primary}
              style={styles.progressBar}
            />
          </>
        )}
      </Surface>

      {/* Form body */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { padding: contentPadding },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {engine.currentStepDef?.description ? (
          <Text variant="bodyMedium" style={styles.stepDescription}>
            {engine.currentStepDef.description}
          </Text>
        ) : null}

        <View style={[styles.fieldsContainer, isTablet && styles.fieldsRow]}>
          {engine.visibleFieldsInStep.map((fn) => renderField(fn))}
        </View>

        {engine.submitError && (
          <Surface style={styles.errorBanner} elevation={1}>
            <Text variant="bodyMedium" style={styles.errorText}>
              {engine.submitError}
            </Text>
          </Surface>
        )}
      </ScrollView>

      {/* Footer navigation */}
      <Surface style={styles.footer} elevation={2}>
        <View style={styles.footerRow}>
          {engine.canGoPrev ? (
            <Button
              mode="outlined"
              onPress={engine.goPrev}
              style={styles.footerButton}
            >
              Précédent
            </Button>
          ) : onCancel ? (
            <Button
              mode="outlined"
              onPress={onCancel}
              style={styles.footerButton}
            >
              Annuler
            </Button>
          ) : (
            <View style={styles.footerButton} />
          )}

          {engine.isLastStep ? (
            <Button
              mode="contained"
              onPress={engine.submit}
              loading={engine.submitting}
              disabled={engine.submitting}
              style={styles.footerButton}
              buttonColor={colors.success}
            >
              Soumettre
            </Button>
          ) : (
            <Button
              mode="contained"
              onPress={engine.goNext}
              style={styles.footerButton}
            >
              Suivant
            </Button>
          )}
        </View>
      </Surface>
    </KeyboardAvoidingView>
  );
}

// ── Field Type Router ──────────────────────────────────────────────────

function renderFieldByType(
  field: FieldDefinition,
  fieldName: string,
  value: unknown,
  error: string | undefined,
  required: boolean,
  onChange: (name: string, value: unknown) => void
): React.ReactElement | null {
  const props = {
    field,
    fieldName,
    value,
    error,
    required,
  };

  switch (field.type) {
    case "text":
    case "textarea":
    case "email":
    case "url":
      return (
        <FieldText
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "integer":
    case "decimal":
      return (
        <FieldNumber
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "select":
      return (
        <FieldSelect
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "date":
    case "datetime":
      return (
        <FieldDate
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "toggle":
      return (
        <FieldToggle
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "lookup":
      return (
        <FieldLookup
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "multi_lookup":
      return (
        <FieldMultiLookup
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "photo":
      return (
        <FieldPhoto
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "barcode":
      return (
        <FieldBarcode
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "signature":
      return (
        <FieldSignature
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "location":
      return (
        <FieldLocation
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "repeater":
      return (
        <FieldRepeater
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "multi_select":
      return (
        <FieldMultiSelect
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "tags":
      return (
        <FieldTags
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "group":
      return (
        <FieldGroup
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "computed":
    case "readonly":
      return (
        <View style={rsStyles.readonlyField}>
          <Text variant="bodySmall" style={rsStyles.readonlyLabel}>
            {field.label}
          </Text>
          <Text variant="bodyLarge" style={rsStyles.readonlyValue}>
            {String(value ?? "—")}
          </Text>
        </View>
      );

    default:
      return (
        <FieldText
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );
  }
}

const rsStyles = StyleSheet.create({
  readonlyField: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  readonlyLabel: { color: colors.textSecondary, marginBottom: 2 },
  readonlyValue: { color: colors.textPrimary },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontWeight: "700",
    color: colors.primary,
  },
  stepInfo: {
    marginTop: 8,
  },
  stepLabel: {
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stepTitle: {
    color: colors.textPrimary,
    fontWeight: "600",
    marginTop: 2,
  },
  progressBar: {
    marginTop: 10,
    borderRadius: 4,
    height: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  stepDescription: {
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 22,
  },
  fieldsContainer: {
    gap: 14,
  },
  fieldsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  fieldWrapper: {
    width: "100%",
  },
  fieldHalf: {
    width: "48%",
    marginRight: "4%",
  },
  errorBanner: {
    backgroundColor: colors.danger + "10",
    borderRadius: 8,
    padding: 14,
    marginTop: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
  },
  footer: {
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  footerButton: {
    flex: 1,
  },
  // Success screen
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  successCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    maxWidth: 400,
    width: "100%",
  },
  successIcon: {
    fontSize: 48,
    color: colors.success,
    marginBottom: 16,
  },
  successTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  successMessage: {
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  successActions: {
    width: "100%",
  },
});
