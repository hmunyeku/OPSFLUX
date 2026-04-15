/**
 * NetworkBanner — persistent offline/sync banner shown at the top of the app.
 *
 * Shows:
 *  - Orange bar when offline
 *  - Blue bar when syncing queued mutations
 *  - Green flash when sync completes
 *  - Hidden when online and queue empty
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { Text } from "@gluestack-ui/themed";
import { useOfflineStore } from "../services/offline";
import { colors } from "../utils/colors";

export default function NetworkBanner() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const syncing = useOfflineStore((s) => s.syncing);
  const queueLength = useOfflineStore((s) => s.queueLength);

  const translateY = useRef(new Animated.Value(-50)).current;
  const visible = !isOnline || syncing || queueLength > 0;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : -50,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [visible]);

  if (!visible && !isOnline) return null;

  const bgColor = !isOnline
    ? colors.warning
    : syncing
    ? colors.info
    : queueLength > 0
    ? colors.accent
    : colors.success;

  const message = !isOnline
    ? "Mode hors-ligne"
    : syncing
    ? "Synchronisation en cours..."
    : queueLength > 0
    ? `${queueLength} action(s) en attente`
    : "Connecté";

  return (
    <Animated.View
      style={[styles.banner, { backgroundColor: bgColor, transform: [{ translateY }] }]}
    >
      <Text size="xs" fontWeight="$bold" color="$white" letterSpacing={0.3}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  // Text styling handled by Gluestack Text props inline.
});
