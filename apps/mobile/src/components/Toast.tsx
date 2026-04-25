/**
 * Toast/Snackbar global — shows feedback messages.
 *
 * Uses a Zustand store so any service/screen can trigger a toast
 * without prop drilling.
 */

import React, { useEffect } from "react";
import { Snackbar } from "react-native-paper";
import { create } from "zustand";
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

export default function Toast() {
  const { visible, message, type, duration, hide } = useToast();

  return (
    <Snackbar
      visible={visible}
      onDismiss={hide}
      duration={duration}
      style={{ backgroundColor: TYPE_COLORS[type] ?? colors.textPrimary }}
      action={{ label: "OK", onPress: hide, textColor: "#fff" }}
    >
      {message}
    </Snackbar>
  );
}
