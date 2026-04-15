/**
 * FieldBarcode — text input with inline barcode scanner trigger.
 */

import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Button, ButtonText } from "@gluestack-ui/themed";
import { MIcon } from "../MIcon";
import FieldShell from "./FieldShell";
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

export default function FieldBarcode({
  field,
  value,
  error,
  required,
  onChange,
}: Props) {
  const [scanning, setScanning] = useState(false);

  return (
    <FieldShell
      label={field.label}
      required={required}
      error={error}
      helpText={field.help_text}
      bare
    >
      <View style={[styles.row, error ? styles.rowError : null]}>
        <TextInput
          style={styles.input}
          placeholder={field.placeholder ?? "Scanner ou saisir le code…"}
          placeholderTextColor={colors.textMuted}
          value={String(value ?? "")}
          onChangeText={onChange}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Pressable
          style={styles.scanBtn}
          onPress={() => setScanning(true)}
          hitSlop={6}
        >
          <MIcon name="qr-code-scanner" size="md" color="$primary700" />
        </Pressable>
      </View>

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
              action="primary"
              onPress={() => setScanning(false)}
              minWidth={140}
            >
              <ButtonText>Fermer</ButtonText>
            </Button>
          </View>
        </View>
      </Modal>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  rowError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  scanBtn: {
    paddingHorizontal: 14,
    height: "100%",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  scannerContainer: { flex: 1, backgroundColor: "#000" },
  closeBar: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
});
