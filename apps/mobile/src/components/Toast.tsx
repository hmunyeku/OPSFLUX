/**
 * Toast global — shows feedback messages.
 *
 * Gluestack-styled snackbar rendered at the top of the screen just
 * below the notch. Auto-dismisses after `duration`, tap to close.
 * Consumed via a Zustand store so any service/screen can fire a toast
 * without prop drilling.
 */

import React, { useEffect } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@gluestack-ui/themed";
import { create } from "zustand";
import { MIcon } from "./MIcon";
import { colors } from "../utils/colors";

interface ToastState {
  visible: boolean;
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration: number;
  show: (message: string, type?: ToastState["type"], duration?: number) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  visible: false,
  message: "",
  type: "info",
  duration: 3000,
  show: (message, type = "info", duration = 3000) =>
    set({ visible: true, message, type, duration }),
  hide: () => set({ visible: false }),
}));

const TYPE_COLORS: Record<string, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.info,
  warning: colors.warning,
};

const TYPE_ICONS: Record<string, string> = {
  success: "check-circle",
  error: "error-outline",
  info: "info-outline",
  warning: "warning",
};

export default function Toast() {
  const insets = useSafeAreaInsets();
  const { visible, message, type, duration, hide } = useToast();
  const translateY = React.useRef(new Animated.Value(-120)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      const t = setTimeout(hide, duration);
      return () => clearTimeout(t);
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, duration]);

  if (!visible) return null;

  const bg = TYPE_COLORS[type] ?? "#0f172a";

  return (
    <Animated.View
      pointerEvents="auto"
      style={[
        styles.root,
        {
          top: insets.top + 8,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <Pressable
        style={[styles.inner, { backgroundColor: bg }]}
        onPress={hide}
      >
        <MIcon name={TYPE_ICONS[type] as any} size="sm" color="#ffffff" />
        <Text
          size="sm"
          color="$white"
          fontWeight="$medium"
          style={styles.text}
          numberOfLines={3}
        >
          {message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    flex: 1,
  },
});
