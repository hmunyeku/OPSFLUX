/**
 * Location capture field — auto-captures GPS coordinates.
 */

import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, HelperText, Text } from "react-native-paper";
import * as Location from "expo-location";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";

interface Props {
  field: FieldDefinition;
  fieldName: string;
  value: unknown;
  error?: string;
  required: boolean;
  onChange: (value: { lat: number; lon: number; accuracy: number } | null) => void;
}

export default function FieldLocation({ field, value, error, required, onChange }: Props) {
  const [capturing, setCapturing] = useState(false);
  const loc = value as { lat: number; lon: number; accuracy: number } | null;

  async function captureLocation() {
    setCapturing(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setCapturing(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      onChange({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy ?? 0,
      });
    } catch {
      // Location unavailable
    } finally {
      setCapturing(false);
    }
  }

  return (
    <View>
      <Text variant="bodySmall" style={styles.label}>
        {field.label}{required ? " *" : ""}
      </Text>

      <View style={[styles.container, error ? styles.containerError : null]}>
        {loc ? (
          <View style={styles.coordsRow}>
            <View style={styles.coordCol}>
              <Text variant="bodySmall" style={styles.coordLabel}>Latitude</Text>
              <Text variant="bodyMedium" style={styles.coordValue}>
                {loc.lat.toFixed(6)}
              </Text>
            </View>
            <View style={styles.coordCol}>
              <Text variant="bodySmall" style={styles.coordLabel}>Longitude</Text>
              <Text variant="bodyMedium" style={styles.coordValue}>
                {loc.lon.toFixed(6)}
              </Text>
            </View>
            <View style={styles.coordCol}>
              <Text variant="bodySmall" style={styles.coordLabel}>Précision</Text>
              <Text variant="bodyMedium" style={styles.coordValue}>
                {loc.accuracy.toFixed(0)}m
              </Text>
            </View>
          </View>
        ) : (
          <Text variant="bodyMedium" style={styles.placeholder}>
            Position non capturée
          </Text>
        )}

        <Button
          mode={loc ? "outlined" : "contained"}
          compact
          loading={capturing}
          onPress={captureLocation}
          style={styles.captureButton}
          icon="crosshairs-gps"
        >
          {loc ? "Actualiser" : "Capturer la position"}
        </Button>
      </View>

      {(error || field.help_text) && (
        <HelperText type={error ? "error" : "info"} visible>
          {error || field.help_text}
        </HelperText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textSecondary, marginBottom: 8 },
  container: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.surface,
  },
  containerError: { borderColor: colors.danger },
  coordsRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  coordCol: { flex: 1 },
  coordLabel: { color: colors.textMuted, fontSize: 11 },
  coordValue: { color: colors.textPrimary, fontFamily: "monospace", fontWeight: "600" },
  placeholder: { color: colors.textMuted, marginBottom: 10 },
  captureButton: {},
});
