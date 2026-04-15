/**
 * AccountBlockedScreen — Gluestack refonte: account blocked / suspended /
 * deleted / deactivated. The user can only log out from this screen.
 */
import React from "react";
import {
  Box,
  Button,
  ButtonText,
  Heading,
  HStack,
  Text,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { NoConnection } from "../components/illustrations";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/auth";
import { clearPersistedAuth } from "../services/storage";
import { disconnectNotifications } from "../services/notifications";

interface Props {
  reason: "blocked" | "suspended" | "deleted" | "deactivated" | "unknown";
  message?: string;
}

const REASON_KEYS: Record<string, { titleKey: string; titleFb: string; descKey: string; descFb: string }> = {
  blocked: {
    titleKey: "blocked.title",
    titleFb: "Compte bloqué",
    descKey: "blocked.desc",
    descFb: "Votre compte a été bloqué par un administrateur. Vous ne pouvez plus accéder à l'application.",
  },
  suspended: {
    titleKey: "suspended.title",
    titleFb: "Compte suspendu",
    descKey: "suspended.desc",
    descFb: "Votre compte a été temporairement suspendu. Veuillez patienter ou contacter votre administrateur.",
  },
  deleted: {
    titleKey: "deleted.title",
    titleFb: "Compte supprimé",
    descKey: "deleted.desc",
    descFb: "Votre compte a été supprimé. Contactez votre administrateur si vous pensez qu'il s'agit d'une erreur.",
  },
  deactivated: {
    titleKey: "deactivated.title",
    titleFb: "Compte désactivé",
    descKey: "deactivated.desc",
    descFb: "Votre compte a été désactivé. Contactez votre administrateur pour le réactiver.",
  },
  unknown: {
    titleKey: "blocked.unknownTitle",
    titleFb: "Accès refusé",
    descKey: "blocked.unknownDesc",
    descFb: "Votre accès à l'application a été restreint. Contactez votre administrateur.",
  },
};

export default function AccountBlockedScreen({ reason, message }: Props) {
  const { t } = useTranslation();
  const { titleKey, titleFb, descKey, descFb } = REASON_KEYS[reason] ?? REASON_KEYS.unknown;

  async function handleLogout() {
    disconnectNotifications();
    await clearPersistedAuth();
    useAuthStore.getState().logout();
  }

  return (
    <Box flex={1} bg="$backgroundLight50" justifyContent="center" alignItems="center" p="$6">
      <Box maxWidth={400} w="$full" bg="$white" borderRadius="$xl" p="$6" alignItems="center">
        <Box mb="$4">
          <NoConnection width={180} color="#dc2626" accent="#fecaca" />
        </Box>
        <Heading size="xl" color="$error700" textAlign="center" mb="$2">
          {t(titleKey, titleFb)}
        </Heading>
        <Text size="md" color="$textLight600" textAlign="center" lineHeight={24} mb="$4">
          {message || t(descKey, descFb)}
        </Text>

        <Box
          bg="$warning50"
          borderRadius="$lg"
          borderLeftWidth={4}
          borderLeftColor="$warning500"
          p="$3.5"
          w="$full"
          mb="$5"
        >
          <HStack space="sm" alignItems="center">
            <MIcon name="info" size="sm" color="$warning600" />
            <Text size="sm" color="$textLight900" flex={1} lineHeight={20}>
              {t(
                "blocked.contactAdmin",
                "Contactez votre administrateur pour résoudre ce problème."
              )}
            </Text>
          </HStack>
        </Box>

        <Button size="lg" action="primary" w="$full" onPress={handleLogout}>
          <MIcon name="logout" size="md" color="$white" />
          <ButtonText> {t("auth.logout", "Se déconnecter")}</ButtonText>
        </Button>
      </Box>
    </Box>
  );
}
