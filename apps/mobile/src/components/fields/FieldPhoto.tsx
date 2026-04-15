/**
 * FieldPhoto — camera capture / gallery picker via Gluestack chrome.
 */

import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Button, ButtonText, HStack } from "@gluestack-ui/themed";
import { MIcon } from "../MIcon";
import FieldShell from "./FieldShell";
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

export default function FieldPhoto({
  field,
  value,
  error,
  required,
  onChange,
}: Props) {
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
    <FieldShell
      label={field.label}
      required={required}
      error={error}
      helpText={field.help_text}
      bare
    >
      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoContainer}>
              <Image source={{ uri }} style={styles.photo} />
              <Pressable
                style={styles.removeButton}
                onPress={() => removePhoto(i)}
                hitSlop={8}
              >
                <MIcon name="close" size="xs" color="#ffffff" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <HStack space="sm">
        <Button
          variant="outline"
          action="primary"
          flex={1}
          size="md"
          onPress={takePhoto}
        >
          <MIcon name="camera-alt" size="sm" color="$primary700" mr="$2" />
          <ButtonText>Photo</ButtonText>
        </Button>
        <Button
          variant="outline"
          action="secondary"
          flex={1}
          size="md"
          onPress={pickFromGallery}
        >
          <MIcon name="image" size="sm" color="$textLight700" mr="$2" />
          <ButtonText>Galerie</ButtonText>
        </Button>
      </HStack>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  photoContainer: {
    position: "relative",
  },
  photo: {
    width: 84,
    height: 84,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
  removeButton: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
