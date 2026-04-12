/**
 * Photo capture field — takes photos via camera or picks from gallery.
 */

import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Button, HelperText, IconButton, Surface, Text } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";

interface Props {
  field: FieldDefinition;
  fieldName: string;
  value: unknown;
  error?: string;
  required: boolean;
  onChange: (value: string[]) => void;
}

export default function FieldPhoto({ field, value, error, required, onChange }: Props) {
  const photos = Array.isArray(value) ? (value as string[]) : [];

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      base64: false,
    });

    if (!result.canceled && result.assets[0]) {
      onChange([...photos, result.assets[0].uri]);
    }
  }

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      base64: false,
    });

    if (!result.canceled && result.assets[0]) {
      onChange([...photos, result.assets[0].uri]);
    }
  }

  function removePhoto(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <View>
      <Text variant="bodySmall" style={styles.label}>
        {field.label}{required ? " *" : ""}
      </Text>

      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoContainer}>
              <Image source={{ uri }} style={styles.photo} />
              <IconButton
                icon="close-circle"
                size={20}
                style={styles.removeButton}
                iconColor={colors.danger}
                onPress={() => removePhoto(i)}
              />
            </View>
          ))}
        </View>
      )}

      <View style={styles.buttonRow}>
        <Button
          mode="outlined"
          icon="camera"
          compact
          onPress={takePhoto}
          style={styles.captureButton}
        >
          Photo
        </Button>
        <Button
          mode="outlined"
          icon="image"
          compact
          onPress={pickFromGallery}
          style={styles.captureButton}
        >
          Galerie
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
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  photoContainer: { position: "relative" },
  photo: { width: 80, height: 80, borderRadius: 8 },
  removeButton: { position: "absolute", top: -8, right: -8, backgroundColor: colors.surface },
  buttonRow: { flexDirection: "row", gap: 8 },
  captureButton: { flex: 1 },
});
