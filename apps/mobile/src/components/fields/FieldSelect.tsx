/**
 * FieldSelect — single-select picker via Gluestack bottom-sheet modal.
 */

import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
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
  onChange: (value: string) => void;
}

export default function FieldSelect({
  field,
  value,
  error,
  required,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const options = field.options ?? [];
  const selected = options.find((o) => o.value === value);

  return (
    <FieldShell
      label={field.label}
      required={required}
      error={error}
      helpText={field.help_text}
      bare
    >
      <Pressable
        style={[styles.trigger, error ? styles.triggerError : null]}
        onPress={() => setOpen(true)}
      >
        <Text
          size="md"
          color={selected ? "$textLight900" : "$textLight400"}
          flex={1}
        >
          {selected?.label ?? field.placeholder ?? "Sélectionner..."}
        </Text>
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
              <Pressable onPress={() => setOpen(false)}>
                <MIcon name="close" size="md" color="$textLight600" />
              </Pressable>
            </HStack>
            <ScrollView style={styles.modalScroll}>
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    style={[
                      styles.option,
                      isSelected ? styles.optionSelected : null,
                    ]}
                  >
                    <Text
                      size="md"
                      color={isSelected ? "$primary700" : "$textLight900"}
                      fontWeight={isSelected ? "$semibold" : "$normal"}
                      flex={1}
                    >
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <MIcon name="check" size="sm" color="$primary700" />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Button
              variant="outline"
              action="secondary"
              mt="$3"
              onPress={() => setOpen(false)}
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
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  triggerError: {
    borderColor: colors.danger,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
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
    maxHeight: "80%",
  },
  modalScroll: {
    maxHeight: 400,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 2,
  },
  optionSelected: {
    backgroundColor: "#eff6ff",
  },
});
