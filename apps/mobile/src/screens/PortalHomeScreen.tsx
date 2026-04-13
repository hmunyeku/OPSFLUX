/**
 * Portal Home — sober role-based landing page.
 *
 * Professional design: clean whites, subtle borders, typography hierarchy.
 * No gradients, no flashy colors. Inspired by Linear/Notion/Stripe dashboard.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, Text, ActivityIndicator } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useFormRegistry } from "../hooks/useFormRegistry";
import { useResponsive } from "../hooks/useResponsive";
import { useAuthStore } from "../stores/auth";
import { usePermissions } from "../stores/permissions";
import { useOfflineStore } from "../services/offline";
import { useNotifications } from "../services/notifications";
import { useToast } from "../components/Toast";
import ActionTile from "../components/ui/ActionTile";
import { colors } from "../utils/colors";
import { radius, spacing, typography } from "../utils/design";
import type { PortalAction } from "../types/forms";

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  scan: "qr-code-outline",
  "qr-code": "qr-code-outline",
  "scan-circle": "scan-outline",
  "package-plus": "cube-outline",
  "user-plus": "person-add-outline",
  briefcase: "briefcase-outline",
  list: "list-outline",
  inbox: "archive-outline",
  key: "key-outline",
  "check-circle": "checkmark-circle-outline",
  users: "people-outline",
  "file-edit": "create-outline",
  truck: "car-outline",
  anchor: "boat-outline",
  car: "car-sport-outline",
  "building-2": "business-outline",
  "layout-dashboard": "grid-outline",
  "map-pin": "location-outline",
  navigation: "navigate-outline",
  search: "search-outline",
  settings: "settings-outline",
};

const ACCENT_MAP: Record<string, string> = {
  scan: colors.accent,
  form: colors.primary,
  list: colors.info,
  screen: colors.primaryLight,
};

interface Props {
  navigation: any;
}

export default function PortalHomeScreen({ navigation }: Props) {
  const { portals, forms, loading } = useFormRegistry();
  const { cardWidth } = useResponsive();
  const insets = useSafeAreaInsets();
  const userDisplayName = useAuthStore((s) => s.userDisplayName);
  const permissions = usePermissions((s) => s.permissions);
  const hasPermission = usePermissions((s) => s.hasAny);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const queueLength = useOfflineStore((s) => s.queueLength);
  const unreadCount = useNotifications((s) => s.unreadCount);
  const toast = useToast();

  const [activePortalId, setActivePortalId] = useState<string | null>(null);

  const accessiblePortals = useMemo(() => {
    return portals.filter((portal) => {
      const perms = portal.access?.permissions ?? [];
      const roles = portal.access?.role_slugs ?? [];
      if (perms.length === 0 && roles.length === 0) return true;
      if (perms.length > 0 && hasPermission(perms)) return true;
      if (roles.includes("user")) return true;
      return false;
    });
  }, [portals, permissions]);

  const activePortal = useMemo(() => {
    if (activePortalId) return accessiblePortals.find((p) => p.id === activePortalId);
    return accessiblePortals[0] ?? null;
  }, [accessiblePortals, activePortalId]);

  useEffect(() => {
    if (accessiblePortals.length && !activePortalId) {
      setActivePortalId(accessiblePortals[0].id);
    }
  }, [accessiblePortals]);

  const handleAction = useCallback(
    (action: PortalAction) => {
      Haptics.selectionAsync();
      switch (action.type) {
        case "scan":
          navigation.navigate(action.screen ?? "ScanAds");
          break;
        case "form":
          if (action.form_id) {
            const formDef = forms.find((f) => f.id === action.form_id);
            if (formDef) {
              navigation.navigate("DynamicForm", { formId: action.form_id, formTitle: formDef.title });
            } else {
              toast.show(`Formulaire "${action.form_id}" non disponible`, "warning");
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
    [navigation, forms, toast]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (accessiblePortals.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Aucun portail disponible</Text>
        <Text style={styles.emptySubtitle}>
          Votre compte n'a pas encore de permissions attribuées. Contactez votre administrateur.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.base,
          paddingBottom: spacing["3xl"],
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Sober header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {userDisplayName ?? "Bienvenue"}
            </Text>
            {!isOnline && (
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
                <Text style={styles.statusText}>
                  Hors ligne{queueLength > 0 ? ` · ${queueLength} en attente` : ""}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconButton}
              onPress={() => navigation.navigate("Search")}
              android_ripple={{ color: colors.primary + "15", borderless: true, radius: 20 }}
            >
              <Ionicons name="search-outline" size={22} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              style={[styles.iconButton, { marginLeft: spacing.xs }]}
              onPress={() => navigation.navigate("Notifications")}
              android_ripple={{ color: colors.primary + "15", borderless: true, radius: 20 }}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* Portal switcher */}
        {accessiblePortals.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.portalSwitcher}
          >
            {accessiblePortals.map((portal) => (
              <Chip
                key={portal.id}
                selected={portal.id === activePortal?.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActivePortalId(portal.id);
                }}
                style={[
                  styles.portalChip,
                  portal.id === activePortal?.id && styles.portalChipActive,
                ]}
                textStyle={[
                  styles.portalChipText,
                  portal.id === activePortal?.id && styles.portalChipTextActive,
                ]}
                mode={portal.id === activePortal?.id ? "flat" : "outlined"}
                compact
              >
                {portal.title}
              </Chip>
            ))}
          </ScrollView>
        )}

        {/* Section header */}
        {activePortal && (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{activePortal.title}</Text>
            {activePortal.description && (
              <Text style={styles.sectionDesc}>{activePortal.description}</Text>
            )}
          </View>
        )}

        {/* Actions grid */}
        {activePortal && (
          <View style={styles.actionsGrid}>
            {activePortal.actions.map((action) => {
              const iconName = ICON_MAP[action.icon] ?? "ellipse-outline";
              const accent = ACCENT_MAP[action.type] ?? colors.primary;
              return (
                <ActionTile
                  key={action.id}
                  title={action.title}
                  icon={iconName}
                  accent={accent}
                  width={cardWidth}
                  onPress={() => handleAction(action)}
                />
              );
            })}
          </View>
        )}

        {/* Dashboard (subtle, no cards-in-cards) */}
        {activePortal?.dashboard_cards && activePortal.dashboard_cards.length > 0 && (
          <View style={styles.dashboardSection}>
            <Text style={styles.dashboardTitle}>Indicateurs</Text>
            <View style={styles.dashboardGrid}>
              {activePortal.dashboard_cards.map((card, i) => (
                <View key={i} style={styles.statCard}>
                  <Text style={styles.statLabel}>{card.title}</Text>
                  <Text style={styles.statValue}>—</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  loadingText: { ...typography.bodySm, color: colors.textMuted, marginTop: spacing.md },
  emptyTitle: { ...typography.headlineMd, color: colors.textPrimary, marginTop: spacing.lg, textAlign: "center" },
  emptySubtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 280,
    lineHeight: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.base,
  },
  greeting: {
    ...typography.displaySm,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.xs },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { ...typography.caption, color: colors.textSecondary },
  headerActions: { flexDirection: "row", alignItems: "center" },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.background,
  },
  notifBadgeText: { color: "#ffffff", fontSize: 9, fontWeight: "800" },

  portalSwitcher: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  portalChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  portalChipActive: { backgroundColor: colors.textPrimary },
  portalChipText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  portalChipTextActive: { color: "#ffffff" },

  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  sectionTitle: { ...typography.headlineMd, color: colors.textPrimary },
  sectionDesc: { ...typography.bodyMd, color: colors.textSecondary, marginTop: 4 },

  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },

  dashboardSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing["2xl"],
  },
  dashboardTitle: {
    ...typography.titleSm,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  dashboardGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: {
    flex: 1,
    minWidth: 140,
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    ...typography.displaySm,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
});
