/**
 * AppTopBar — shared application header.
 *
 * Layout (left → right):
 *  - User avatar (taps → Mon profil)
 *  - Greeting + name
 *  - Portal switcher (when more than 1 accessible portal)
 *  - Notifications bell with unread badge
 *  - Search icon
 *
 * Replaces the inline header that used to live inside PortalHomeScreen
 * — this matches the convention of pretty much every modern mobile app
 * (single persistent top bar instead of per-screen body controls).
 */

import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Avatar,
  AvatarFallbackText,
  Box,
  HStack,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { MIcon } from "./MIcon";
import { useAuthStore } from "../stores/auth";
import { useNotifications } from "../services/notifications";
import { useFormRegistry } from "../hooks/useFormRegistry";
import { usePermissions } from "../stores/permissions";
import { useActivePortal } from "../stores/activePortal";
import { colors } from "../utils/colors";
import type { PortalDefinition } from "../types/forms";

function greetingForHour(d: Date): { key: string; fb: string } {
  const h = d.getHours();
  if (h < 12) return { key: "morning", fb: "Bonjour" };
  if (h < 18) return { key: "afternoon", fb: "Bon après-midi" };
  return { key: "evening", fb: "Bonsoir" };
}

interface Props {
  /** Show the portal switcher row (only on PortalHome). */
  showPortalSwitcher?: boolean;
  /** Optional title to display instead of the greeting. */
  title?: string;
}

export default function AppTopBar({
  showPortalSwitcher = false,
  title,
}: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const userDisplayName = useAuthStore((s) => s.userDisplayName);
  const unreadCount = useNotifications((s) => s.unreadCount);
  const { portals } = useFormRegistry();
  const hasPermission = usePermissions((s) => s.hasAny);
  const activePortalId = useActivePortal((s) => s.activePortalId);
  const setActivePortalId = useActivePortal((s) => s.setActivePortalId);

  const accessiblePortals: PortalDefinition[] = useMemo(() => {
    return portals.filter((p) => {
      const perms = p.access?.permissions ?? [];
      const roles = p.access?.role_slugs ?? [];
      if (perms.length === 0 && roles.length === 0) return true;
      if (perms.length > 0 && hasPermission(perms)) return true;
      if (roles.includes("user")) return true;
      return false;
    });
  }, [portals, hasPermission]);

  const initials = (userDisplayName ?? "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const greeting = greetingForHour(new Date());
  const showSwitcher = showPortalSwitcher && accessiblePortals.length > 1;

  return (
    <Box
      bg="$primary600"
      pt={insets.top}
      style={styles.shadow}
    >
      <HStack
        alignItems="center"
        justifyContent="space-between"
        px="$3"
        py="$2.5"
      >
        {/* Left: avatar + name */}
        <Pressable
          onPress={() =>
            navigation.navigate("Settings", { screen: "MyProfile" })
          }
          style={styles.avatarRow}
          hitSlop={6}
        >
          <Avatar size="sm" bgColor="$primary800">
            <AvatarFallbackText style={{ color: "#fff" }}>
              {initials}
            </AvatarFallbackText>
          </Avatar>
          <VStack ml={10} flex={1}>
            {title ? (
              <Text size="sm" color="$white" fontWeight="$semibold" numberOfLines={1}>
                {title}
              </Text>
            ) : (
              <>
                <Text size="2xs" color="$white" opacity={0.75}>
                  {t(`home.greeting.${greeting.key}`, greeting.fb)}
                </Text>
                <Text
                  size="sm"
                  color="$white"
                  fontWeight="$semibold"
                  numberOfLines={1}
                >
                  {userDisplayName ?? t("home.welcome", "Bienvenue")}
                </Text>
              </>
            )}
          </VStack>
        </Pressable>

        {/* Right: actions */}
        <HStack space="sm" alignItems="center">
          <Pressable
            onPress={() =>
              navigation.navigate("Home", { screen: "Search" })
            }
            style={styles.iconBtn}
            hitSlop={6}
          >
            <MIcon name="search" size="md" color="$white" />
          </Pressable>
          <Pressable
            onPress={() =>
              navigation.navigate("Notifications", {
                screen: "NotificationsMain",
              })
            }
            style={styles.iconBtn}
            hitSlop={6}
          >
            <View>
              <MIcon name="notifications" size="md" color="$white" />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text
                    size="2xs"
                    color="$white"
                    fontWeight="$bold"
                    style={{ lineHeight: 12 }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </HStack>
      </HStack>

      {/* Portal switcher row (only on PortalHome when multiple portals) */}
      {showSwitcher && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.switcherRow}
        >
          {accessiblePortals.map((p) => {
            const active = (activePortalId ?? accessiblePortals[0]?.id) === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setActivePortalId(p.id)}
                style={[
                  styles.switcherChip,
                  active && styles.switcherChipActive,
                ]}
              >
                <Text
                  size="xs"
                  fontWeight="$semibold"
                  color={active ? "$primary700" : "$white"}
                >
                  {p.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  switcherRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  switcherChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  switcherChipActive: {
    backgroundColor: "#fff",
    borderColor: "#fff",
  },
});
