/**
 * Notifications screen — in-app notification center.
 *
 * Shows real-time notifications from the WebSocket connection.
 * Supports mark-as-read and navigation to related resources.
 */

import React from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Badge, Button, Divider, Surface, Text } from "react-native-paper";
import {
  useNotifications,
  sendMarkRead,
  AppNotification,
} from "../services/notifications";
import { colors } from "../utils/colors";

interface Props {
  navigation: any;
}

export default function NotificationsScreen({ navigation }: Props) {
  const { notifications, unreadCount, markAllRead } = useNotifications();

  function handlePress(notif: AppNotification) {
    if (!notif.read) {
      sendMarkRead(notif.id);
    }
    // Navigate based on notification data
    const data = notif.data;
    if (data?.resource_type === "ads" && data?.resource_id) {
      navigation.navigate("AdsList", { highlightId: data.resource_id });
    } else if (data?.resource_type === "cargo" && data?.resource_id) {
      navigation.navigate("CargoList", { highlightId: data.resource_id });
    }
  }

  const renderItem = ({ item }: { item: AppNotification }) => (
    <Pressable onPress={() => handlePress(item)}>
      <Surface
        style={[styles.notifCard, !item.read && styles.notifUnread]}
        elevation={item.read ? 0 : 1}
      >
        <View style={styles.notifHeader}>
          <View style={styles.notifTitleRow}>
            {!item.read && <View style={styles.unreadDot} />}
            <Text
              variant="titleSmall"
              style={[styles.notifTitle, !item.read && styles.notifTitleBold]}
            >
              {item.title}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.notifTime}>
            {formatTime(item.created_at)}
          </Text>
        </View>
        <Text variant="bodyMedium" style={styles.notifMessage}>
          {item.message}
        </Text>
      </Surface>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <View style={styles.topBar}>
          <Text variant="bodySmall" style={styles.unreadLabel}>
            {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
          </Text>
          <Button compact mode="text" onPress={markAllRead}>
            Tout marquer lu
          </Button>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="titleMedium" style={styles.emptyTitle}>
              Aucune notification
            </Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              Vous serez notifié des événements importants ici.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function formatTime(isoStr: string): string {
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `il y a ${diffD}j`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unreadLabel: { color: colors.textSecondary, fontWeight: "600" },
  listContent: { padding: 10 },
  notifCard: {
    borderRadius: 10,
    padding: 14,
    backgroundColor: colors.surface,
  },
  notifUnread: {
    backgroundColor: colors.primary + "08",
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  notifHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  notifTitleRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 8,
  },
  notifTitle: { color: colors.textPrimary },
  notifTitleBold: { fontWeight: "700" },
  notifTime: { color: colors.textMuted, marginLeft: 8 },
  notifMessage: { color: colors.textSecondary, lineHeight: 20 },
  emptyContainer: { alignItems: "center", marginTop: 60, padding: 24 },
  emptyTitle: { color: colors.textPrimary, fontWeight: "600" },
  emptyText: { color: colors.textMuted, marginTop: 8, textAlign: "center" },
});
