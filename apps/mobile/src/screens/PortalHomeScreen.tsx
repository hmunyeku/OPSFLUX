/**
 * Portal Home — dynamic role-based landing page.
 *
 * Fetches portal definitions from the server, selects the best
 * matching portal based on user permissions, and renders:
 *  - Quick action cards (scan, create form, list, screen)
 *  - Dashboard stat cards
 *  - Portal switcher if user has access to multiple portals
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Card,
  Chip,
  Divider,
  Surface,
  Text,
  ActivityIndicator,
} from "react-native-paper";
import { useFormRegistry } from "../hooks/useFormRegistry";
import { useResponsive } from "../hooks/useResponsive";
import { useAuthStore } from "../stores/auth";
import { useOfflineStore } from "../services/offline";
import { colors } from "../utils/colors";
import type { PortalAction, PortalDefinition } from "../types/forms";

interface Props {
  navigation: any;
}

export default function PortalHomeScreen({ navigation }: Props) {
  const { portals, forms, loading } = useFormRegistry();
  const { deviceType, contentPadding, gridColumns, cardWidth } = useResponsive();
  const userDisplayName = useAuthStore((s) => s.userDisplayName);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const queueLength = useOfflineStore((s) => s.queueLength);

  const [activePortalId, setActivePortalId] = useState<string | null>(null);

  // Select the first available portal (or let user switch)
  const activePortal = useMemo(() => {
    if (activePortalId) return portals.find((p) => p.id === activePortalId);
    return portals[0] ?? null;
  }, [portals, activePortalId]);

  useEffect(() => {
    if (portals.length && !activePortalId) {
      setActivePortalId(portals[0].id);
    }
  }, [portals]);

  // ── Action Handler ────────────────────────────────────────────────

  const handleAction = useCallback(
    (action: PortalAction) => {
      switch (action.type) {
        case "scan":
          navigation.navigate(action.screen ?? "ScanAds");
          break;
        case "form":
          if (action.form_id) {
            navigation.navigate("DynamicForm", { formId: action.form_id });
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
    [navigation]
  );

  // ── Loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="bodyMedium" style={{ marginTop: 12, color: colors.textSecondary }}>
          Chargement du portail...
        </Text>
      </View>
    );
  }

  // ── Icon Helper (text-based for now, can be replaced with icon lib) ─

  function ActionIcon({ icon, color }: { icon: string; color: string }) {
    const iconLabels: Record<string, string> = {
      scan: "QR",
      "qr-code": "QR",
      "package-plus": "PKG+",
      "user-plus": "ADS+",
      briefcase: "MSN",
      list: "LST",
      inbox: "RCV",
      key: "KEY",
      "check-circle": "VAL",
      users: "PAX",
      "file-edit": "EDT",
    };
    return (
      <View style={[styles.actionIcon, { backgroundColor: color }]}>
        <Text style={styles.actionIconText}>
          {iconLabels[icon] ?? icon.slice(0, 3).toUpperCase()}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { padding: contentPadding }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.greeting}>
          Bonjour{userDisplayName ? `, ${userDisplayName}` : ""}
        </Text>

        {/* Offline banner */}
        {!isOnline && (
          <Surface style={styles.offlineBanner} elevation={1}>
            <Text variant="bodySmall" style={styles.offlineText}>
              Mode hors-ligne
              {queueLength > 0 ? ` — ${queueLength} action(s) en attente` : ""}
            </Text>
          </Surface>
        )}
      </View>

      {/* Portal switcher */}
      {portals.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.portalSwitcher}
        >
          {portals.map((portal) => (
            <Chip
              key={portal.id}
              selected={portal.id === activePortal?.id}
              onPress={() => setActivePortalId(portal.id)}
              style={styles.portalChip}
              selectedColor={colors.primary}
              mode={portal.id === activePortal?.id ? "flat" : "outlined"}
            >
              {portal.title}
            </Chip>
          ))}
        </ScrollView>
      )}

      {/* Portal title */}
      {activePortal && (
        <View style={styles.portalHeader}>
          <Text variant="titleLarge" style={styles.portalTitle}>
            {activePortal.title}
          </Text>
          {activePortal.description && (
            <Text variant="bodyMedium" style={styles.portalDesc}>
              {activePortal.description}
            </Text>
          )}
        </View>
      )}

      {/* Quick actions grid */}
      {activePortal && (
        <View style={styles.actionsGrid}>
          {activePortal.actions.map((action) => (
            <Pressable
              key={action.id}
              style={[styles.actionCard, { width: cardWidth }]}
              onPress={() => handleAction(action)}
            >
              <Surface style={styles.actionCardInner} elevation={1}>
                <ActionIcon
                  icon={action.icon}
                  color={
                    action.type === "scan"
                      ? colors.accent
                      : action.type === "form"
                      ? colors.primary
                      : colors.info
                  }
                />
                <Text variant="titleSmall" style={styles.actionTitle}>
                  {action.title}
                </Text>
              </Surface>
            </Pressable>
          ))}
        </View>
      )}

      {/* Dashboard cards */}
      {activePortal?.dashboard_cards && activePortal.dashboard_cards.length > 0 && (
        <>
          <Divider style={styles.divider} />
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Tableau de bord
          </Text>
          <View style={styles.dashboardGrid}>
            {activePortal.dashboard_cards.map((card, i) => (
              <Surface key={i} style={styles.dashboardCard} elevation={1}>
                <Text variant="bodySmall" style={styles.dashboardLabel}>
                  {card.title}
                </Text>
                <Text variant="headlineMedium" style={styles.dashboardValue}>
                  —
                </Text>
              </Surface>
            ))}
          </View>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {},
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: 16,
  },
  greeting: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  offlineBanner: {
    marginTop: 10,
    backgroundColor: colors.warning + "15",
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  offlineText: {
    color: colors.warning,
    fontWeight: "600",
  },
  portalSwitcher: {
    marginBottom: 16,
  },
  portalChip: {
    marginRight: 8,
  },
  portalHeader: {
    marginBottom: 20,
  },
  portalTitle: {
    fontWeight: "700",
    color: colors.primary,
  },
  portalDesc: {
    color: colors.textSecondary,
    marginTop: 4,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  actionCard: {
    minWidth: 140,
  },
  actionCardInner: {
    borderRadius: 14,
    padding: 18,
    backgroundColor: colors.surface,
    alignItems: "flex-start",
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  actionIconText: {
    color: colors.textInverse,
    fontSize: 13,
    fontWeight: "800",
  },
  actionTitle: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  divider: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 12,
  },
  dashboardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  dashboardCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 12,
    padding: 16,
    backgroundColor: colors.surface,
  },
  dashboardLabel: {
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dashboardValue: {
    fontWeight: "700",
    color: colors.primary,
    marginTop: 4,
  },
});
