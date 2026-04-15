/**
 * FieldMultiSelect — multi-choice checkbox list via Gluestack sheet.
 */

import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  ButtonText,
  Heading,
  HStack,
  Text,
} from "@gluestack-ui/themed";
import { MIcon } from "../MIcon";
import FieldShell from "./FieldShell";
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

export default function FieldMultiSelect({
  field,
  value,
  error,
  required,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const options = field.options ?? [];

  function toggle(val: string) {
    if (selected.includes(val)) onChange(selected.filter((v) => v !== val));
    else onChange([...selected, val]);
  }

  return (
    <FieldShell
      label={field.label}
      required={required}
      error={error}
      helpText={field.help_text}
      bare
    >
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.trigger, error ? styles.triggerError : null]}
      >
        {selected.length === 0 ? (
          <Text size="md" color="$textLight400" flex={1}>
            {field.placeholder ?? "Sélectionner…"}
          </Text>
        ) : (
          <View style={styles.chipRow}>
            {selected.slice(0, 3).map((v) => (
              <View key={v} style={styles.chip}>
                <Text size="xs" color="$primary800" numberOfLines={1}>
                  {options.find((o) => o.value === v)?.label ?? v}
                </Text>
              </View>
            ))}
            {selected.length > 3 && (
              <View style={styles.chip}>
                <Text size="xs" color="$primary800">
                  +{selected.length - 3}
                </Text>
              </View>
            )}
          </View>
        )}
        <MIcon name="expand-more" size="sm" color="$textLight500" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setOpen(false)}
          />
          <View style={styles.modalSheet}>
            <HStack alignItems="center" justifyContent="space-between" mb="$3">
              <Heading size="sm">{field.label}</Heading>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <MIcon name="close" size="md" color="$textLight600" />
              </Pressable>
            </HStack>
            <ScrollView style={styles.scroll}>
              {options.map((opt) => {
                const isChecked = selected.includes(opt.value);
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.option,
                      isChecked ? styles.optionSelected : null,
                    ]}
                    onPress={() => toggle(opt.value)}
                  >
                    <MIcon
                      name={isChecked ? "check-box" : "check-box-outline-blank"}
                      size="sm"
                      color={isChecked ? "$primary700" : "$textLight400"}
                      mr="$3"
                    />
                    <Text
                      size="md"
                      color="$textLight900"
                      flex={1}
                      numberOfLines={2}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Button action="primary" mt="$3" onPress={() => setOpen(false)}>
              <ButtonText>
                OK ({selected.length} sélectionné{selected.length > 1 ? "s" : ""})
              </ButtonText>
            </Button>
          </View>
        </View>
      </Modal>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    minHeight: 44,
    gap: 8,
  },
  triggerError: {
    borderColor: colors.danger,
  },
  chipRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  chip: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 140,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: "85%",
  },
  scroll: { maxHeight: 400 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  optionSelected: {
    backgroundColor: "#eff6ff",
  },
});
