/**
 * Cargo Reception Screen — full reception workflow with:
 *  - Cargo info summary
 *  - Condition assessment (good/damaged/partial)
 *  - Photo evidence capture (mandatory for damaged)
 *  - Damage notes
 *  - Signature confirmation
 *  - Submit to server
 */

import React, { useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  RadioButton,
  Text,
  TextInput,
} from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
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
      Alert.alert("Photos requises", "Veuillez prendre au moins une photo pour un colis endommagé.");
      return;
    }
    if (!signature) {
      Alert.alert("Signature requise", "Veuillez signer pour confirmer la réception.");
      return;
    }

    setSubmitting(true);
    try {
      await receiveCargo(cargo.id, {
        condition,
        notes: notes || undefined,
        photo_count: photos.length,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show("Réception confirmée", "success");
      navigation.goBack();
    } catch (err: any) {
      toast.show(err?.response?.data?.detail || "Erreur de réception", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Cargo summary */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.headerRow}>
            <Text variant="titleLarge" style={styles.reference}>
              {cargo.reference}
            </Text>
            <StatusBadge status={cargo.status} size="md" />
          </View>
          {cargo.description && (
            <Text variant="bodyMedium" style={styles.description}>
              {cargo.description}
            </Text>
          )}
          {cargo.sender_name && (
            <Text variant="bodySmall" style={styles.meta}>
              Expéditeur: {cargo.sender_name}
            </Text>
          )}
          {cargo.weight_kg && (
            <Text variant="bodySmall" style={styles.meta}>
              Poids: {cargo.weight_kg} kg
            </Text>
          )}
        </Card.Content>
      </Card>

      {/* Condition assessment */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            État du colis à la réception
          </Text>
          <RadioButton.Group value={condition} onValueChange={(v) => setCondition(v as Condition)}>
            <RadioButton.Item
              label="Bon état — aucun dommage visible"
              value="good"
              labelStyle={styles.radioLabel}
            />
            <RadioButton.Item
              label="Endommagé — dommages visibles"
              value="damaged"
              labelStyle={[styles.radioLabel, condition === "damaged" && { color: colors.danger }]}
            />
            <RadioButton.Item
              label="Partiel — contenu incomplet"
              value="partial"
              labelStyle={[styles.radioLabel, condition === "partial" && { color: colors.warning }]}
            />
          </RadioButton.Group>
        </Card.Content>
      </Card>

      {/* Damage notes */}
      {condition !== "good" && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionTitle}>
              Description des dommages
            </Text>
            <TextInput
              mode="outlined"
              label="Notes"
              placeholder="Décrivez les dommages ou éléments manquants..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
            />
          </Card.Content>
        </Card>
      )}

      {/* Photo evidence */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Photos{condition === "damaged" ? " (obligatoires)" : ""}
          </Text>

          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((uri, i) => (
                <View key={i} style={styles.photoWrapper}>
                  <Image source={{ uri }} style={styles.photo} />
                  <IconButton
                    icon="close-circle"
                    size={20}
                    style={styles.photoRemove}
                    iconColor={colors.danger}
                    onPress={() => removePhoto(i)}
                  />
                </View>
              ))}
            </View>
          )}

          <Button mode="outlined" icon="camera" onPress={takePhoto}>
            Prendre une photo ({photos.length})
          </Button>
        </Card.Content>
      </Card>

      {/* Signature */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionTitle}>
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
        </Card.Content>
      </Card>

      {/* Submit */}
      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        style={styles.submitButton}
        buttonColor={colors.success}
        icon="check"
      >
        Confirmer la réception
      </Button>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12 },
  card: { borderRadius: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  reference: { fontWeight: "700", color: colors.primary },
  description: { color: colors.textPrimary, marginBottom: 4 },
  meta: { color: colors.textSecondary },
  sectionTitle: { fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  radioLabel: { fontSize: 14 },
  notesInput: { backgroundColor: colors.surface },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  photoWrapper: { position: "relative" },
  photo: { width: 90, height: 90, borderRadius: 8 },
  photoRemove: { position: "absolute", top: -8, right: -8, backgroundColor: colors.surface },
  submitButton: { borderRadius: 12, paddingVertical: 4 },
});
