/**
 * Background GPS tracking — continues sending positions when app is backgrounded.
 *
 * Uses expo-task-manager + expo-location for background location updates.
 * Positions are sent to the server or queued offline.
 */

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { useTrackingStore } from "./tracking";
import { enqueueMutation } from "./offline";

const BACKGROUND_TRACKING_TASK = "opsflux-background-tracking";

// Register the background task at module load time (required by Expo)
TaskManager.defineTask(BACKGROUND_TRACKING_TASK, async ({ data, error }) => {
  if (error) return;
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const state = useTrackingStore.getState();

  if (!state.enabled || !state.vehicleId) return;

  for (const location of locations) {
    const { latitude, longitude, speed, heading } = location.coords;
    const speedKnots = speed ? speed * 1.94384 : undefined;

    // Queue position (we can't reliably do network in background on all platforms)
    await enqueueMutation(
      "post",
      `/api/v1/travelwiz/tracking/position?vehicle_id=${state.vehicleId}&latitude=${latitude}&longitude=${longitude}&source=gps${speedKnots ? `&speed_knots=${speedKnots.toFixed(1)}` : ""}${heading ? `&heading=${heading.toFixed(0)}` : ""}`
    );

    useTrackingStore.setState((prev) => ({
      lastPosition: { lat: latitude, lon: longitude, timestamp: location.timestamp },
      positionCount: prev.positionCount + 1,
    }));
  }
});

/** Start background location tracking. */
export async function startBackgroundTracking(vehicleId: string): Promise<boolean> {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== "granted") return false;

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== "granted") return false;

  useTrackingStore.setState({ enabled: true, vehicleId });

  await Location.startLocationUpdatesAsync(BACKGROUND_TRACKING_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 30_000,
    distanceInterval: 20,
    deferredUpdatesInterval: 30_000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "OpsFlux Tracking",
      notificationBody: "Suivi GPS en cours...",
      notificationColor: "#1e3a5f",
    },
  });

  return true;
}

/** Stop background location tracking. */
export async function stopBackgroundTracking(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TRACKING_TASK);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TRACKING_TASK);
  }
  useTrackingStore.setState({ enabled: false, vehicleId: null });
}

/** Check if background tracking is currently running. */
export async function isBackgroundTrackingActive(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(BACKGROUND_TRACKING_TASK);
}
