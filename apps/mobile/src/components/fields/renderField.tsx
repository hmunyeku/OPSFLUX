/**
 * Shared field renderer — maps a FieldDefinition to the right component.
 *
 * Used by both DynamicForm (top-level fields) and FieldRepeater (nested items).
 * This guarantees that lookups, selects, dates, photos etc. work consistently
 * at any depth.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@gluestack-ui/themed";
import FieldText from "./FieldText";
import FieldNumber from "./FieldNumber";
import FieldSelect from "./FieldSelect";
import FieldMultiSelect from "./FieldMultiSelect";
import FieldDate from "./FieldDate";
import FieldToggle from "./FieldToggle";
import FieldLookup from "./FieldLookup";
import FieldMultiLookup from "./FieldMultiLookup";
import FieldPhoto from "./FieldPhoto";
import FieldBarcode from "./FieldBarcode";
import FieldSignature from "./FieldSignature";
import FieldLocation from "./FieldLocation";
import FieldTags from "./FieldTags";
import FieldGroup from "./FieldGroup";
import FieldRepeater from "./FieldRepeater";
import type { FieldDefinition } from "../../types/forms";
import { colors } from "../../utils/colors";

type OnChange = (fieldName: string, value: unknown) => void;

export function renderFieldByType(
  field: FieldDefinition,
  fieldName: string,
  value: unknown,
  error: string | undefined,
  required: boolean,
  onChange: OnChange
): React.ReactElement | null {
  const props = { field, fieldName, value, error, required };

  switch (field.type) {
    case "text":
    case "textarea":
    case "email":
    case "url":
      return <FieldText {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "integer":
    case "decimal":
      return <FieldNumber {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "select":
      return <FieldSelect {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "multi_select":
      return <FieldMultiSelect {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "date":
    case "datetime":
      return <FieldDate {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "toggle":
      return <FieldToggle {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "lookup":
      return <FieldLookup {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "multi_lookup":
      return <FieldMultiLookup {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "photo":
      return <FieldPhoto {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "barcode":
      return <FieldBarcode {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "signature":
      return <FieldSignature {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "location":
      return <FieldLocation {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "tags":
      return <FieldTags {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "group":
      return <FieldGroup {...props} onChange={(v) => onChange(fieldName, v)} />;

    case "repeater":
      return (
        <FieldRepeater
          {...props}
          onChange={(v) => onChange(fieldName, v)}
        />
      );

    case "computed":
    case "readonly":
      return (
        <View style={styles.readonlyField}>
          <Text style={styles.readonlyLabel}>
            {field.label}
          </Text>
          <Text style={styles.readonlyValue}>
            {String(value ?? "—")}
          </Text>
        </View>
      );

    default:
      if (__DEV__) {
        console.warn(`[renderFieldByType] Unknown field type "${field.type}" for "${fieldName}", falling back to text`);
      }
      return <FieldText {...props} onChange={(v) => onChange(fieldName, v)} />;
  }
}

const styles = StyleSheet.create({
  readonlyField: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  readonlyLabel: { color: colors.textSecondary, marginBottom: 2 },
  readonlyValue: { color: colors.textPrimary },
});
