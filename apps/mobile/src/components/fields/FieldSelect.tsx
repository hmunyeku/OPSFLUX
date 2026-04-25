import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Chip, Dialog, HelperText, List, Portal, RadioButton, Text, TouchableRipple } from "react-native-paper";
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

export default function FieldSelect({ field, value, error, required, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const options = field.options ?? [];
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <TouchableRipple onPress={() => setOpen(true)} style={styles.trigger}>
        <View style={[styles.triggerInner, error ? styles.triggerError : null]}>
          <Text variant="bodySmall" style={styles.triggerLabel}>
            {field.label}{required ? " *" : ""}
          </Text>
          <Text variant="bodyLarge" style={selected ? styles.triggerValue : styles.triggerPlaceholder}>
            {selected?.label ?? field.placeholder ?? "Sélectionner..."}
          </Text>
        </View>
      </TouchableRipple>

      {(error || field.help_text) && (
        <HelperText type={error ? "error" : "info"} visible>
          {error || field.help_text}
        </HelperText>
      )}

      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)} style={styles.dialog}>
          <Dialog.Title>{field.label}</Dialog.Title>
          <Dialog.ScrollArea style={styles.scrollArea}>
            <ScrollView>
              <RadioButton.Group
                value={String(value ?? "")}
                onValueChange={(v) => {
                  onChange(v);
                  setOpen(false);
                }}
              >
                {options.map((opt) => (
                  <RadioButton.Item
                    key={opt.value}
                    label={opt.label}
                    value={opt.value}
                    labelStyle={styles.optionLabel}
                  />
                ))}
              </RadioButton.Group>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>Fermer</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  dialog: {
    maxHeight: "70%",
  },
  scrollArea: {
    maxHeight: 350,
    paddingHorizontal: 0,
  },
  optionLabel: {
    fontSize: 15,
  },
});
