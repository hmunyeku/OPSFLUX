import React, { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Button, Dialog, HelperText, Portal, Text, TouchableRipple } from "react-native-paper";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
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

export default function FieldDate({ field, value, error, required, onChange }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const isDatetime = field.type === "datetime";
  const dateValue = value ? new Date(value as string) : new Date();
  const hasValue = !!value;

  const displayText = hasValue
    ? format(dateValue, isDatetime ? "dd MMM yyyy HH:mm" : "dd MMM yyyy", { locale: fr })
    : field.placeholder ?? "Sélectionner une date...";

  function handleChange(_event: unknown, selectedDate?: Date) {
    if (Platform.OS === "android") setShowPicker(false);
    if (selectedDate) {
      const formatted = isDatetime
        ? selectedDate.toISOString()
        : selectedDate.toISOString().split("T")[0];
      onChange(formatted);
    }
  }

  return (
    <>
      <TouchableRipple onPress={() => setShowPicker(true)} style={styles.trigger}>
        <View style={[styles.triggerInner, error ? styles.triggerError : null]}>
          <Text variant="bodySmall" style={styles.triggerLabel}>
            {field.label}{required ? " *" : ""}
          </Text>
          <Text variant="bodyLarge" style={hasValue ? styles.triggerValue : styles.triggerPlaceholder}>
            {displayText}
          </Text>
        </View>
      </TouchableRipple>

      {(error || field.help_text) && (
        <HelperText type={error ? "error" : "info"} visible>
          {error || field.help_text}
        </HelperText>
      )}

      {showPicker && Platform.OS === "android" && (
        <DateTimePicker
          value={dateValue}
          mode={isDatetime ? "datetime" : "date"}
          display="default"
          onChange={handleChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Portal>
          <Dialog visible={showPicker} onDismiss={() => setShowPicker(false)}>
            <Dialog.Title>{field.label}</Dialog.Title>
            <Dialog.Content>
              <DateTimePicker
                value={dateValue}
                mode={isDatetime ? "datetime" : "date"}
                display="spinner"
                onChange={handleChange}
                locale="fr"
              />
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setShowPicker(false)}>OK</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderRadius: 4,
  },
  triggerInner: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  triggerError: {
    borderColor: colors.danger,
  },
  triggerLabel: {
    color: colors.textSecondary,
    marginBottom: 2,
  },
  triggerValue: {
    color: colors.textPrimary,
  },
  triggerPlaceholder: {
    color: colors.textMuted,
  },
});
