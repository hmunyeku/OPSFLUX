/**
 * PairingScanScreen — scans the QR displayed by app.opsflux.com → Profile
 * and exchanges the token for a mobile session (WhatsApp-Web style).
 *
 * Flow:
 *   1. QrScanner component yields the decoded JSON string.
 *   2. We validate it's a valid OpsFlux pairing payload:
 *        { v: 1, api: "https://...", token: "opspair_..." }
 *   3. Switch the API base URL to the one in the QR (multi-tenant support).
 *   4. POST /auth/mobile-pair/consume → receive JWT + user info.
 *   5. Store tokens, navigate back to the root — AppNavigator picks up
 *      the authenticated state and routes to the Portal.
 */

import React, { useCallback, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import {
  Box,
  Button,
  ButtonText,
  Heading,
  HStack,
  Icon,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { ArrowLeft, QrCode, XCircle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QrScanner from "../components/QrScanner";
import { api, setBaseUrl } from "../services/api";
import { useAuthStore } from "../stores/auth";

interface Props {
  navigation: any;
}

interface ParsedPayload {
  v: number;
  api: string;
  token: string;
}

/** Parse a decoded QR string, verifying it's an OpsFlux pairing payload. */
function parsePayload(raw: string): ParsedPayload | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{")) return null;
    const obj = JSON.parse(trimmed);
    if (
      obj &&
      typeof obj === "object" &&
      typeof obj.api === "string" &&
      typeof obj.token === "string" &&
      obj.token.startsWith("opspair_")
    ) {
      return { v: Number(obj.v) || 1, api: obj.api, token: obj.token };
    }
  } catch {
    /* not a JSON QR */
  }
  return null;
}

/** Collect device metadata to send with the consume request. */
function collectDeviceInfo() {
  return {
    os: Device.osName ?? Platform.OS,
    os_version: Device.osVersion ?? "",
    model: Device.modelName ?? Device.deviceName ?? "",
    brand: Device.brand ?? "",
    app_version: Application.nativeApplicationVersion ?? "",
    app_build: Application.nativeBuildVersion ?? "",
    locale: undefined as string | undefined,
  };
}

export default function PairingScanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const setTokens = useAuthStore((s) => s.setTokens);
  const storeSetBaseUrl = useAuthStore((s) => s.setBaseUrl);

  const handleScan = useCallback(
    async (raw: string) => {
      if (busy) return;
      const parsed = parsePayload(raw);
      if (!parsed) {
        Alert.alert(
          t("pairing.invalidQr", "QR non reconnu"),
          t(
            "pairing.invalidQrHint",
            "Ce QR ne semble pas venir d'OpsFlux. Assurez-vous de scanner celui affiché dans Profil → Connecter l'app mobile."
          )
        );
        return;
      }

      setPaused(true);
      setBusy(true);

      try {
        // Switch API URL to match the server embedded in the QR
        // (multi-tenant / self-hosted customers).
        setBaseUrl(parsed.api);
        storeSetBaseUrl(parsed.api);

        const device_info = collectDeviceInfo();
        const { data } = await api.post("/api/v1/auth/mobile-pair/consume", {
          token: parsed.token,
          device_info,
        });

        setTokens(data.access_token, data.refresh_token);
        // AppNavigator will pick up the new auth state and route us.
      } catch (err: any) {
        const detail =
          err?.response?.data?.detail ??
          t(
            "pairing.consumeError",
            "Impossible de connecter cet appareil. Le code a peut-être expiré — générez-en un nouveau depuis le web."
          );
        Alert.alert(t("common.error", "Erreur"), detail, [
          {
            text: t("common.ok", "OK"),
            onPress: () => {
              setBusy(false);
              setPaused(false);
            },
          },
        ]);
      }
    },
    [busy, setTokens, storeSetBaseUrl, t]
  );

  if (busy) {
    return (
      <Box flex={1} bg="$backgroundLight0" justifyContent="center" alignItems="center" p="$6">
        <Spinner size="large" color="$primary600" />
        <Text size="md" color="$textLight600" mt="$4" textAlign="center">
          {t("pairing.connecting", "Connexion de l'appareil...")}
        </Text>
      </Box>
    );
  }

  return (
    <Box flex={1} bg="#000000">
      {/* Top bar */}
      <Box
        position="absolute"
        top={insets.top + 8}
        left={0}
        right={0}
        zIndex={10}
        px="$4"
      >
        <HStack alignItems="center" justifyContent="space-between">
          <Button
            size="sm"
            variant="solid"
            action="secondary"
            bg="rgba(0,0,0,0.5)"
            onPress={() => navigation.goBack()}
          >
            <Icon as={ArrowLeft} color="$white" size="sm" mr="$1" />
            <ButtonText color="$white">{t("common.back", "Retour")}</ButtonText>
          </Button>
          <HStack bg="rgba(0,0,0,0.5)" px="$3" py="$2" borderRadius="$full" space="xs" alignItems="center">
            <Icon as={QrCode} color="$white" size="sm" />
            <Text size="xs" color="$white" fontWeight="$semibold">
              {t("pairing.scanTitle", "Scanner le QR OpsFlux")}
            </Text>
          </HStack>
        </HStack>
      </Box>

      {/* Scanner */}
      <QrScanner
        onScan={handleScan}
        instruction={t(
          "pairing.instruction",
          "Alignez le QR code affiché sur app.opsflux.com"
        )}
        paused={paused}
      />

      {/* Bottom hint */}
      <Box
        position="absolute"
        bottom={insets.bottom + 16}
        left={0}
        right={0}
        px="$5"
        zIndex={10}
      >
        <Box bg="rgba(0,0,0,0.55)" borderRadius="$lg" p="$4">
          <VStack space="xs">
            <Heading size="sm" color="$white">
              {t("pairing.howTitle", "Comment obtenir le QR ?")}
            </Heading>
            <Text size="xs" color="$white" opacity={0.9}>
              {t(
                "pairing.howStep1",
                "1. Connectez-vous sur app.opsflux.com depuis un navigateur."
              )}
            </Text>
            <Text size="xs" color="$white" opacity={0.9}>
              {t("pairing.howStep2", "2. Ouvrez Paramètres → Profil.")}
            </Text>
            <Text size="xs" color="$white" opacity={0.9}>
              {t(
                "pairing.howStep3",
                "3. Dans « App mobile OpsFlux », cliquez sur Générer un code."
              )}
            </Text>
          </VStack>
        </Box>
      </Box>
    </Box>
  );
}
