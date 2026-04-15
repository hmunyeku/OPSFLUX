/**
 * DynamicForm — Gluestack refonte: renders any form from a server-provided JSON.
 *
 * Multi-step wizard, conditional visibility, inline validation, offline queue.
 * All strings via t() so the server-driven catalog applies.
 */

import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import {
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Heading,
  HStack,

  Progress,
  ProgressFilledTrack,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { SuccessCheck, NoConnection } from "../components/illustrations";
import { useTranslation } from "react-i18next";
import { useFormEngine } from "../hooks/useFormEngine";
import { useResponsive } from "../hooks/useResponsive";
import { renderFieldByType } from "./fields/renderField";
import type { FormDefinition } from "../types/forms";

interface Props {
  form: FormDefinition;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function DynamicForm({ form, onSuccess, onCancel }: Props) {
  const engine = useFormEngine(form);
  const { deviceType, contentPadding } = useResponsive();
  const isTablet = deviceType === "tablet";
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  /* ── Success state ────────────────────────────────────────────── */
  if (engine.submitted) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center" p="$6">
        <Box maxWidth={400} w="$full" bg="$white" borderRadius="$xl" p="$8" alignItems="center">
          <Box mb="$4">
            {engine.queuedOffline ? <NoConnection width={180} /> : <SuccessCheck width={180} />}
          </Box>
          <Heading size="xl" color="$textLight900" textAlign="center" mb="$2">
            {engine.queuedOffline
              ? t("form.savedOffline", "Enregistré hors-ligne")
              : t("form.submitted", "Soumis avec succès")}
          </Heading>
          <Text size="md" color="$textLight600" textAlign="center" lineHeight={22} mb="$6">
            {engine.queuedOffline
              ? t(
                  "form.queuedDesc",
                  "Votre demande sera envoyée automatiquement dès que la connexion sera rétablie."
                )
              : t("form.submittedDesc", "Votre demande a été envoyée avec succès.")}
          </Text>
          <VStack space="sm" w="$full">
            <Button size="lg" action="primary" onPress={onSuccess ?? engine.reset}>
              <ButtonText>{t("common.done", "Terminé")}</ButtonText>
            </Button>
            <Button size="md" variant="outline" action="secondary" onPress={engine.reset}>
              <ButtonText>{t("form.newRequest", "Nouvelle demande")}</ButtonText>
            </Button>
          </VStack>
        </Box>
      </Box>
    );
  }

  const progress = engine.totalSteps > 1 ? ((engine.currentStep + 1) / engine.totalSteps) * 100 : 100;

  /* ── Field renderer ────────────────────────────────────────────── */
  function renderField(fieldName: string) {
    const field = form.fields[fieldName];
    if (!field) return null;
    const value = engine.values[fieldName];
    const error = engine.errors[fieldName];
    const required = engine.isFieldRequired(fieldName);
    const halfWidth = isTablet && field.ui_width === "half";
    const fieldElement = renderFieldByType(field, fieldName, value, error, required, engine.setValue);
    return (
      <Box
        key={fieldName}
        width={halfWidth ? "48%" : "100%"}
        mr={halfWidth ? "4%" : 0}
      >
        {fieldElement}
      </Box>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <Box bg="$white" pt={insets.top + 8} px="$5" pb="$3" shadowColor="$black" shadowOpacity={0.05} shadowRadius={2}>
        <Heading size="md" color="$primary700">
          {form.title}
        </Heading>
        {engine.totalSteps > 1 && (
          <>
            <Box mt="$2">
              <Text size="2xs" color="$textLight400" textTransform="uppercase" letterSpacing={0.5}>
                {t("form.step", "Étape")} {engine.currentStep + 1} / {engine.totalSteps}
              </Text>
              <Text size="sm" fontWeight="$semibold" color="$textLight900" mt="$0.5">
                {engine.currentStepDef?.title}
              </Text>
            </Box>
            <Progress value={progress} h={4} mt="$2.5">
              <ProgressFilledTrack bg="$primary600" />
            </Progress>
          </>
        )}
      </Box>

      {/* Body */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: contentPadding, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {engine.currentStepDef?.description ? (
          <Text size="md" color="$textLight600" lineHeight={22} mb="$4">
            {engine.currentStepDef.description}
          </Text>
        ) : null}

        <Box flexDirection="row" flexWrap="wrap" gap={14}>
          {engine.visibleFieldsInStep.map((fn) => renderField(fn))}
        </Box>

        {engine.submitError && (
          <Box
            bg="$error50"
            borderRadius="$lg"
            borderLeftWidth={4}
            borderLeftColor="$error500"
            p="$3.5"
            mt="$4"
          >
            <Text size="sm" color="$error700">
              {engine.submitError}
            </Text>
          </Box>
        )}
      </ScrollView>

      {/* Footer */}
      <Box
        bg="$white"
        borderTopWidth={1}
        borderColor="$borderLight200"
        px="$5"
        pt="$3"
        pb={12 + Math.max(insets.bottom, 8)}
      >
        <HStack space="sm" justifyContent="space-between">
          {engine.canGoPrev ? (
            <Button size="lg" variant="outline" action="secondary" onPress={engine.goPrev} flex={1}>
              <ButtonText>{t("common.previous", "Précédent")}</ButtonText>
            </Button>
          ) : onCancel ? (
            <Button size="lg" variant="outline" action="secondary" onPress={onCancel} flex={1}>
              <ButtonText>{t("common.cancel", "Annuler")}</ButtonText>
            </Button>
          ) : (
            <Box flex={1} />
          )}

          {engine.isLastStep ? (
            // Explicit success green + white text — `action="positive"`
            // alone renders as light-green on light-green, which looks
            // disabled at a glance.
            <Button
              size="lg"
              onPress={engine.submit}
              isDisabled={engine.submitting}
              flex={1}
              bg="$success600"
              $active-bg="$success700"
              $disabled-opacity={0.5}
            >
              {engine.submitting && <ButtonSpinner mr="$2" color="$white" />}
              <ButtonText color="$white" fontWeight="$bold">
                {t("common.submit", "Soumettre")}
              </ButtonText>
            </Button>
          ) : (
            <Button size="lg" action="primary" onPress={engine.goNext} flex={1}>
              <ButtonText>{t("common.next", "Suivant")}</ButtonText>
            </Button>
          )}
        </HStack>
      </Box>
    </KeyboardAvoidingView>
  );
}
