/**
 * Push notification service — registers device token with server.
 *
 * Uses expo-notifications for:
 *  - Requesting push permission
 *  - Getting the Expo push token
 *  - Registering it with the OpsFlux server
 *  - Handling notification taps (deep linking)
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api";

// Configure how notifications appear when app is in foreground.
// Wrapped in try-catch because notification module may not be available.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (err) {
  if (__DEV__) console.warn("[pushNotifications] handler setup failed:", err);
}

/** Register for push notifications and send token to server. */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push doesn't work on simulator
    return null;
  }

  // Request permission
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  // Android channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "OpsFlux",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#1e3a5f",
    });
  }

  // Get push token.
  //
  // `getExpoPushTokenAsync` expects the EAS project UUID, NOT the app
  // slug. Passing the slug silently fails on preview/production builds
  // (Expo Go used to hide this bug because it has its own credentials).
  // We source the UUID from the runtime Expo config — same value we
  // export under `extra.eas.projectId` in app.config.ts.
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } })?.eas
      ?.projectId ?? (Constants as any).easConfig?.projectId;
  if (!projectId) {
    if (__DEV__) {
      console.warn(
        "[pushNotifications] EAS projectId unavailable — skipping token"
      );
    }
    return null;
  }
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const pushToken = tokenData.data;

  // Register with server
  try {
    await api.post("/api/v1/notifications/push-token", {
      token: pushToken,
      platform: Platform.OS,
      device_name: Device.modelName ?? "unknown",
    });
  } catch {
    // Non-critical — push will just not work
  }

  return pushToken;
}

/** Add a listener for when user taps a notification. */
export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/** Add a listener for notifications received while app is in foreground. */
export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(handler);
}
