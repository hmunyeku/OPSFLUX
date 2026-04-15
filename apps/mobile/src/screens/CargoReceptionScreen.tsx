/**
 * Cargo Reception Screen — full reception workflow with:
 *  - Cargo info summary
 *  - Condition assessment (good/damaged/partial)
 *  - Photo evidence capture (mandatory for damaged)
 *  - Damage notes
 *  - Signature confirmation
 *  - Submit to server
 *
 * Rewritten off react-native-paper. Uses Gluestack + MIcon for UI
 * consistency with the rest of the mobile app (no more mixed libs).
 */

import React, { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  HStack,
  Text,
  Textarea,
  TextareaInput,
  VStack,
} from "@gluestack-ui/themed";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { MIcon } from "../components/MIcon";
import FieldSignature from "../components/fields/FieldSignature";
import StatusBadge from "../components/StatusBadge";
import { receiveCargo } from "../services/packlog";
import { useToast } from "../components/Toast";
import { colors } from "../utils/colors";
import type { CargoRead } from "../types/api";

interface Props {
  route: {
    params: {
      cargo: CargoRead;
    };
  };
  navigation: any;
}

type Condition = "good" | "damaged" | "partial";

interface ConditionOption {
  value: Condition;
  label: string;
  color: string;
  iconName: string;
}

const CONDITION_OPTIONS: ConditionOption[] = [
  {
    value: "good",
    label: "Bon état — aucun dommage visible",
    color: colors.success,
    iconName: "check-circle",
  },
  {
    value: "damaged",
    label: "Endommagé — dommages visibles",
    color: colors.danger,
    iconName: "error",
  },
  {
    value: "partial",
    label: "Partiel — contenu incomplet",
    color: colors.warning,
    iconName: "warning",
  },
];

