/**
 * FleetMap — real-time map of fleet vehicle/vessel positions.
 *
 * Uses react-native-maps (Apple Maps on iOS, Google Maps on Android).
 * Displays markers for each tracked vector with callouts showing
 * name, speed, heading, and last update time.
 */

import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Callout, Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { Text } from "react-native-paper";
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
  /** Optional polyline track for a specific vehicle. */
  track?: { latitude: number; longitude: number }[];
  /** If provided, the map centers on this vehicle. */
  focusVehicleId?: string;
  /** Show the user's own position. */
  showUserLocation?: boolean;
  style?: object;
}

const SOURCE_COLORS: Record<string, string> = {
  ais: "#2563eb",
  gps: "#16a34a",
  manual: "#f59e0b",
};

export default function FleetMap({
  positions,
  track,
  focusVehicleId,
  showUserLocation = true,
  style,
}: Props) {
  const mapRef = useRef<MapView>(null);

  // Auto-fit markers on first load or when focus changes
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

    // Fit all markers
    const coords = positions.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
    }));
    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      });
    }
  }, [positions.length, focusVehicleId]);

  // Default region (Gulf of Guinea — common ops area)
  const defaultRegion = {
    latitude: 4.0,
    longitude: 9.5,
    latitudeDelta: 5,
    longitudeDelta: 5,
  };

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
      {/* Vehicle markers */}
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

      {/* Historical track polyline */}
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
