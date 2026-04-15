/**
 * FieldDate / FieldDateTime — date picker trigger via Gluestack shell.
 *
 * Rewritten off react-native-paper. Uses the native DateTimePicker
 * modal on Android (default spinner picker) and a Gluestack bottom-
 * sheet-style modal on iOS with an Apple-native spinner inside.
 */

import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Button, ButtonText, Text } from "@gluestack-ui/themed";
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

export default function FieldDate({ field, value, error, required, onChange }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [temporaryValue, setTemporaryValue] = useState<Date | null>(null);
  const isDatetime = field.type === "datetime";
  const hasValue = !!value;
  const dateValue = value ? new Date(value as string) : new Date();
  const displayText = hasValue
    ? format(dateValue, isDatetime ? "dd MMM yyyy HH:mm" : "dd MMM yyyy", {
        locale: fr,
      })
    : field.placeholder ?? "Sélectionner une date...";

  function emit(d: Date) {
    onChange(isDatetime ? d.toISOString() : d.toISOString().split("T")[0]);
  }

  function handleAndroid(_event: unknown, selectedDate?: Date) {
    setShowPicker(false);
    if (selectedDate) emit(selectedDate);
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
        style={[
          styles.trigger,
          error ? styles.triggerError : null,
        ]}
        onPress={() => {
          setTemporaryValue(dateValue);
          setShowPicker(true);
        }}
      >
        <Text
          size="md"
          color={hasValue ? "$textLight900" : "$textLight400"}
        >
          {displayText}
        </Text>
      </Pressable>

      {/* Android — inline picker that closes on confirm */}
      {showPicker && Platform.OS === "android" && (
        <DateTimePicker
          value={dateValue}
          mode={isDatetime ? "datetime" : "date"}
          display="default"
          onChange={handleAndroid}
        />
      )}

      {/* iOS — bottom-sheet-style modal with native spinner */}
      {Platform.OS === "ios" && (
        <Modal
          visible={showPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPicker(false)}
        >
          <View style={styles.modalRoot}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setShowPicker(false)}
            />
            <View style={styles.modalSheet}>
              <Text size="md" fontWeight="$semibold" mb="$2">
                {field.label}
              </Text>
              <DateTimePicker
                value={temporaryValue ?? dateValue}
                mode={isDatetime ? "datetime" : "date"}
                display="spinner"
                locale="fr"
                onChange={(_e, d) => d && setTemporaryValue(d)}
              />
              <View style={styles.modalActions}>
                <Button
                  variant="outline"
                  action="secondary"
                  flex={1}
                  onPress={() => setShowPicker(false)}
                >
                  <ButtonText>Annuler</ButtonText>
                </Button>
                <Button
                  action="primary"
                  flex={1}
                  onPress={() => {
                    if (temporaryValue) emit(temporaryValue);
                    setShowPicker(false);
                  }}
                >
                  <ButtonText>Valider</ButtonText>
                </Button>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    minHeight: 44,
    justifyContent: "center",
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
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
});