export default function CargoReceptionScreen({ route, navigation }: Props) {
  const { cargo } = route.params;
  const toast = useToast();

  const [condition, setCondition] = useState<Condition>("good");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    // Validation
    if (condition === "damaged" && photos.length === 0) {
      Alert.alert(
        "Photos requises",
        "Veuillez prendre au moins une photo pour un colis endommagé."
      );
      return;
    }
    if (!signature) {
      Alert.alert(
        "Signature requise",
        "Veuillez signer pour confirmer la réception."
      );
      return;
    }

    setSubmitting(true);
    try {
      // Build payload matching the server's CargoReceiptConfirm schema
      const damageNotes = condition !== "good" ? notes : undefined;
      const recipient = await receiveCargo(cargo.id, {
        recipient_available: true,
        signature_collected: Boolean(signature),
        damage_notes: damageNotes,
        photo_evidence_count: photos.length,
        notes: notes || undefined,
      });
      // Upload photos after reception is confirmed. The helper
      // automatically queues any photo that can't be uploaded due to
      // network issues — so a `queued` flag is a success, NOT a
      // failure (sync manager will drain on reconnect).
      let queuedCount = 0;
      let permaFailed = 0;
      if (photos.length > 0 && recipient?.id) {
        const { uploadAttachments } = await import("../services/attachments");
        const results = await uploadAttachments(photos, "cargo", recipient.id);
        for (const r of results) {
          if (r.success) continue;
          if (r.queued) queuedCount++;
          else permaFailed++;
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (permaFailed > 0) {
        toast.show(
          `Réception confirmée — ${permaFailed} photo(s) refusée(s) par le serveur`,
          "error"
        );
      } else if (queuedCount > 0) {
        toast.show(
          `Réception confirmée — ${queuedCount} photo(s) en attente d'envoi`,
          "success"
        );
      } else {
        toast.show("Réception confirmée", "success");
      }
      navigation.goBack();
    } catch (err: any) {
      toast.show(err?.response?.data?.detail || "Erreur de réception", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Cargo summary */}
      <Box style={styles.card}>
        <HStack
          justifyContent="space-between"
          alignItems="center"
          mb="$2"
        >
          <Text size="lg" fontWeight="$bold" color="$primary700">
            {cargo.reference}
          </Text>
          <StatusBadge status={cargo.status} size="md" />
        </HStack>
        {cargo.description ? (
          <Text size="sm" color="$textLight900" mb="$1">
            {cargo.description}
          </Text>
        ) : null}
        {cargo.sender_name ? (
          <Text size="xs" color="$textLight500">
            Expéditeur: {cargo.sender_name}
          </Text>
        ) : null}
        {cargo.weight_kg ? (
          <Text size="xs" color="$textLight500">
            Poids: {cargo.weight_kg} kg
          </Text>
        ) : null}
      </Box>

      {/* Condition assessment */}
      <Box style={styles.card}>
        <Text
          size="xs"
          fontWeight="$bold"
          color="$textLight500"
          textTransform="uppercase"
          letterSpacing={0.5}
          mb="$3"
        >
          État du colis à la réception
        </Text>
        <VStack space="sm">
          {CONDITION_OPTIONS.map((opt) => {
            const selected = condition === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setCondition(opt.value)}
                style={[
                  styles.radioRow,
                  selected && {
                    borderColor: opt.color,
                    backgroundColor: opt.color + "10",
                  },
                ]}
              >
                <MIcon
                  name={
                    selected ? "radio-button-checked" : "radio-button-unchecked"
                  }
                  size="md"
                  color={selected ? opt.color : "#94a3b8"}
                />
                <Text
                  size="sm"
                  color={selected ? "$textLight900" : "$textLight700"}
                  fontWeight={selected ? "$semibold" : "$normal"}
                  style={{ flex: 1 }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </VStack>
      </Box>

      {/* Damage notes */}
      {condition !== "good" && (
        <Box style={styles.card}>
          <Text
            size="xs"
            fontWeight="$bold"
            color="$textLight500"
            textTransform="uppercase"
            letterSpacing={0.5}
            mb="$3"
          >
            Description des dommages
          </Text>
          <Textarea size="md" borderColor="$borderLight300">
            <TextareaInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Décrivez les dommages ou éléments manquants..."
              numberOfLines={3}
            />
          </Textarea>
        </Box>
      )}

      {/* Photo evidence */}
      <Box style={styles.card}>
        <Text
          size="xs"
          fontWeight="$bold"
          color="$textLight500"
          textTransform="uppercase"
          letterSpacing={0.5}
          mb="$3"
        >
          Photos{condition === "damaged" ? " (obligatoires)" : ""}
        </Text>

        {photos.length > 0 && (
          <View style={styles.photoGrid}>
            {photos.map((uri, i) => (
              <View key={i} style={styles.photoWrapper}>
                <Image source={{ uri }} style={styles.photo} />
                <Pressable
                  onPress={() => removePhoto(i)}
                  style={styles.photoRemove}
                  hitSlop={6}
                >
                  <MIcon name="cancel" size="md" color="$error600" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Button
          action="primary"
          variant="outline"
          onPress={takePhoto}
          alignSelf="flex-start"
        >
          <MIcon name="camera-alt" size="sm" color="$primary700" mr="$2" />
          <ButtonText>
            Prendre une photo ({photos.length})
          </ButtonText>
        </Button>
      </Box>

      {/* Signature */}
      <Box style={styles.card}>
        <Text
          size="xs"
          fontWeight="$bold"
          color="$textLight500"
          textTransform="uppercase"
          letterSpacing={0.5}
          mb="$3"
        >
          Signature de réception
        </Text>
        <FieldSignature
          field={{
            type: "signature",
            label: "Signez pour confirmer",
            required: true,
            order: 0,
          }}
          fieldName="signature"
          value={signature}
          required
          onChange={setSignature}
        />
      </Box>

      {/* Submit */}
      <Button
        action="positive"
        onPress={handleSubmit}
        isDisabled={submitting}
        size="lg"
        bg="$success600"
        $active-bg="$success700"
        style={styles.submitButton}
      >
        {submitting ? (
          <ButtonSpinner color="$white" mr="$2" />
        ) : (
          <MIcon name="check" size="md" color="$white" mr="$2" />
        )}
        <ButtonText color="$white">Confirmer la réception</ButtonText>
      </Button>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  card: {
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  photoWrapper: { position: "relative" },
  photo: { width: 90, height: 90, borderRadius: 8 },
  photoRemove: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 4,
  },
});
