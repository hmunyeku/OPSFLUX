/**
 * PreferencesScreen — Gluestack refonte: light user-tunable settings.
 *
 *  - Language (RadioGroup) — also drives the i18n catalog refresh
 *  - Theme (RadioGroup: system/light/dark)
 *  - Notification toggles (push, email, SMS)
 *  - Preferred messaging channel for OTP/comms
 */

import React from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Box,
  Divider,
  Heading,
  HStack,
  Radio,
  RadioGroup,
  RadioIcon,
  RadioIndicator,
  RadioLabel,
  Switch,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { CircleIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { AVAILABLE_LANGUAGES } from "../locales/i18n";
import { useThemeStore } from "../stores/theme";
import { useSettings } from "../stores/settings";
import { useI18nStore } from "../stores/i18n";
import { api } from "../services/api";
import { useToast } from "../components/Toast";

export default function PreferencesScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const settings = useSettings();
  const changeI18nLanguage = useI18nStore((s) => s.changeLanguage);

  async function savePref(key: string, value: string) {
    try {
      await api.put("/api/v1/settings?scope=user", { key, value });
    } catch {
      /* non-critical, will sync later */
    }
  }

  async function changeLanguage(lang: string) {
    await changeI18nLanguage(lang);
    await savePref("preference.language", lang);
    toast.show(t("common.save", "Enregistré"), "success", 1500);
  }

  async function changeTheme(mode: string) {
    setThemeMode(mode as any);
    await savePref("preference.theme", mode);
  }

  return (
    <Box flex={1} bg="$backgroundLight50">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 14,
          paddingBottom: insets.bottom + 32,
          gap: 12,
        }}
      >
        {/* Language */}
        <SettingsCard title={t("settings.language", "Langue")}>
          <RadioGroup value={i18n.language} onChange={changeLanguage}>
            <VStack space="xs">
              {AVAILABLE_LANGUAGES.map((lang) => (
                <RadioRow key={lang.code} value={lang.code} label={lang.label} />
              ))}
            </VStack>
          </RadioGroup>
        </SettingsCard>

        {/* Theme */}
        <SettingsCard title={t("prefs.theme", "Thème")}>
          <RadioGroup value={themeMode} onChange={changeTheme}>
            <VStack space="xs">
              <RadioRow value="system" label={t("prefs.themeSystem", "Automatique (système)")} />
              <RadioRow value="light" label={t("prefs.themeLight", "Clair")} />
              <RadioRow value="dark" label={t("prefs.themeDark", "Sombre")} />
            </VStack>
          </RadioGroup>
        </SettingsCard>

        {/* Notifications */}
        <SettingsCard title={t("prefs.notifications", "Notifications")}>
          <VStack divider={<Divider my="$1" />}>
            <ToggleRow
              title={t("prefs.pushNotif", "Notifications push")}
              description={t("prefs.pushNotifDesc", "Recevoir les alertes sur votre téléphone")}
              value={settings.get("preference.push_notifications") !== "false"}
              onChange={(v) => savePref("preference.push_notifications", String(v))}
            />
            <ToggleRow
              title={t("prefs.emailNotif", "Notifications email")}
              description={t("prefs.emailNotifDesc", "Recevoir les notifications par email")}
              value={settings.get("preference.email_notifications") !== "false"}
              onChange={(v) => savePref("preference.email_notifications", String(v))}
            />
            <ToggleRow
              title={t("prefs.smsNotif", "Notifications SMS")}
              description={t("prefs.smsNotifDesc", "Recevoir les alertes urgentes par SMS")}
              value={settings.get("preference.sms_notifications") === "true"}
              onChange={(v) => savePref("preference.sms_notifications", String(v))}
            />
          </VStack>
        </SettingsCard>

        {/* Messaging channel */}
        <SettingsCard
          title={t("prefs.messagingChannel", "Canal de communication préféré")}
          hint={t(
            "prefs.messagingChannelHint",
            "Utilisé pour les vérifications OTP et les communications importantes."
          )}
        >
          <RadioGroup
            value={settings.get("preference.messaging_channel", "auto")}
            onChange={(v) => savePref("preference.messaging_channel", v)}
          >
            <VStack space="xs">
              <RadioRow value="auto" label={t("prefs.channelAuto", "Automatique")} />
              <RadioRow value="whatsapp" label="WhatsApp" />
              <RadioRow value="sms" label="SMS" />
              <RadioRow value="email" label="Email" />
            </VStack>
          </RadioGroup>
        </SettingsCard>
      </ScrollView>
    </Box>
  );
}

function SettingsCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
      <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$2">
        {title}
      </Heading>
      {hint && (
        <Text size="xs" color="$textLight500" mb="$2">
          {hint}
        </Text>
      )}
      {children}
    </Box>
  );
}

function RadioRow({ value, label }: { value: string; label: string }) {
  return (
    <Radio value={value} size="md">
      <RadioIndicator mr="$2">
        <RadioIcon as={CircleIcon} />
      </RadioIndicator>
      <RadioLabel>{label}</RadioLabel>
    </Radio>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <HStack alignItems="center" justifyContent="space-between" py="$2">
      <VStack flex={1} mr="$3">
        <Text size="sm" fontWeight="$medium" color="$textLight900">
          {title}
        </Text>
        <Text size="xs" color="$textLight500">
          {description}
        </Text>
      </VStack>
      <Switch value={value} onValueChange={onChange} />
    </HStack>
  );
}
