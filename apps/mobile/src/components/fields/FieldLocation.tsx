/**
 * FieldLocation — one-tap GPS capture via Gluestack button.
 */

import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, ButtonSpinner, ButtonText, Text } from "@gluestack-ui/themed";
import { MIcon } from "../MIcon";
import FieldShell from "./FieldShell";
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

export default function FieldLocation({
  field,
  value,
  error,
  required,
  onChange,
}: Props) {
  const [capturing, setCapturing] = useState(false);
  const loc = value as { lat: number; lon: number; accuracy: number } | null;

  async function captureLocation() {
    setCapturing(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
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
    <FieldShell
      label={field.label}
      required={required}
      error={error}
      helpText={field.help_text}
      bare
    >
      <View
        style={[styles.container, error ? styles.containerError : null]}
      >
        {loc ? (
          <View style={styles.coordsRow}>
            <View style={styles.coordCol}>
              <Text size="2xs" color="$textLight500" textTransform="uppercase">
                Lat.
              </Text>
              <Text size="sm" color="$textLight900" fontFamily="monospace" fontWeight="$semibold">
                {loc.lat.toFixed(6)}
              </Text>
            </View>
            <View style={styles.coordCol}>
              <Text size="2xs" color="$textLight500" textTransform="uppercase">
                Lon.
              </Text>
              <Text size="sm" color="$textLight900" fontFamily="monospace" fontWeight="$semibold">
                {loc.lon.toFixed(6)}
              </Text>
            </View>
            <View style={styles.coordCol}>
              <Text size="2xs" color="$textLight500" textTransform="uppercase">
                ± m
              </Text>
              <Text size="sm" color="$textLight900" fontFamily="monospace" fontWeight="$semibold">
                {loc.accuracy.toFixed(0)}
              </Text>
            </View>
          </View>
        ) : (
          <Text size="sm" color="$textLight500" italic mb="$2">
            Position non capturée
          </Text>
        )}
        <Button
          action="primary"
          variant={loc ? "outline" : "solid"}
          size="sm"
          onPress={captureLocation}
          isDisabled={capturing}
          mt="$2"
        >
          {capturing ? (
            <ButtonSpinner mr="$2" />
          ) : (
            <MIcon name="gps-fixed" size="xs" color={loc ? "$primary700" : "$white"} mr="$2" />
          )}
          <ButtonText>{loc ? "Actualiser" : "Capturer la position"}</ButtonText>
        </Button>
      </View>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    backgroundColor: colors.surface,
  },
  containerError: {
    borderColor: colors.danger,
  },
  coordsRow: {
    flexDirection: "row",
    gap: 12,
  },
  coordCol: {
    flex: 1,
  },
});
