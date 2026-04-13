/**
 * FleetMap — real-time map of fleet vehicle/vessel positions.
 *
 * Uses react-native-maps (Apple Maps on iOS, Google Maps on Android).
 * Map module is loaded lazily so it doesn't crash app startup if
 * Google Maps isn't configured or the native module has issues.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { colors } from "../utils/colors";

export interface MapPosition {
  id: string;
  vector_id: string;
  vector_name?: string;
  latitude: number;
  longitude: number;
  source: string;
  speed_knots: number | null;
  heading: number | null;
  recorded_at: string;
}

interface Props {
  positions: MapPosition[];
  track?: { latitude: number; longitude: number }[];
  focusVehicleId?: string;
  showUserLocation?: boolean;
  style?: object;
}

const SOURCE_COLORS: Record<string, string> = {
  ais: "#2563eb",
  gps: "#16a34a",
  manual: "#f59e0b",
};

// Lazy load react-native-maps — defers native module init
let MapsModule: any = null;
let mapsLoadError: Error | null = null;

function loadMaps() {
  if (MapsModule || mapsLoadError) return MapsModule;
  try {
    MapsModule = require("react-native-maps");
    return MapsModule;
  } catch (err: any) {
    mapsLoadError = err;
    return null;
  }
}

export default function FleetMap({
  positions,
  track,
  focusVehicleId,
  showUserLocation = true,
  style,
}: Props) {
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const mapRef = useRef<any>(null);

  // Try loading react-native-maps after first render
  useEffect(() => {
    const mod = loadMaps();
    if (mod) {
      setMapsReady(true);
    } else {
      setMapsError(mapsLoadError?.message ?? "Carte indisponible");
    }
  }, []);

  // Auto-fit markers
  useEffect(() => {
    if (!mapRef.current || positions.length === 0) return;
    if (focusVehicleId) {
      const focused = positions.find((p) => p.vector_id === focusVehicleId);
      if (focused) {
        mapRef.current.animateToRegion({
          latitude: focused.latitude,
          longitude: focused.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
        return;
      }
    }
    const coords = positions.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
    }));
    if (coords.length > 0 && mapRef.current.fitToCoordinates) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      });
    }
  }, [positions.length, focusVehicleId, mapsReady]);

  const defaultRegion = useMemo(
    () => ({
      latitude: 4.0,
      longitude: 9.5,
      latitudeDelta: 5,
      longitudeDelta: 5,
    }),
    []
  );

  if (mapsError) {
    return (
      <View style={[styles.fallback, style]}>
        <Text variant="bodyMedium" style={styles.fallbackText}>
          Carte indisponible
        </Text>
        <Text variant="bodySmall" style={styles.fallbackHint}>
          {positions.length} position{positions.length !== 1 ? "s" : ""} disponible{positions.length !== 1 ? "s" : ""} (liste ci-dessous)
        </Text>
      </View>
    );
  }

  if (!mapsReady) {
    return (
      <View style={[styles.fallback, style]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  const { default: MapView, Callout, Marker, Polyline, PROVIDER_DEFAULT } = MapsModule;

  return (
    <MapView
      ref={mapRef}
      style={[styles.map, style]}
      provider={PROVIDER_DEFAULT}
      initialRegion={defaultRegion}
      showsUserLocation={showUserLocation}
      showsMyLocationButton
      showsCompass
      rotateEnabled={false}
    >
      {positions.map((pos) => (
        <Marker
          key={pos.id}
          coordinate={{
            latitude: pos.latitude,
            longitude: pos.longitude,
          }}
          rotation={pos.heading ?? 0}
          anchor={{ x: 0.5, y: 0.5 }}
          pinColor={SOURCE_COLORS[pos.source] ?? colors.primary}
        >
          <Callout>
            <View style={styles.callout}>
              <Text variant="titleSmall" style={styles.calloutTitle}>
                {pos.vector_name ?? pos.vector_id.slice(0, 8)}
              </Text>
              <Text variant="bodySmall" style={styles.calloutMeta}>
                Source: {pos.source.toUpperCase()}
              </Text>
              {pos.speed_knots != null && (
                <Text variant="bodySmall" style={styles.calloutMeta}>
                  Vitesse: {pos.speed_knots.toFixed(1)} kn
                </Text>
              )}
              {pos.heading != null && (
                <Text variant="bodySmall" style={styles.calloutMeta}>
                  Cap: {pos.heading.toFixed(0)}°
                </Text>
              )}
              <Text variant="bodySmall" style={styles.calloutTime}>
                {new Date(pos.recorded_at).toLocaleTimeString("fr-FR")}
              </Text>
            </View>
          </Callout>
        </Marker>
      ))}

      {track && track.length > 1 && (
        <Polyline
          coordinates={track}
          strokeColor={colors.primary}
          strokeWidth={3}
          lineDashPattern={[0]}
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    minHeight: 300,
  },
  fallback: {
    flex: 1,
    minHeight: 250,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    padding: 20,
  },
  fallbackText: {
    color: colors.textSecondary,
    marginBottom: 4,
  },
  fallbackHint: {
    color: colors.textMuted,
    textAlign: "center",
  },
  callout: {
    minWidth: 140,
    padding: 4,
  },
  calloutTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  calloutMeta: {
    color: colors.textSecondary,
  },
  calloutTime: {
    color: colors.textMuted,
    marginTop: 2,
    fontStyle: "italic",
  },
});
