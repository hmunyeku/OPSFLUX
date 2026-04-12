/**
 * Account Blocked Screen — shown when the user's account is blocked,
 * suspended, or deleted server-side.
 *
 * Detects account status via:
 *  1. 403 response with specific error codes from any API call
 *  2. Bootstrap response with user.status !== 'active'
 *  3. Forced check on app resume (background → foreground)
 *
 * The user cannot dismiss this screen — they must contact their admin.
 */

import React from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Button, Surface, Text } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/auth";
import { clearPersistedAuth } from "../services/storage";
import { disconnectNotifications } from "../services/notifications";
import { colors } from "../utils/colors";

interface Props {
  reason: "blocked" | "suspended" | "deleted" | "deactivated" | "unknown";
  message?: string;
}

const REASON_MESSAGES: Record<string, { title: string; description: string }> = {
  blocked: {
    title: "Compte bloqué",
    description:
      "Votre compte a été bloqué par un administrateur. Vous ne pouvez plus accéder à l'application.",
  },
  suspended: {
    title: "Compte suspendu",
    description:
      "Votre compte a été temporairement suspendu. Veuillez patienter ou contacter votre administrateur.",
  },
  deleted: {
    title: "Compte supprimé",
    description:
      "Votre compte a été supprimé. Contactez votre administrateur si vous pensez qu'il s'agit d'une erreur.",
  },
  deactivated: {
    title: "Compte désactivé",
    description:
      "Votre compte a été désactivé. Contactez votre administrateur pour le réactiver.",
  },
  unknown: {
    title: "Accès refusé",
    description:
      "Votre accès à l'application a été restreint. Contactez votre administrateur.",
  },
};

export default function AccountBlockedScreen({ reason, message }: Props) {
  const { title, description } = REASON_MESSAGES[reason] ?? REASON_MESSAGES.unknown;

  async function handleLogout() {
    disconnectNotifications();
    await clearPersistedAuth();
    useAuthStore.getState().logout();
  }

  return (
    <View style={styles.container}>
      <Surface style={styles.card} elevation={3}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>!</Text>
        </View>

        <Text variant="headlineSmall" style={styles.title}>
          {title}
        </Text>

        <Text variant="bodyLarge" style={styles.description}>
          {message || description}
        </Text>

        <View style={styles.infoBox}>
          <Text variant="bodyMedium" style={styles.infoText}>
            Contactez votre administrateur pour résoudre ce problème.
          </Text>
        </View>

        <Button
          mode="contained"
          onPress={handleLogout}
          style={styles.logoutButton}
          buttonColor={colors.primary}
        >
          Se déconnecter
        </Button>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  card: {
    borderRadius: 20,
    padding: 36,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.danger + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  iconText: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.danger,
  },
  title: {
    fontWeight: "700",
    color: colors.danger,
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 20,
  },
  infoBox: {
    backgroundColor: colors.warning + "10",
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    width: "100%",
    marginBottom: 24,
  },
  infoText: {
    color: colors.textPrimary,
    lineHeight: 22,
  },
  logoutButton: {
    width: "100%",
    borderRadius: 10,
  },
});
