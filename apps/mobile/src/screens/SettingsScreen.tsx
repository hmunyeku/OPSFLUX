/**
 * SettingsScreen — Gluestack refonte: hub for navigation + connection info + logout.
 *
 * Profile editing has been moved to MyProfile (web is the canonical edit
 * surface). Phone OTP verification has been moved to VerificationsHub.
 * This screen now focuses on:
 *   - Quick navigation links (My Profile, Verifications, Compliance, Contacts, Preferences)
 *   - Profile summary (avatar + name + email + entity)
 *   - Connection status (online, queue size, last sync)
 *   - Entity switcher (if multiple)
 *   - App info + maintenance actions (clear cache, reset onboarding)
 *   - Logout
 */

import React, { useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Avatar,
  AvatarFallbackText,
  AvatarImage,
  Box,
  Button,
  ButtonText,
  Divider,
  Heading,
  HStack,
  Icon,
  Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import {
  Bell,
  ChevronRight,
  CircleCheck,
  CircleDot,
  CloudUpload,
  HelpCircle,
  Info,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Trash2,
  UserCircle,
  Users,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/auth";
import { usePermissions } from "../stores/permissions";
import { useOfflineStore, clearCache, flushQueue } from "../services/offline";
import { useTrackingStore, stopTracking } from "../services/tracking";
import { useBootstrap } from "../hooks/useBootstrap";
import { clearPersistedAuth } from "../services/storage";
import { disconnectNotifications, useNotifications } from "../services/notifications";
import { useSettings } from "../stores/settings";
import { resetOnboarding } from "./OnboardingScreen";
import { getProfile, type UserProfile } from "../services/profile";
import { APP_VERSION } from "../services/api";

interface Props {
  navigation: any;
}

export default function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { userDisplayName, entityId, logout } = useAuthStore();
  const permissionCount = usePermissions((s) => s.permissions.length);
  const { isOnline, queueLength, syncing, lastSyncAt } = useOfflineStore();
  const trackingEnabled = useTrackingStore((s) => s.enabled);
  const { entities } = useBootstrap();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const p = await getProfile();
        setProfile(p);
        useAuthStore.getState().setUser(p.id, `${p.first_name} ${p.last_name}`);
      } catch {
        /* offline ok */
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, []);

  function handleLogout() {
    Alert.alert(t("auth.logout", "Déconnexion"), t("auth.logoutConfirm", "Voulez-vous vous déconnecter ?"), [
      { text: t("common.cancel", "Annuler"), style: "cancel" },
      {
        text: t("auth.logout", "Déconnexion"),
        style: "destructive",
        onPress: async () => {
          if (trackingEnabled) stopTracking();
          disconnectNotifications();
          useNotifications.getState().clear();
          usePermissions.getState().clear();
          useSettings.getState().clear();
          await clearPersistedAuth();
          logout();
        },
      },
    ]);
  }

  async function handleForceSync() {
    const result = await flushQueue();
    Alert.alert(
      t("settings.sync", "Synchronisation"),
      t("settings.syncResult", "{{success}} envoyée(s), {{failed}} échouée(s).", {
        success: result.success,
        failed: result.failed,
      })
    );
  }

  async function handleClearCache() {
    await clearCache();
    Alert.alert(
      t("settings.clearCache", "Vider le cache"),
      t("settings.cacheCleared", "Le cache local a été supprimé.")
    );
  }

  if (loadingProfile) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center">
        <Spinner color="$primary600" />
      </Box>
    );
  }

  const initials = profile
    ? `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase() || "?"
    : "?";

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
        {/* Profile summary */}
        <Pressable
          onPress={() => navigation.navigate("MyProfile")}
          bg="$white"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$borderLight200"
          p="$4"
          $active-bg="$backgroundLight100"
        >
          <HStack space="md" alignItems="center">
            <Avatar size="lg" bgColor="$primary600">
              <AvatarFallbackText>{initials}</AvatarFallbackText>
              {profile?.avatar_url && <AvatarImage source={{ uri: profile.avatar_url }} alt="" />}
            </Avatar>
            <VStack flex={1}>
              <Heading size="md" color="$textLight900">
                {profile ? `${profile.first_name} ${profile.last_name}` : userDisplayName}
              </Heading>
              <Text size="sm" color="$textLight500">
                {profile?.email}
              </Text>
              {permissionCount > 0 && (
                <Text size="2xs" color="$textLight400" mt="$0.5">
                  {t("settings.permissionsLoaded", "{{count}} permission(s) chargée(s)", {
                    count: permissionCount,
                  })}
                </Text>
              )}
            </VStack>
            <Icon as={ChevronRight} size="md" color="$textLight400" />
          </HStack>
        </Pressable>

        {/* Quick navigation */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" overflow="hidden">
          <NavRow
            icon={UserCircle}
            iconColor="$primary600"
            iconBg="$primary50"
            title={t("settings.myProfile", "Mon profil")}
            description={t("settings.myProfileDesc", "Coordonnées, téléphones, emails, adresses")}
            onPress={() => navigation.navigate("MyProfile")}
          />
          <Divider />
          <NavRow
            icon={ShieldCheck}
            iconColor="$success600"
            iconBg="$success50"
            title={t("settings.verifications", "Mes vérifications")}
            description={t("settings.verificationsDesc", "Téléphone, email, GPS, pièce d'identité")}
            onPress={() => navigation.navigate("VerificationsHub")}
          />
          <Divider />
          <NavRow
            icon={Shield}
            iconColor="$success600"
            iconBg="$success50"
            title={t("settings.compliance", "Ma conformité")}
            description={t("settings.complianceDesc", "Documents, certifications, alertes expiration")}
            onPress={() => navigation.navigate("MyCompliance")}
          />
          <Divider />
          <NavRow
            icon={Bell}
            iconColor="$info600"
            iconBg="$info50"
            title={t("settings.contacts", "Mes contacts & adresses")}
            description={t("settings.contactsDesc", "Téléphones, emails, adresses postales")}
            onPress={() => navigation.navigate("MyContacts")}
          />
          <Divider />
          <NavRow
            icon={SettingsIcon}
            iconColor="$textLight600"
            iconBg="$backgroundLight100"
            title={t("settings.preferences", "Préférences")}
            description={t("settings.preferencesDesc", "Langue, thème, notifications, canal SMS")}
            onPress={() => navigation.navigate("Preferences")}
          />
        </Box>

        {/* Connection status */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$3">
            {t("settings.connection", "Connexion")}
          </Heading>
          <VStack space="sm">
            <HStack alignItems="center" space="sm">
              <Icon
                as={isOnline ? Wifi : WifiOff}
                size="sm"
                color={isOnline ? "$success600" : "$warning600"}
              />
              <Text size="sm" flex={1} color="$textLight900">
                {isOnline ? t("common.online", "En ligne") : t("common.offline", "Hors ligne")}
              </Text>
            </HStack>
            {queueLength > 0 && (
              <HStack alignItems="center" space="sm">
                <Icon as={CloudUpload} size="sm" color="$info600" />
                <Text size="sm" flex={1} color="$textLight900">
                  {t("settings.pendingSync", "{{count}} action(s) en attente de sync", {
                    count: queueLength,
                  })}
                </Text>
                <Button size="xs" variant="outline" onPress={handleForceSync} isDisabled={syncing}>
                  {syncing && <Spinner size="small" color="$primary600" mr="$1" />}
                  <ButtonText>{t("settings.sync", "Sync")}</ButtonText>
                </Button>
              </HStack>
            )}
            {lastSyncAt && (
              <Text size="xs" color="$textLight400">
                {t("settings.lastSync", "Dernière sync :")} {new Date(lastSyncAt).toLocaleString("fr-FR")}
              </Text>
            )}
          </VStack>
        </Box>

        {/* Entity switcher */}
        {entities.length > 1 && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
            <HStack space="sm" alignItems="center" mb="$3">
              <Icon as={Users} size="sm" color="$textLight600" />
              <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5}>
                {t("settings.entity", "Entité")}
              </Heading>
            </HStack>
            <VStack space="xs">
              {entities.map((ent) => {
                const isActive = ent.id === entityId;
                return (
                  <Pressable
                    key={ent.id}
                    onPress={() => {
                      useAuthStore.getState().setEntity(ent.id);
                      usePermissions.getState().fetchPermissions();
                    }}
                    bg={isActive ? "$primary50" : "transparent"}
                    borderRadius="$md"
                    p="$2.5"
                  >
                    <HStack space="sm" alignItems="center">
                      <Icon
                        as={isActive ? CircleCheck : CircleDot}
                        size="sm"
                        color={isActive ? "$primary600" : "$textLight300"}
                      />
                      <VStack flex={1}>
                        <Text size="sm" fontWeight={isActive ? "$bold" : "$medium"} color="$textLight900">
                          {ent.name}
                        </Text>
                        {ent.code && (
                          <Text size="xs" color="$textLight500">
                            {ent.code}
                          </Text>
                        )}
                      </VStack>
                    </HStack>
                  </Pressable>
                );
              })}
            </VStack>
          </Box>
        )}

        {/* App info */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <HStack space="sm" alignItems="center" mb="$3">
            <Icon as={Info} size="sm" color="$textLight600" />
            <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5}>
              {t("settings.application", "Application")}
            </Heading>
          </HStack>
          <HStack justifyContent="space-between" mb="$2">
            <Text size="sm" color="$textLight500">
              {t("settings.version", "Version")}
            </Text>
            <Text size="sm" color="$textLight900" fontWeight="$medium">
              {APP_VERSION}
            </Text>
          </HStack>
          <Divider my="$2" />
          <Pressable onPress={handleClearCache} py="$2">
            <HStack space="sm" alignItems="center">
              <Icon as={Trash2} size="sm" color="$textLight500" />
              <Text size="sm" color="$textLight700" flex={1}>
                {t("settings.clearCache", "Vider le cache local")}
              </Text>
            </HStack>
          </Pressable>
          <Divider my="$2" />
          <Pressable
            onPress={async () => {
              await resetOnboarding();
              Alert.alert(
                t("settings.tutorial", "Tutoriel"),
                t("settings.tutorialReset", "Le tutoriel sera affiché au prochain lancement.")
              );
            }}
            py="$2"
          >
            <HStack space="sm" alignItems="center">
              <Icon as={HelpCircle} size="sm" color="$textLight500" />
              <Text size="sm" color="$textLight700" flex={1}>
                {t("settings.replayTutorial", "Revoir le tutoriel")}
              </Text>
            </HStack>
          </Pressable>
        </Box>

        {/* Logout */}
        <Button size="lg" action="negative" onPress={handleLogout}>
          <Icon as={LogOut} color="$white" size="md" mr="$2" />
          <ButtonText>{t("auth.logout", "Se déconnecter")}</ButtonText>
        </Button>
      </ScrollView>
    </Box>
  );
}

function NavRow({
  icon,
  iconColor,
  iconBg,
  title,
  description,
  onPress,
}: {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  description?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} px="$4" py="$3" $active-bg="$backgroundLight100">
      <HStack space="md" alignItems="center">
        <Box bg={iconBg} borderRadius="$md" p="$2">
          <Icon as={icon} size="sm" color={iconColor} />
        </Box>
        <VStack flex={1}>
          <Text size="md" fontWeight="$medium" color="$textLight900">
            {title}
          </Text>
          {description && (
            <Text size="xs" color="$textLight500">
              {description}
            </Text>
          )}
        </VStack>
        <Icon as={ChevronRight} size="sm" color="$textLight400" />
      </HStack>
    </Pressable>
  );
}
