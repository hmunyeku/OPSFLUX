/**
 * Preferences Screen — lightweight settings the user can configure from mobile.
 *
 * Includes:
 *  - Language
 *  - Theme (light/dark/system)
 *  - Notification preferences (push, email, SMS)
 *  - Preferred communication channel
 */

import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Card,
  Divider,
  List,
  RadioButton,
  Switch,
  Text,
} from "react-native-paper";
import { useTranslation } from "react-i18next";
import { AVAILABLE_LANGUAGES } from "../locales/i18n";
import { useThemeStore } from "../stores/theme";
import { useSettings } from "../stores/settings";
import { api } from "../services/api";
import { useToast } from "../components/Toast";
import { colors } from "../utils/colors";

export default function PreferencesScreen() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { isDark, mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const settings = useSettings();

  // Save a user preference to the server
  async function savePref(key: string, value: string) {
    try {
      await api.put("/api/v1/settings?scope=user", { key, value });
    } catch {
      // Non-critical — will sync later
    }
  }

  async function changeLanguage(lang: string) {
    i18n.changeLanguage(lang);
    await savePref("preference.language", lang);
    toast.show(t("common.save"), "success", 1500);
  }

  async function changeTheme(mode: "light" | "dark" | "system") {
    setThemeMode(mode);
    await savePref("preference.theme", mode);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Language */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            {t("settings.language")}
          </Text>
          <RadioButton.Group
            value={i18n.language}
            onValueChange={changeLanguage}
          >
            {AVAILABLE_LANGUAGES.map((lang) => (
              <RadioButton.Item
                key={lang.code}
                label={lang.label}
                value={lang.code}
                labelStyle={styles.radioLabel}
              />
            ))}
          </RadioButton.Group>
        </Card.Content>
      </Card>

      {/* Theme */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            {t("settings.darkMode")}
          </Text>
          <RadioButton.Group
            value={themeMode}
            onValueChange={(v) => changeTheme(v as any)}
          >
            <RadioButton.Item label="Automatique (système)" value="system" labelStyle={styles.radioLabel} />
            <RadioButton.Item label="Clair" value="light" labelStyle={styles.radioLabel} />
            <RadioButton.Item label="Sombre" value="dark" labelStyle={styles.radioLabel} />
          </RadioButton.Group>
        </Card.Content>
      </Card>

      {/* Notifications */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Notifications
          </Text>
          <List.Item
            title="Notifications push"
            description="Recevoir les alertes sur votre téléphone"
            right={() => (
              <Switch
                value={settings.get("preference.push_notifications") !== "false"}
                onValueChange={(v) => savePref("preference.push_notifications", String(v))}
                color={colors.primary}
              />
            )}
          />
          <Divider />
          <List.Item
            title="Notifications email"
            description="Recevoir les notifications par email"
            right={() => (
              <Switch
                value={settings.get("preference.email_notifications") !== "false"}
                onValueChange={(v) => savePref("preference.email_notifications", String(v))}
                color={colors.primary}
              />
            )}
          />
          <Divider />
          <List.Item
            title="Notifications SMS"
            description="Recevoir les alertes urgentes par SMS"
            right={() => (
              <Switch
                value={settings.get("preference.sms_notifications") === "true"}
                onValueChange={(v) => savePref("preference.sms_notifications", String(v))}
                color={colors.primary}
              />
            )}
          />
        </Card.Content>
      </Card>

      {/* Communication channel */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Canal de communication préféré
          </Text>
          <Text variant="bodySmall" style={styles.hint}>
            Utilisé pour les vérifications OTP et les communications importantes.
          </Text>
          <RadioButton.Group
            value={settings.get("preference.messaging_channel", "auto")}
            onValueChange={(v) => savePref("preference.messaging_channel", v)}
          >
            <RadioButton.Item label="Automatique" value="auto" labelStyle={styles.radioLabel} />
            <RadioButton.Item label="WhatsApp" value="whatsapp" labelStyle={styles.radioLabel} />
            <RadioButton.Item label="SMS" value="sms" labelStyle={styles.radioLabel} />
            <RadioButton.Item label="Email" value="email" labelStyle={styles.radioLabel} />
          </RadioButton.Group>
        </Card.Content>
      </Card>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  card: { borderRadius: 12 },
  sectionTitle: {
    fontWeight: "700", color: colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
  },
  radioLabel: { fontSize: 15 },
  hint: { color: colors.textMuted, marginBottom: 8 },
});
