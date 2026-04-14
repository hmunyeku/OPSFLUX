/**
 * ForceUpdateScreen — Gluestack refonte: shown when app version < min_app_version.
 */
import React from "react";
import { Linking, Platform } from "react-native";
import {
  Box,
  Button,
  ButtonText,
  Heading,
  HStack,
    Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { useTranslation } from "react-i18next";

interface Props {
  currentVersion: string;
  requiredVersion: string;
  soft?: boolean;
  onSkip?: () => void;
  storeUrl?: string;
}

const DEFAULT_STORE_URL = Platform.select({
  ios: "https://apps.apple.com/app/opsflux-mobile/id000000000",
  android: "https://play.google.com/store/apps/details?id=com.opsflux.mobile",
  default: "",
});

export default function ForceUpdateScreen({
  currentVersion,
  requiredVersion,
  soft = false,
  onSkip,
  storeUrl,
}: Props) {
  const { t } = useTranslation();

  function openStore() {
    const url = storeUrl ?? DEFAULT_STORE_URL;
    if (url) Linking.openURL(url);
  }

  return (
    <Box flex={1} bg="$backgroundLight50" justifyContent="center" alignItems="center" p="$6">
      <Box maxWidth={400} w="$full" bg="$white" borderRadius="$xl" p="$6" alignItems="center">
        <Box bg="$primary50" borderRadius="$full" p="$5" mb="$5">
          <MIcon name="arrow-circle-up" size="xl" color="$primary600" />
        </Box>
        <Heading size="xl" color="$textLight900" textAlign="center" mb="$2">
          {t("update.title", "Mise à jour requise")}
        </Heading>
        <Text size="md" color="$textLight600" textAlign="center" lineHeight={24} mb="$5">
          {t("update.desc", "Une nouvelle version de l'application est disponible. Veuillez mettre à jour pour continuer.")}
        </Text>

        <Box bg="$backgroundLight100" borderRadius="$lg" p="$3.5" w="$full" mb="$5">
          <VStack space="xs">
            <HStack justifyContent="space-between">
              <Text size="sm" color="$textLight500">
                {t("update.currentVersion", "Version actuelle")}
              </Text>
              <Text size="sm" fontWeight="$semibold" color="$textLight900" fontFamily="$mono">
                {currentVersion}
              </Text>
            </HStack>
            <HStack justifyContent="space-between">
              <Text size="sm" color="$textLight500">
                {t("update.requiredVersion", "Version requise")}
              </Text>
              <Text size="sm" fontWeight="$semibold" color="$primary700" fontFamily="$mono">
                {requiredVersion}
              </Text>
            </HStack>
          </VStack>
        </Box>

        <Button size="lg" action="primary" w="$full" onPress={openStore}>
          <ButtonText>{t("update.update", "Mettre à jour")}</ButtonText>
        </Button>

        {soft && onSkip && (
          <Button size="md" variant="link" mt="$2" onPress={onSkip}>
            <ButtonText>{t("update.later", "Plus tard")}</ButtonText>
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** Compare semver strings: returns -1, 0, or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}
