/**
 * NotificationsScreen — Gluestack refonte: in-app notification center.
 */
import React from "react";
import { FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Box,
  Button,
  ButtonText,
  HStack,
    Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { useTranslation } from "react-i18next";
import {
  useNotifications,
  sendMarkRead,
  type AppNotification,
} from "../services/notifications";

interface Props {
  navigation: any;
}

export default function NotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { notifications, unreadCount, markAllRead } = useNotifications();

  function handlePress(notif: AppNotification) {
    if (!notif.read) {
      sendMarkRead(notif.id);
    }
    const data = notif.data;
    if (data?.resource_type === "ads" && data?.resource_id) {
      navigation.navigate("AdsList", { highlightId: data.resource_id });
    } else if (data?.resource_type === "cargo" && data?.resource_id) {
      navigation.navigate("CargoList", { highlightId: data.resource_id });
    }
  }

  const renderItem = ({ item }: { item: AppNotification }) => (
    <Pressable
      onPress={() => handlePress(item)}
      bg={item.read ? "$white" : "$primary50"}
      borderRadius="$lg"
      borderWidth={1}
      borderColor={item.read ? "$borderLight200" : "$primary200"}
      borderLeftWidth={item.read ? 1 : 4}
      borderLeftColor={item.read ? "$borderLight200" : "$primary600"}
      p="$3.5"
      mb="$2"
      $active-bg="$backgroundLight100"
    >
      <HStack justifyContent="space-between" alignItems="flex-start" mb="$1">
        <HStack space="xs" alignItems="center" flex={1}>
          {!item.read && (
            <Box w={8} h={8} borderRadius="$full" bg="$primary600" mr="$1" />
          )}
          <Text
            size="sm"
            fontWeight={item.read ? "$medium" : "$bold"}
            color="$textLight900"
            flex={1}
            numberOfLines={1}
          >
            {item.title}
          </Text>
        </HStack>
        <Text size="2xs" color="$textLight400" ml="$2">
          {formatTime(item.created_at, t)}
        </Text>
      </HStack>
      <Text size="sm" color="$textLight600" lineHeight={20}>
        {item.message}
      </Text>
    </Pressable>
  );

  return (
    <Box flex={1} bg="$backgroundLight50">
      {unreadCount > 0 && (
        <HStack
          justifyContent="space-between"
          alignItems="center"
          px="$4"
          py="$2"
          bg="$white"
          borderBottomWidth={1}
          borderColor="$borderLight200"
          mt={insets.top}
        >
          <Text size="sm" color="$textLight600" fontWeight="$semibold">
            {t("notif.unreadCount", "{{count}} non lue(s)", { count: unreadCount })}
          </Text>
          <Button size="xs" variant="link" onPress={markAllRead}>
            <ButtonText>{t("notif.markAllRead", "Tout marquer lu")}</ButtonText>
          </Button>
        </HStack>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{
          padding: 12,
          paddingTop: unreadCount > 0 ? 12 : insets.top + 12,
          paddingBottom: insets.bottom + 24,
        }}
        ListEmptyComponent={
          <VStack space="sm" alignItems="center" mt="$10" p="$6">
            <MIcon name="notifications-off" size="xl" color="$textLight300" />
            <Text size="md" fontWeight="$semibold" color="$textLight900">
              {t("notif.emptyTitle", "Aucune notification")}
            </Text>
            <Text size="sm" color="$textLight500" textAlign="center">
              {t(
                "notif.emptyDesc",
                "Vous serez notifié des événements importants ici."
              )}
            </Text>
          </VStack>
        }
      />
    </Box>
  );
}

function formatTime(isoStr: string, t: (k: string, fb: string, opts?: any) => string): string {
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return t("time.justNow", "à l'instant");
  if (diffMin < 60) return t("time.minutesAgo", "il y a {{count}} min", { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("time.hoursAgo", "il y a {{count}}h", { count: diffH });
  const diffD = Math.floor(diffH / 24);
  return t("time.daysAgo", "il y a {{count}}j", { count: diffD });
}
