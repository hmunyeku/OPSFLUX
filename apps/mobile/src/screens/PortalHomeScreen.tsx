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
import {
  Badge,
  BadgeText,
  Box,
  Heading,
  HStack,
  Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import Skeleton from "../components/Skeleton";
import { EmptyInbox } from "../components/illustrations";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

import { useFormRegistry } from "../hooks/useFormRegistry";
import { useResponsive } from "../hooks/useResponsive";
import { usePermissions } from "../stores/permissions";
import { useOfflineStore } from "../services/offline";
import { useToast } from "../components/Toast";
import { useActivePortal } from "../stores/activePortal";
import { iconByName } from "../utils/iconMap";
import type { PortalAction, PortalDefinition } from "../types/forms";

interface Props {
  navigation: any;
}

export default function PortalHomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { portals, forms, loading, refresh } = useFormRegistry();
  const { deviceType } = useResponsive();
  const isTablet = deviceType === "tablet";

  const permissions = usePermissions((s) => s.permissions);
  const hasPermission = usePermissions((s) => s.hasAny);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const queueLength = useOfflineStore((s) => s.queueLength);
  const toast = useToast();

  // The active portal id lives in a shared store so the AppTopBar
  // switcher (above) and this body stay in sync.
  const activePortalId = useActivePortal((s) => s.activePortalId);
  const setActivePortalId = useActivePortal((s) => s.setActivePortalId);
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

  /**
   * Some portal actions target screens that live in OTHER tabs (e.g.
   * "LiveTracking" is in the Tracking tab, "ScanCargo" in the Scanner
   * tab). A plain `navigation.navigate("LiveTracking")` from inside
   * HomeStack doesn't find the screen and the tap does nothing. This
   * map routes each known cross-tab name to the correct parent tab +
   * nested screen.
   */
  const CROSS_TAB_ROUTES: Record<
    string,
    { tab: string; screen: string }
  > = {
    LiveTracking: { tab: "Tracking", screen: "LiveTracking" },
    ScanCargo: { tab: "Scanner", screen: "ScanCargo" },
    ScanAds: { tab: "Scanner", screen: "ScanAds" },
    SmartScan: { tab: "Scanner", screen: "SmartScan" },
    Scanner: { tab: "Scanner", screen: "SmartScan" },
    NotificationsMain: {
      tab: "Notifications",
      screen: "NotificationsMain",
    },
  };

  const routeTo = useCallback(
    (screenName: string, params?: Record<string, unknown>) => {
      const cross = CROSS_TAB_ROUTES[screenName];
      if (cross) {
        navigation.navigate(cross.tab, {
          screen: cross.screen,
          params,
        });
        return;
      }
      navigation.navigate(screenName, params ?? {});
    },
    [navigation]
  );

  const handleAction = useCallback(
    (action: PortalAction) => {
      Haptics.selectionAsync();
      switch (action.type) {
        case "scan":
          routeTo(action.screen ?? "Scanner");
          break;
        case "form":
          if (action.form_id) {
            const formDef = forms.find((f) => f.id === action.form_id);
            if (formDef) {
              // Pass the full formDef in the nav params — DynamicFormScreen
              // uses it directly and skips a second round-trip to the
              // form registry. Without this, opening a form always
              // showed "Chargement du formulaire..." for a few seconds
              // while useFormRegistry re-fetched data that was already
              // in memory from the bootstrap.
              navigation.navigate("DynamicForm", {
                formId: action.form_id,
                formTitle: formDef.title,
                formDef,
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
            routeTo(action.screen, action.params);
          } else {
            toast.show(
              t("home.screenUnavailable", "Action non disponible"),
              "warning"
            );
          }
          break;
      }
    },
    [navigation, forms, toast, t, routeTo]
  );

  /* ── Loading + empty states ──────────────────────────────────────── */

  if (loading) {
    return (
      <Box flex={1} bg="$backgroundLight50" pt="$3" px="$4">
        <Skeleton width="100%" height={92} radius={16} style={{ marginBottom: 20 }} />
        <Skeleton width={140} height={12} style={{ marginBottom: 12 }} />
        <HStack flexWrap="wrap" gap={12}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width="47%" height={88} radius={12} />
          ))}
        </HStack>
      </Box>
    );
  }

  if (accessiblePortals.length === 0) {
    return (
      <Box
        flex={1}
        bg="$backgroundLight50"
        alignItems="center"
        justifyContent="center"
        p="$6"
      >
        <EmptyInbox width={180} />
        <Heading mt="$5" size="md" color="$textLight900">
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

  return (
    <Box flex={1} bg="$backgroundLight50">
      <ScrollView
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: 24,
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
        {/* Connection status chip */}
        <Box px="$4" mb="$3">
          <ConnectionChip isOnline={isOnline} queueLength={queueLength} />
        </Box>

        {/* ── Big scan CTA ───────────────────────────────────────── */}
        <Box px="$4" mb="$5">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              routeTo("SmartScan");
            }}
            bg="$primary600"
            borderRadius="$xl"
            p="$5"
            $active-bg="$primary700"
            style={{
              shadowColor: "#0f172a",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 4,
            }}
          >
            <HStack alignItems="center" space="md">
              <Box bg="$primary500" borderRadius="$lg" p="$3">
                <MIcon name="qr-code-scanner" size="xl" color="$white" />
              </Box>
              <VStack flex={1}>
                <Heading size="md" color="$white">
                  {t("home.scanCta.title", "Scanner un QR")}
                </Heading>
                <Text size="sm" color="$white" opacity={0.85}>
                  {t("home.scanCta.subtitle", "ADS, colis, mission — auto-détection")}
                </Text>
              </VStack>
              <MIcon name="chevron-right" size="lg" color="$white" />
            </HStack>
          </Pressable>
        </Box>

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
            <VStack
              space="xs"
              bg="$white"
              borderRadius="$lg"
              borderWidth={1}
              borderColor="$borderLight200"
              style={{
                shadowColor: "#0f172a",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 3,
                elevation: 1,
              }}
            >
              {activePortal.actions.slice(isTablet ? 8 : 4).map((action, idx) => {
                const actionIconName = iconByName(action.icon);
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
                        <MIcon name={actionIconName} size="sm" color="$textLight700" />
                      </Box>
                      <Text flex={1} size="md" color="$textLight900">
                        {action.title}
                      </Text>
                      <MIcon name="chevron-right" size="sm" color="$textLight400" />
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
        <MIcon name="check-circle" size="xs" color="$success600" />
        <Text size="xs" color="$textLight500">
          {t("home.allSynced", "Tout est synchronisé")}
        </Text>
      </HStack>
    );
  }

  if (!isOnline) {
    return (
      <Badge action="warning" variant="solid" alignSelf="flex-start">
        <MIcon name="wifi-off" size="xs" color="$white" mr="$1" />
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
      <MIcon name="wifi" size="xs" color="$white" mr="$1" />
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
  const actionIconName = iconByName(action.icon);
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
      style={{
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
      }}
    >
      <Box bg="$primary50" borderRadius="$md" p="$2" alignSelf="flex-start" mb="$2">
        <MIcon name={actionIconName} size="md" color="$primary700" />
      </Box>
      <Text size="sm" fontWeight="$semibold" color="$textLight900" numberOfLines={2}>
        {action.title}
      </Text>
    </Pressable>
  );
}

