/**
 * GPS Tracking Service — Traccar/OsmAnd protocol compatible.
 *
 * Sends device location to OpsFlux server in a format compatible with
 * Traccar's OsmAnd protocol so the same data stream can be consumed by
 * an external Traccar Server (via the new endpoint
 * `/api/v1/tracking/osmand` on the backend).
 *
 * Position payload includes:
 *   - id           : stable device ID (from expo-application)
 *   - timestamp    : epoch seconds
 *   - lat / lon    : decimal degrees
 *   - altitude     : meters
 *   - speed        : knots (Traccar convention)
 *   - bearing      : degrees
 *   - accuracy     : meters
 *   - batt         : 0-100 %
 *   - charge       : true if charging
 *
 * Features:
 *  - Configurable interval (default 30s)
 *  - Battery-aware (already powered by expo-battery)
 *  - Queues positions offline and sends on reconnect
 */

import * as Application from "expo-application";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { create } from "zustand";
import { api } from "./api";
import { useOfflineStore, enqueueMutation } from "./offline";

interface TrackingState {
  enabled: boolean;
  vehicleId: string | null;
  intervalMs: number;
  lastPosition: { lat: number; lon: number; timestamp: number } | null;
  lastSentAt: number | null;
  positionCount: number;
  error: string | null;
  /** Stable device id used for Traccar payload `id` param. */
  deviceId: string;
}

/** Compute (or memoize) a stable device identifier. */
function _resolveDeviceId(): string {
  // Android: applicationId or androidId; iOS: idForVendor
  const aid = Application.androidId || Application.applicationId;
  const iid = (Application as any).getIosIdForVendorAsync; // exists but async
  return aid || `opsflux-mobile-${Platform.OS}-${Application.applicationId ?? "anon"}`;
}

export const useTrackingStore = create<TrackingState>(() => ({
  enabled: false,
  vehicleId: null,
  intervalMs: 30_000,
  lastPosition: null,
  lastSentAt: null,
  positionCount: 0,
  error: null,
  deviceId: _resolveDeviceId(),
}));

let trackingInterval: ReturnType<typeof setInterval> | null = null;
let locationSubscription: Location.LocationSubscription | null = null;

/**
 * Start sending GPS positions to the server.
 */
export async function startTracking(
  vehicleId: string,
  intervalMs = 30_000
): Promise<boolean> {
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

  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10,
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

  trackingInterval = setInterval(() => {
    sendCurrentPosition();
  }, intervalMs);

  sendCurrentPosition();

  return true;
}

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

/**
 * Build a Traccar OsmAnd protocol query string from the position +
 * device + battery state. Format expected by both:
 *   - OpsFlux backend: POST /api/v1/tracking/osmand
 *   - External Traccar Server: POST / with same query params
 */
function buildOsmandParams(
  deviceId: string,
  pos: Location.LocationObjectCoords,
  timestampMs: number,
  battery: { level: number; charging: boolean }
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    id: deviceId,
    timestamp: Math.floor(timestampMs / 1000),
    lat: pos.latitude,
    lon: pos.longitude,
  };
  if (pos.altitude != null) params.altitude = pos.altitude;
  // Traccar expects speed in knots (1 m/s = 1.94384 knots)
  if (pos.speed != null && pos.speed >= 0) params.speed = pos.speed * 1.94384;
  if (pos.heading != null && pos.heading >= 0) params.bearing = pos.heading;
  if (pos.accuracy != null && pos.accuracy >= 0) params.accuracy = pos.accuracy;
  if (battery.level >= 0) params.batt = Math.round(battery.level * 100);
  params.charge = battery.charging ? "true" : "false";
  return params;
}

async function sendCurrentPosition(): Promise<void> {
  const state = useTrackingStore.getState();
  if (!state.enabled || !state.vehicleId) return;

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    // Get battery level + charging state (best-effort)
    let level = -1;
    let charging = false;
    try {
      level = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();
      charging =
        batteryState === Battery.BatteryState.CHARGING ||
        batteryState === Battery.BatteryState.FULL;
    } catch {
      /* battery info optional */
    }

    const osmandParams = buildOsmandParams(
      state.deviceId,
      location.coords,
      location.timestamp,
      { level, charging }
    );

    // Also include vehicle_id so the server can map the device to the
    // current OpsFlux trip even if the same device is used across voyages.
    const params = { ...osmandParams, vehicle_id: state.vehicleId };

    const isOnline = useOfflineStore.getState().isOnline;

    if (isOnline) {
      try {
        await api.post(`/api/v1/tracking/osmand`, null, { params });
        useTrackingStore.setState((prev) => ({
          lastSentAt: Date.now(),
          positionCount: prev.positionCount + 1,
          error: null,
        }));
      } catch {
        // Fallback to the legacy endpoint for older backends
        try {
          await api.post(`/api/v1/travelwiz/tracking/position`, null, {
            params: {
              vehicle_id: state.vehicleId,
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              source: "gps",
              speed_knots: params.speed,
              heading: params.bearing,
            },
          });
          useTrackingStore.setState((prev) => ({
            lastSentAt: Date.now(),
            positionCount: prev.positionCount + 1,
            error: null,
          }));
        } catch {
          await enqueueMutation(
            "post",
            `/api/v1/tracking/osmand?${new URLSearchParams(
              Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
            ).toString()}`
          );
        }
      }
    } else {
      await enqueueMutation(
        "post",
        `/api/v1/tracking/osmand?${new URLSearchParams(
          Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
        ).toString()}`
      );
    }
  } catch (err: any) {
    useTrackingStore.setState({
      error: err.message || "Erreur GPS",
    });
  }
}
