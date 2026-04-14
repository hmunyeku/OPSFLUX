/**
 * Multi-select field — multiple choice with checkboxes in a dialog.
 */

import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  HelperText,
  Portal,
  Text,
  TouchableRipple,
} from "react-native-paper";
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

export default function FieldMultiSelect({ field, value, error, required, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const options = field.options ?? [];

  function toggle(val: string) {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  }

  const selectedLabels = selected
    .map((v) => options.find((o) => o.value === v)?.label ?? v)
    .join(", ");

  return (
    <>
      <TouchableRipple onPress={() => setOpen(true)} style={styles.trigger}>
        <View style={[styles.triggerInner, error ? styles.triggerError : null]}>
          <Text variant="bodySmall" style={styles.triggerLabel}>
            {field.label}{required ? " *" : ""}
          </Text>
          {selected.length > 0 ? (
            <View style={styles.chipRow}>
              {selected.slice(0, 3).map((v) => (
                <Chip key={v} compact style={styles.chip}>
                  {options.find((o) => o.value === v)?.label ?? v}
                </Chip>
              ))}
              {selected.length > 3 && (
                <Chip compact style={styles.chip}>+{selected.length - 3}</Chip>
              )}
            </View>
          ) : (
            <Text variant="bodyLarge" style={styles.triggerPlaceholder}>
              {field.placeholder ?? "Sélectionner..."}
            </Text>
          )}
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
              {options.map((opt) => (
                <Checkbox.Item
                  key={opt.value}
                  label={opt.label}
                  status={selected.includes(opt.value) ? "checked" : "unchecked"}
                  onPress={() => toggle(opt.value)}
                  labelStyle={styles.optionLabel}
                />
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>OK ({selected.length})</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { borderRadius: 4 },
  triggerInner: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  triggerError: { borderColor: colors.danger },
  triggerLabel: { color: colors.textSecondary, marginBottom: 4 },
  triggerPlaceholder: { color: colors.textMuted },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: { height: 28 },
  dialog: { maxHeight: "70%" },
  scrollArea: { maxHeight: 350, paddingHorizontal: 0 },
  optionLabel: { fontSize: 15 },
});
