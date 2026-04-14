/**
 * MaintenanceScreen — Gluestack refonte: shown when server returns 503.
 */
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Heading,
  Icon,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { Wrench } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import { useAppState } from "../stores/appState";

export default function MaintenanceScreen() {
  const { t } = useTranslation();
  const message = useAppState((s) => s.maintenanceMessage);
  const [checking, setChecking] = useState(false);

  async function checkAgain() {
    setChecking(true);
    try {
      await api.get("/api/v1/health");
      useAppState.getState().setMaintenance(false);
    } catch {
      /* still down */
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const interval = setInterval(checkAgain, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box flex={1} bg="$backgroundLight50" justifyContent="center" alignItems="center" p="$6">
      <Box maxWidth={400} w="$full" bg="$white" borderRadius="$xl" p="$6" alignItems="center">
        <Box bg="$info50" borderRadius="$full" p="$5" mb="$5">
          <Icon as={Wrench} size="xl" color="$info600" />
        </Box>
        <Heading size="xl" color="$textLight900" textAlign="center" mb="$2">
          {t("maintenance.title", "Maintenance en cours")}
        </Heading>
        <Text size="md" color="$textLight600" textAlign="center" lineHeight={24} mb="$5">
          {message || t("maintenance.desc", "Le serveur est temporairement indisponible. Veuillez réessayer dans quelques minutes.")}
        </Text>
        <Button size="lg" action="primary" w="$full" onPress={checkAgain} isDisabled={checking}>
          {checking && <ButtonSpinner mr="$2" />}
          <ButtonText>{t("common.retry", "Réessayer")}</ButtonText>
        </Button>
        <Text size="xs" color="$textLight400" mt="$3">
          {t("maintenance.autoRetry", "Vérification automatique toutes les 30 secondes")}
        </Text>
      </Box>
    </Box>
  );
}
