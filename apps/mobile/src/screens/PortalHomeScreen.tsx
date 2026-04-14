/**
 * PortalHomeScreen — Gluestack refonte, banking-app inspired layout.
 *
 * Layout (top to bottom):
 *   1. Hero header — greeting + avatar + alert chips (offline / sync)
 *   2. Big "Scanner" CTA card (most-used action surfaced front)
 *   3. Quick action grid (4 tiles per row on phone, 6 on tablet)
 *   4. Portal switcher (segmented control if multiple portals available)
 *   5. Portal-specific actions list (cards with icon + label + chevron)
 *   6. Dashboard cards (stats from the portal config, if any)
 *
 * Strings via t("key", "fallback"). NativeWind tailwind classes for layout,
 * Gluestack components for primitives. Smooth Pressable feedback + haptic.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Avatar,
  AvatarFallbackText,
  AvatarImage,
  Badge,
  BadgeText,
  Box,
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
  CheckCircle2,
  ChevronRight,
  Lock,
  QrCode,
  Search,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

import { useFormRegistry } from "../hooks/useFormRegistry";
import { useResponsive } from "../hooks/useResponsive";
import { useAuthStore } from "../stores/auth";
import { usePermissions } from "../stores/permissions";
import { useOfflineStore } from "../services/offline";
import { useNotifications } from "../services/notifications";
import { useToast } from "../components/Toast";
import { iconByName } from "../utils/iconMap";
import type { PortalAction, PortalDefinition } from "../types/forms";

interface Props {
  navigation: any;
}

export default function PortalHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { portals, forms, loading, refresh } = useFormRegistry();
  const { deviceType } = useResponsive();
  const isTablet = deviceType === "tablet";

  const userDisplayName = useAuthStore((s) => s.userDisplayName);
  const permissions = usePermissions((s) => s.permissions);
  const hasPermission = usePermissions((s) => s.hasAny);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const queueLength = useOfflineStore((s) => s.queueLength);
  const unreadCount = useNotifications((s) => s.unreadCount);
  const toast = useToast();

  const [activePortalId, setActivePortalId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const accessiblePortals = useMemo(() => {
    return portals.filter((portal) => {
      const perms = portal.access?.permissions ?? [];
      const roles = portal.access?.role_slugs ?? [];
      if (perms.length === 0 && roles.length === 0) return true;
      if (perms.length > 0 && hasPermission(perms)) return true;
      if (roles.includes("user")) return true;
      return false;
    });
  }, [portals, permissions, hasPermission]);

  const activePortal: PortalDefinition | null = useMemo(() => {
    if (activePortalId) return accessiblePortals.find((p) => p.id === activePortalId) ?? null;
    return accessiblePortals[0] ?? null;
  }, [accessiblePortals, activePortalId]);

  useEffect(() => {
    if (accessiblePortals.length && !activePortalId) {
      setActivePortalId(accessiblePortals[0].id);
    }
  }, [accessiblePortals, activePortalId]);

  const handleAction = useCallback(
    (action: PortalAction) => {
      Haptics.selectionAsync();
      switch (action.type) {
        case "scan":
          navigation.navigate(action.screen ?? "Scanner");
          break;
        case "form":
          if (action.form_id) {
            const formDef = forms.find((f) => f.id === action.form_id);
            if (formDef) {
              navigation.navigate("DynamicForm", {
                formId: action.form_id,
                formTitle: formDef.title,
              });
            } else {
              toast.show(
                t("home.formUnavailable", `Formulaire "{{id}}" non disponible`, {
                  id: action.form_id,
                }),
                "warning"
              );
            }
          }
          break;
        case "list":
        case "screen":
          if (action.screen) {
            navigation.navigate(action.screen, action.params ?? {});
          }
          break;
      }
    },
    [navigation, forms, toast, t]
  );

  /* ── Loading + empty states ──────────────────────────────────────── */

  if (loading) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center">
        <Spinner color="$primary600" />
        <Text mt="$3" size="sm" color="$textLight500">
          {t("common.loading", "Chargement...")}
        </Text>
      </Box>
    );
  }

  if (accessiblePortals.length === 0) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center" p="$6">
        <Icon as={Lock} size="xl" color="$textLight400" />
        <Heading mt="$3" size="md" color="$textLight900">
          {t("home.noPortalTitle", "Aucun portail disponible")}
        </Heading>
        <Text mt="$2" textAlign="center" color="$textLight500" maxWidth={320}>
          {t(
            "home.noPortalDesc",
            "Votre compte n'a pas encore de permissions attribuées. Contactez votre administrateur."
          )}
        </Text>
      </Box>
    );
  }

  /* ── Main render ──────────────────────────────────────────────────── */

  const initials = (userDisplayName ?? "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const greeting = greetingForHour(new Date());

  return (
    <Box flex={1} bg="$backgroundLight50">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await refresh?.();
              } finally {
                setRefreshing(false);
              }
            }}
          />
        }
      >
        {/* ── Hero header ───────────────────────────────────────── */}
        <Box px="$4" mb="$5">
          <HStack alignItems="center" justifyContent="space-between" mb="$3">
            <Pressable onPress={() => navigation.navigate("Settings", { screen: "MyProfile" })}>
              <HStack alignItems="center" space="sm">
                <Avatar size="md" bgColor="$primary600">
                  <AvatarFallbackText>{initials}</AvatarFallbackText>
                </Avatar>
                <VStack>
                  <Text size="xs" color="$textLight500">
                    {t(`home.greeting.${greeting.key}`, greeting.fallback)}
                  </Text>
                  <Text size="md" fontWeight="$semibold" color="$textLight900">
                    {userDisplayName ?? t("home.welcome", "Bienvenue")}
                  </Text>
                </VStack>
              </HStack>
            </Pressable>

            <HStack space="sm">
              <Pressable
                onPress={() => navigation.navigate("Notifications")}
                p="$2.5"
                borderRadius="$full"
                bg="$white"
                borderWidth={1}
                borderColor="$borderLight200"
              >
                <Box>
                  <Icon as={Bell} size="md" color="$textLight700" />
                  {unreadCount > 0 && (
                    <Box
                      position="absolute"
                      top={-4}
                      right={-4}
                      bg="$error500"
                      borderRadius="$full"
                      minWidth={16}
                      height={16}
                      alignItems="center"
                      justifyContent="center"
                      px={3}
                    >
                      <Text size="2xs" color="$white" fontWeight="$bold">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </Text>
                    </Box>
                  )}
                </Box>
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate("Search")}
                p="$2.5"
                borderRadius="$full"
                bg="$white"
                borderWidth={1}
                borderColor="$borderLight200"
              >
                <Icon as={Search} size="md" color="$textLight700" />
              </Pressable>
            </HStack>
          </HStack>

          {/* Connection status chip */}
          <ConnectionChip isOnline={isOnline} queueLength={queueLength} />
        </Box>

        {/* ── Big scan CTA ───────────────────────────────────────── */}
        <Box px="$4" mb="$5">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              navigation.navigate("Scanner");
            }}
            bg="$primary600"
            borderRadius="$xl"
            p="$5"
            $active-bg="$primary700"
          >
            <HStack alignItems="center" space="md">
              <Box bg="$primary500" borderRadius="$lg" p="$3">
                <Icon as={QrCode} size="xl" color="$white" />
              </Box>
              <VStack flex={1}>
                <Heading size="md" color="$white">
                  {t("home.scanCta.title", "Scanner un QR")}
                </Heading>
                <Text size="sm" color="$white" opacity={0.85}>
                  {t("home.scanCta.subtitle", "ADS, colis, mission — auto-détection")}
                </Text>
              </VStack>
              <Icon as={ChevronRight} size="lg" color="$white" />
            </HStack>
          </Pressable>
        </Box>

        {/* ── Portal switcher (if multiple) ───────────────────────── */}
        {accessiblePortals.length > 1 && (
          <Box px="$4" mb="$4">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {accessiblePortals.map((p) => {
                const isActive = p.id === activePortal?.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setActivePortalId(p.id)}
                    bg={isActive ? "$primary600" : "$white"}
                    borderWidth={1}
                    borderColor={isActive ? "$primary600" : "$borderLight200"}
                    px="$3"
                    py="$1.5"
                    borderRadius="$full"
                  >
                    <Text
                      size="sm"
                      fontWeight="$semibold"
                      color={isActive ? "$white" : "$textLight700"}
                    >
                      {p.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Box>
        )}

        {/* ── Quick action grid ───────────────────────────────────── */}
        {activePortal?.actions && activePortal.actions.length > 0 && (
          <Box px="$4" mb="$4">
            <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$3">
              {t("home.quickActions", "Actions rapides")}
            </Heading>
            <Box flexDirection="row" flexWrap="wrap" gap={12}>
              {activePortal.actions.slice(0, isTablet ? 8 : 4).map((action, idx) => (
                <ActionTile
                  key={idx}
                  action={action}
                  width={isTablet ? "23%" : "47%"}
                  onPress={() => handleAction(action)}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* ── More actions list ────────────────────────────────────── */}
        {activePortal?.actions && activePortal.actions.length > (isTablet ? 8 : 4) && (
          <Box px="$4" mb="$4">
            <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$3">
              {t("home.moreActions", "Plus d'actions")}
            </Heading>
            <VStack space="xs" bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200">
              {activePortal.actions.slice(isTablet ? 8 : 4).map((action, idx) => {
                const ActionIcon = iconByName(action.icon ?? "list") as LucideIcon;
                return (
                  <Pressable
                    key={idx}
                    onPress={() => handleAction(action)}
                    px="$4"
                    py="$3"
                    borderTopWidth={idx === 0 ? 0 : 1}
                    borderColor="$borderLight100"
                    $active-bg="$backgroundLight100"
                  >
                    <HStack alignItems="center" space="md">
                      <Box bg="$backgroundLight100" borderRadius="$md" p="$2">
                        <Icon as={ActionIcon} size="sm" color="$textLight700" />
                      </Box>
                      <Text flex={1} size="md" color="$textLight900">
                        {action.title}
                      </Text>
                      <Icon as={ChevronRight} size="sm" color="$textLight400" />
                    </HStack>
                  </Pressable>
                );
              })}
            </VStack>
          </Box>
        )}

        {/* ── Portal description / footer ─────────────────────────── */}
        {activePortal?.description && (
          <Box px="$4">
            <Text size="xs" color="$textLight400" textAlign="center">
              {activePortal.description}
            </Text>
          </Box>
        )}
      </ScrollView>
    </Box>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function ConnectionChip({ isOnline, queueLength }: { isOnline: boolean; queueLength: number }) {
  const { t } = useTranslation();

  if (isOnline && queueLength === 0) {
    return (
      <HStack alignItems="center" space="xs">
        <Icon as={CheckCircle2} size="xs" color="$success600" />
        <Text size="xs" color="$textLight500">
          {t("home.allSynced", "Tout est synchronisé")}
        </Text>
      </HStack>
    );
  }

  if (!isOnline) {
    return (
      <Badge action="warning" variant="solid" alignSelf="flex-start">
        <Icon as={WifiOff} size="xs" color="$white" mr="$1" />
        <BadgeText>
          {queueLength > 0
            ? t("home.offlineWithQueue", "Hors ligne · {{count}} en attente", { count: queueLength })
            : t("home.offline", "Hors ligne")}
        </BadgeText>
      </Badge>
    );
  }

  // Online but with queue — syncing
  return (
    <Badge action="info" variant="solid" alignSelf="flex-start">
      <Icon as={Wifi} size="xs" color="$white" mr="$1" />
      <BadgeText>
        {t("home.syncing", "Synchronisation · {{count}} en attente", { count: queueLength })}
      </BadgeText>
    </Badge>
  );
}

function ActionTile({
  action,
  width,
  onPress,
}: {
  action: PortalAction;
  width: string | number;
  onPress: () => void;
}) {
  const ActionIcon = iconByName(action.icon ?? "list") as LucideIcon;
  return (
    <Pressable
      onPress={onPress}
      bg="$white"
      borderRadius="$lg"
      borderWidth={1}
      borderColor="$borderLight200"
      p="$3"
      width={width as any}
      $active-bg="$backgroundLight100"
    >
      <Box bg="$primary50" borderRadius="$md" p="$2" alignSelf="flex-start" mb="$2">
        <Icon as={ActionIcon} size="md" color="$primary700" />
      </Box>
      <Text size="sm" fontWeight="$semibold" color="$textLight900" numberOfLines={2}>
        {action.title}
      </Text>
    </Pressable>
  );
}

function greetingForHour(d: Date): { key: string; fallback: string } {
  const h = d.getHours();
  if (h < 12) return { key: "morning", fallback: "Bonjour" };
  if (h < 18) return { key: "afternoon", fallback: "Bon après-midi" };
  return { key: "evening", fallback: "Bonsoir" };
}
