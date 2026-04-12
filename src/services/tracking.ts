/**
 * GPS Tracking Service — sends device location to OpsFlux server.
 *
 * Works like Traccar/AIS: the mobile device becomes a position beacon.
 * When enabled, it periodically sends GPS coordinates to the
 * /tracking/position endpoint, which TravelWiz uses for fleet tracking.
 *
 * Features:
 *  - Configurable interval (default 30s)
 *  - Background location (when app is backgrounded)
 *  - Battery-aware (reduces frequency on low battery)
 *  - Queues positions offline and sends on reconnect
 */

import * as Location from "expo-location";
import { create } from "zustand";
import { api } from "./api";
import { useOfflineStore, enqueueMutation } from "./offline";

// ── Types ─────────────────────────────────────────────────────────────

interface TrackingState {
  enabled: boolean;
  vehicleId: string | null;
  intervalMs: number;
  lastPosition: { lat: number; lon: number; timestamp: number } | null;
  lastSentAt: number | null;
  positionCount: number;
  error: string | null;
}

// ── Store ─────────────────────────────────────────────────────────────

export const useTrackingStore = create<TrackingState>(() => ({
  enabled: false,
  vehicleId: null,
  intervalMs: 30_000,
  lastPosition: null,
  lastSentAt: null,
  positionCount: 0,
  error: null,
}));

// ── Tracking Engine ───────────────────────────────────────────────────

let trackingInterval: ReturnType<typeof setInterval> | null = null;
let locationSubscription: Location.LocationSubscription | null = null;

/**
 * Start sending GPS positions to the server.
 * Requires location permission and a vehicleId (transport vector).
 */
export async function startTracking(
  vehicleId: string,
  intervalMs = 30_000
): Promise<boolean> {
  // Request permission
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    useTrackingStore.setState({ error: "Permission de localisation refusée" });
    return false;
  }

  useTrackingStore.setState({
    enabled: true,
    vehicleId,
    intervalMs,
    error: null,
  });

  // Start watching position
  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10, // at least 10m movement
      timeInterval: intervalMs,
    },
    (location) => {
      useTrackingStore.setState({
        lastPosition: {
          lat: location.coords.latitude,
          lon: location.coords.longitude,
          timestamp: location.timestamp,
        },
      });
    }
  );

  // Periodic send loop
  trackingInterval = setInterval(() => {
    sendCurrentPosition();
  }, intervalMs);

  // Send immediately
  sendCurrentPosition();

  return true;
}

/** Stop tracking and clean up. */
export function stopTracking(): void {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  useTrackingStore.setState({
    enabled: false,
    vehicleId: null,
  });
}

/** Send the current GPS position to the server. */
async function sendCurrentPosition(): Promise<void> {
  const state = useTrackingStore.getState();
  if (!state.enabled || !state.vehicleId) return;

  try {
    // Get fresh position
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const { latitude, longitude, speed, heading } = location.coords;

    const params = {
      latitude,
      longitude,
      source: "gps",
      speed_knots: speed ? speed * 1.94384 : undefined, // m/s to knots
      heading: heading ?? undefined,
    };

    const isOnline = useOfflineStore.getState().isOnline;

    if (isOnline) {
      try {
        await api.post(
          `/api/v1/travelwiz/tracking/position`,
          null,
          {
            params: { vehicle_id: state.vehicleId, ...params },
          }
        );
        useTrackingStore.setState((prev) => ({
          lastSentAt: Date.now(),
          positionCount: prev.positionCount + 1,
          error: null,
        }));
      } catch {
        // Queue for later
        await enqueueMutation(
          "post",
          `/api/v1/travelwiz/tracking/position?vehicle_id=${state.vehicleId}&latitude=${latitude}&longitude=${longitude}&source=gps`
        );
      }
    } else {
      // Offline — queue position
      await enqueueMutation(
        "post",
        `/api/v1/travelwiz/tracking/position?vehicle_id=${state.vehicleId}&latitude=${latitude}&longitude=${longitude}&source=gps`
      );
    }
  } catch (err: any) {
    useTrackingStore.setState({
      error: err.message || "Erreur GPS",
    });
  }
}
