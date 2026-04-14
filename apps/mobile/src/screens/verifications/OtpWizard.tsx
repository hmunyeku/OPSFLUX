/**
 * OtpWizard — shared 2-step OTP wizard for phone & email verification.
 *
 * Step 1: "Start" — calls the start function and moves to step 2 on success.
 * Step 2: "Confirm" — 6-digit code input with auto-focus and submit.
 *
 * Works for both verification types via the props (startFn + confirmFn
 * + labels). Keeps the visual pattern consistent.
 */

import React, { useEffect, useRef, useState } from "react";
import { Alert, TextInput as RNTextInput } from "react-native";
import {
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Heading,
  HStack,
    Input,
  InputField,
  Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../../components/MIcon";
import { SuccessCheck } from "../../components/illustrations";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

export interface StartResult {
  verification_id: string;
  channel?: string;
  target_label?: string; // masked phone / email for display
}

export interface OtpWizardProps {
  title: string;
  subtitle: string;
  targetHintKey?: string; // "verif.phone.hint" etc.
  startLabel: string;
  confirmInstruction: string;
  onStart: () => Promise<StartResult>;
  onConfirm: (verification_id: string, otp: string) => Promise<void>;
  onDone: () => void;
  onCancel: () => void;
}

export default function OtpWizard(props: OtpWizardProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"ready" | "starting" | "waiting" | "confirming" | "success">(
    "ready"
  );
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [targetLabel, setTargetLabel] = useState<string>("");
  const [channel, setChannel] = useState<string>("");
  const [otp, setOtp] = useState("");
  const otpRef = useRef<RNTextInput>(null);

  useEffect(() => {
    if (phase === "waiting" && otpRef.current) {
      setTimeout(() => otpRef.current?.focus(), 100);
    }
  }, [phase]);

  async function handleStart() {
    setPhase("starting");
    try {
      const result = await props.onStart();
      setVerificationId(result.verification_id);
      setTargetLabel(result.target_label ?? "");
      setChannel(result.channel ?? "");
      setPhase("waiting");
    } catch (err: any) {
      setPhase("ready");
      const detail = err?.response?.data?.detail ?? t("verif.startError", "Impossible d'envoyer le code.");
      Alert.alert(t("common.error", "Erreur"), detail);
    }
  }

  async function handleConfirm() {
    if (!verificationId || otp.length < 4) return;
    setPhase("confirming");
    try {
      await props.onConfirm(verificationId, otp);
      setPhase("success");
      setTimeout(() => props.onDone(), 1500);
    } catch (err: any) {
      setPhase("waiting");
      setOtp("");
      const detail = err?.response?.data?.detail ?? t("verif.confirmError", "Code invalide.");
      Alert.alert(t("common.error", "Erreur"), detail);
    }
  }

  return (
    <Box flex={1} bg="$backgroundLight50">
      <Box pt={insets.top + 12} px="$4">
        <Pressable onPress={props.onCancel} py="$2" alignSelf="flex-start">
          <HStack alignItems="center" space="xs">
            <MIcon name="arrow-back" size="sm" color="$textLight600" />
            <Text size="md" color="$textLight600" fontWeight="$medium">
              {t("common.back", "Retour")}
            </Text>
          </HStack>
        </Pressable>
      </Box>

      <Box flex={1} p="$5">
        <Box maxWidth={420} w="$full" alignSelf="center" flex={1} justifyContent="center">
          {phase === "success" ? (
            <VStack space="md" alignItems="center">
              <SuccessCheck width={180} />
              <Heading size="xl" textAlign="center" color="$textLight900" mt="$2">
                {t("verif.verifiedTitle", "Vérifié !")}
              </Heading>
              <Text textAlign="center" color="$textLight600">
                {t("verif.verifiedSubtitle", "Cette information est maintenant marquée comme vérifiée.")}
              </Text>
            </VStack>
          ) : (
            <VStack space="md">
              <Heading size="xl" color="$textLight900">
                {props.title}
              </Heading>
              <Text color="$textLight600">{props.subtitle}</Text>

              {phase === "ready" && (
                <Button
                  size="xl"
                  action="primary"
                  mt="$4"
                  onPress={handleStart}
                >
                  <ButtonText>{props.startLabel}</ButtonText>
                </Button>
              )}

              {phase === "starting" && (
                <HStack space="sm" alignItems="center" justifyContent="center" py="$6">
                  <Spinner color="$primary600" />
                  <Text color="$textLight600">{t("verif.sending", "Envoi en cours...")}</Text>
                </HStack>
              )}

              {(phase === "waiting" || phase === "confirming") && (
                <VStack space="md" mt="$4">
                  <Box bg="$primary50" borderRadius="$lg" borderWidth={1} borderColor="$primary200" p="$3">
                    <Text size="sm" color="$primary900">
                      {props.confirmInstruction}
                    </Text>
                    {(targetLabel || channel) && (
                      <Text size="xs" color="$primary700" mt="$1" opacity={0.8}>
                        {channel ? `via ${channel}` : ""} {targetLabel ? `→ ${targetLabel}` : ""}
                      </Text>
                    )}
                  </Box>

                  <Input size="xl" borderColor="$borderLight300">
                    <InputField
                      ref={otpRef as any}
                      value={otp}
                      onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      textAlign="center"
                      fontSize={28}
                      letterSpacing={8}
                      placeholder="••••••"
                    />
                  </Input>

                  <Button
                    size="xl"
                    action="primary"
                    isDisabled={otp.length < 4 || phase === "confirming"}
                    onPress={handleConfirm}
                  >
                    {phase === "confirming" && <ButtonSpinner mr="$2" />}
                    <ButtonText>{t("verif.verify", "Vérifier")}</ButtonText>
                  </Button>

                  <Pressable alignItems="center" py="$2" onPress={handleStart}>
                    <HStack alignItems="center" space="xs">
                      <MIcon name="refresh" size="xs" color="$textLight500" />
                      <Text size="sm" color="$textLight500" fontWeight="$medium">
                        {t("verif.resend", "Renvoyer le code")}
                      </Text>
                    </HStack>
                  </Pressable>
                </VStack>
              )}
            </VStack>
          )}
        </Box>
      </Box>
    </Box>
  );
}
