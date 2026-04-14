/**
 * Centralized permission requests.
 *
 * Asks for camera + location + notifications upfront after a successful
 * login, so the user goes through the OS prompts ONCE — instead of being
 * surprised mid-flow by 3 separate dialogs.
 *
 * All requests are best-effort: refusal is logged but never blocks the user.
 * The actual feature gracefully degrades (camera screen will re-ask later
 * if needed, GPS will silently disable tracking, etc).
 */
import { Camera } from "expo-camera";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as ImagePicker from "expo-image-picker";

export interface PermissionResult {
  camera: "granted" | "denied" | "undetermined";
  microphone: "granted" | "denied" | "undetermined";
  mediaLibrary: "granted" | "denied" | "undetermined";
  locationForeground: "granted" | "denied" | "undetermined";
  notifications: "granted" | "denied" | "undetermined";
}

/**
 * Request all foreground permissions in sequence (background ones come later).
 *
 * Sequence is important: notifications first (most users say yes), then
 * camera (visible feature), then media library (for picking ID document
 * photos), then location (most invasive — last).
 */
export async function requestEssentialPermissions(): Promise<PermissionResult> {
  const result: PermissionResult = {
    camera: "undetermined",
    microphone: "undetermined",
    mediaLibrary: "undetermined",
    locationForeground: "undetermined",
    notifications: "undetermined",
  };

  // 1. Notifications
  try {
    const notif = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    result.notifications = notif.granted ? "granted" : "denied";
  } catch {
    /* keep undetermined */
  }

  // 2. Camera (used by both ScannerScreens and ID document capture)
  try {
    const cam = await Camera.requestCameraPermissionsAsync();
    result.camera = cam.granted ? "granted" : "denied";
  } catch {}

  try {
    const mic = await Camera.requestMicrophonePermissionsAsync();
    result.microphone = mic.granted ? "granted" : "denied";
  } catch {}

  // 3. Media library — only for photo selection alternative
  try {
    const media = await ImagePicker.requestMediaLibraryPermissionsAsync();
    result.mediaLibrary = media.granted ? "granted" : "denied";
  } catch {}

  // 4. Location (foreground only at this stage; background asked just in
  //    time when starting an actual tracking session)
  try {
    const loc = await Location.requestForegroundPermissionsAsync();
    result.locationForeground = loc.granted ? "granted" : "denied";
  } catch {}

  return result;
}
