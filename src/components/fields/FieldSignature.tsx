/**
 * Signature capture field — draws on a canvas and stores as SVG path data.
 *
 * Uses react-native-svg for rendering. The user draws with their finger,
 * and the path data is stored as the field value.
 */

import React, { useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { Button, HelperText, Text } from "react-native-paper";
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

interface Point {
  x: number;
  y: number;
}

export default function FieldSignature({ field, value, error, required, onChange }: Props) {
  const [paths, setPaths] = useState<string[]>(
    value ? [value as string] : []
  );
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const containerRef = useRef<View>(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        // Measure container position for accurate coordinates
        containerRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
          offsetRef.current = { x: pageX, y: pageY };
        });
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath([{ x: locationX, y: locationY }]);
      },

      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath((prev) => [...prev, { x: locationX, y: locationY }]);
      },

      onPanResponderRelease: () => {
        if (currentPath.length > 1) {
          const pathData = pointsToSvgPath(currentPath);
          const newPaths = [...paths, pathData];
          setPaths(newPaths);
          onChange(newPaths.join(" "));
        }
        setCurrentPath([]);
      },
    })
  ).current;

  function clear() {
    setPaths([]);
    setCurrentPath([]);
    onChange("");
  }

  const currentPathData =
    currentPath.length > 1 ? pointsToSvgPath(currentPath) : "";
  const hasSigned = paths.length > 0 || currentPath.length > 0;

  return (
    <View>
      <Text variant="bodySmall" style={styles.label}>
        {field.label}{required ? " *" : ""}
      </Text>

      <View
        ref={containerRef}
        style={[styles.canvas, error ? styles.canvasError : null]}
        {...panResponder.panHandlers}
      >
        <Svg width="100%" height="100%">
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
          {currentPathData && (
            <Path
              d={currentPathData}
              stroke={colors.primary}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </Svg>

        {!hasSigned && (
          <View style={styles.placeholder}>
            <Text variant="bodyMedium" style={styles.placeholderText}>
              Signez ici
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {hasSigned && (
          <Button mode="outlined" compact onPress={clear} textColor={colors.danger}>
            Effacer
          </Button>
        )}
      </View>

      {(error || field.help_text) && (
        <HelperText type={error ? "error" : "info"} visible>
          {error || field.help_text}
        </HelperText>
      )}
    </View>
  );
}

/** Convert a list of points to an SVG path data string. */
function pointsToSvgPath(points: Point[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }
  return d;
}

const styles = StyleSheet.create({
  label: { color: colors.textSecondary, marginBottom: 8 },
  canvas: {
    height: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  canvasError: { borderColor: colors.danger },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none",
  },
  placeholderText: { color: colors.textMuted },
  actions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 6 },
});
