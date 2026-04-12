/**
 * Barcode/QR scan field — inline scanner with manual fallback.
 */

import React, { useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { Button, HelperText, Text, TextInput } from "react-native-paper";
import QrScanner from "../QrScanner";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";

interface Props {
  field: FieldDefinition;
  fieldName: string;
  value: unknown;
  error?: string;
  required: boolean;
  onChange: (value: string) => void;
}

export default function FieldBarcode({ field, value, error, required, onChange }: Props) {
  const [scanning, setScanning] = useState(false);

  return (
    <View>
      <TextInput
        mode="outlined"
        label={field.label + (required ? " *" : "")}
        placeholder={field.placeholder ?? "Scanner ou saisir le code..."}
        value={String(value ?? "")}
        onChangeText={onChange}
        error={!!error}
        right={
          <TextInput.Icon
            icon="barcode-scan"
            onPress={() => setScanning(true)}
          />
        }
        outlineColor={colors.border}
        activeOutlineColor={colors.primary}
        style={{ backgroundColor: colors.surface }}
      />

      {(error || field.help_text) && (
        <HelperText type={error ? "error" : "info"} visible>
          {error || field.help_text}
        </HelperText>
      )}

      <Modal visible={scanning} animationType="slide">
        <View style={styles.scannerContainer}>
          <QrScanner
            onScan={(data) => {
              onChange(data);
              setScanning(false);
            }}
            instruction={`Scanner: ${field.label}`}
          />
          <View style={styles.closeBar}>
            <Button
              mode="contained"
              onPress={() => setScanning(false)}
              style={styles.closeButton}
            >
              Fermer
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scannerContainer: { flex: 1 },
  closeBar: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  closeButton: { minWidth: 120 },
});
