/**
 * Signature capture field — draws on a canvas using PanResponder + react-native-svg.
 *
 * Each stroke = one SVG <Path>. The full value stored is all paths concatenated.
 * Layout-aware: SVG is sized to the actual View dimensions to ensure
 * coordinates match what the user sees.
 */

import React, { useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@gluestack-ui/themed";
import Svg, { Path } from "react-native-svg";
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

export default function FieldSignature({ field, value, error, required, onChange }: Props) {
  const [paths, setPaths] = useState<string[]>(() => {
    if (typeof value === "string" && value.length > 0) {
      return value.split(/(?=M )/g).filter((p) => p.trim().length > 0);
    }
    return [];
  });
  const [currentPath, setCurrentPath] = useState<string>("");
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const pointsRef = useRef<{ x: number; y: number }[]>([]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        pointsRef.current = [{ x: locationX, y: locationY }];
        setCurrentPath(`M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
      },

      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        pointsRef.current.push({ x: locationX, y: locationY });
        const pts = pointsRef.current;
        const first = pts[0];
        let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
        for (let i = 1; i < pts.length; i++) {
          d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
        }
        setCurrentPath(d);
      },

      onPanResponderRelease: () => {
        // Rebuild the final path from the ref (NOT from currentPath state —
        // PanResponder closure is created once via useRef and captures the
        // initial empty currentPath, so reading it here always sees "").
        const pts = pointsRef.current;
        if (pts.length > 1) {
          let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
          for (let i = 1; i < pts.length; i++) {
            d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
          }
          setPaths((prev) => {
            const updated = [...prev, d];
            onChange(updated.join(" "));
            return updated;
          });
        }
        pointsRef.current = [];
        setCurrentPath("");
      },

      onPanResponderTerminate: () => {
        pointsRef.current = [];
        setCurrentPath("");
      },
    })
  ).current;

  function clear() {
    setPaths([]);
    setCurrentPath("");
    pointsRef.current = [];
    onChange("");
  }

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setCanvasSize({ width, height });
  }

  const hasSigned = paths.length > 0 || currentPath.length > 0;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.labelRow}>
        <Text size="xs" fontWeight="$medium" color="$textLight600">
          {field.label}
          {required ? <Text color="$error600"> *</Text> : null}
        </Text>
        {hasSigned && (
          <Pressable onPress={clear} hitSlop={8}>
            <Text size="xs" color="$error600" fontWeight="$medium">
              Effacer
            </Text>
          </Pressable>
        )}
      </View>

      <View
        onLayout={handleLayout}
        style={[styles.canvas, error ? styles.canvasError : null]}
        {...panResponder.panHandlers}
      >
        {canvasSize.width > 0 && (
          <Svg
            width={canvasSize.width}
            height={canvasSize.height}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          >
            {paths.map((d, i) => (
              <Path
                key={i}
                d={d}
                stroke={colors.primary}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {currentPath.length > 0 && (
              <Path
                d={currentPath}
                stroke={colors.primary}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </Svg>
        )}

        {!hasSigned && (
          <View style={styles.placeholder} pointerEvents="none">
            <Text size="sm" color="$textLight400" italic>
              Signez ici
            </Text>
          </View>
        )}
      </View>

      {(error || field.help_text) && (
        <Text
          size="2xs"
          color={error ? "$error600" : "$textLight500"}
          mt="$1"
          ml="$0.5"
        >
          {error || field.help_text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: { color: colors.textSecondary },
  clearButton: { marginVertical: -6 },
  canvas: {
    height: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    position: "relative",
  },
  canvasError: { borderColor: colors.danger },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: { color: colors.textMuted, fontStyle: "italic" },
});
