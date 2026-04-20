/**
 * SignaturePad — native SVG-based signature capture for React Native.
 *
 * Why not a WebView-based lib ?
 *   • We already ship react-native-svg + react-native-gesture-handler.
 *   • SVG paths are crisp at any scale and cheap to render.
 *   • No WebView latency / JS bridge jitter.
 *   • The backend accepts any `data:image/*;base64,…` URL — SVG data
 *     URLs are rendered by WeasyPrint (PDF) and by the web
 *     ProtectedSignature (CSS background-image) without modification.
 *
 * Output contract
 *   `onChange(dataUrl)` is called with a `data:image/svg+xml;base64,…`
 *   string each time the stroke set changes. Empty → `null`.
 *
 * The canvas is bordered, rounded and lined — looks like paper, easy
 * to size in any layout. "Effacer" clears all strokes.
 */

import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Path } from "react-native-svg";
import { Button, ButtonText, Text } from "@gluestack-ui/themed";
import { useTranslation } from "react-i18next";

interface Props {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

type Point = { x: number; y: number };
type Stroke = Point[];

function strokeToPath(stroke: Stroke): string {
  if (stroke.length === 0) return "";
  const [head, ...tail] = stroke;
  let d = `M ${head.x.toFixed(1)} ${head.y.toFixed(1)}`;
  for (const p of tail) {
    d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return d;
}

/** Base64-encode a UTF-8 string — Hermes has no Buffer. */
function utf8ToBase64(s: string): string {
  // RN's globalThis.btoa only accepts latin-1. Round-trip via TextEncoder
  // to emit bytes then base64-encode those.
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + 0x8000)),
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (globalThis as any).btoa === "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).btoa(bin);
  }
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  while (i < bin.length) {
    const c1 = bin.charCodeAt(i++) & 0xff;
    const c2 = i < bin.length ? bin.charCodeAt(i++) & 0xff : NaN;
    const c3 = i < bin.length ? bin.charCodeAt(i++) & 0xff : NaN;
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4);
    const e3 = isNaN(c2) ? 64 : ((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6);
    const e4 = isNaN(c3) ? 64 : c3 & 63;
    out +=
      chars.charAt(e1) +
      chars.charAt(e2) +
      (e3 === 64 ? "=" : chars.charAt(e3)) +
      (e4 === 64 ? "=" : chars.charAt(e4));
  }
  return out;
}

function strokesToDataUrl(
  strokes: Stroke[],
  width: number,
  height: number,
): string | null {
  const nonEmpty = strokes.filter((s) => s.length > 1);
  if (nonEmpty.length === 0) return null;
  const paths = nonEmpty
    .map(
      (s) =>
        `<path d="${strokeToPath(s)}" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    paths +
    `</svg>`;
  return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
}

export default function SignaturePad({
  value,
  onChange,
  width = 320,
  height = 140,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [active, setActive] = useState<Stroke>([]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .onBegin((e) => {
          setActive([{ x: e.x, y: e.y }]);
        })
        .onUpdate((e) => {
          setActive((prev) => [...prev, { x: e.x, y: e.y }]);
        })
        .onEnd(() => {
          setStrokes((prev) => {
            const next =
              active.length > 1 ? [...prev, active] : prev;
            const dataUrl = strokesToDataUrl(next, width, height);
            onChange(dataUrl);
            return next;
          });
          setActive([]);
        })
        .runOnJS(true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, disabled, width, height],
  );

  const clear = useCallback(() => {
    setStrokes([]);
    setActive([]);
    onChange(null);
  }, [onChange]);

  const hasStrokes = strokes.length > 0 || active.length > 0 || !!value;

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View
          style={[styles.canvas, { width, height }, disabled && styles.disabled]}
        >
          <Svg width={width} height={height}>
            {strokes.map((s, i) => (
              <Path
                key={i}
                d={strokeToPath(s)}
                stroke="#111"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
            {active.length > 0 && (
              <Path
                d={strokeToPath(active)}
                stroke="#111"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}
          </Svg>
          {!hasStrokes && (
            <Text
              style={styles.hint}
              fontSize={11}
              color="$textLight400"
              fontStyle="italic"
            >
              {t("moc.signature.hint")}
            </Text>
          )}
        </View>
      </GestureDetector>
      {!disabled && (
        <Button
          size="xs"
          variant="outline"
          action="secondary"
          onPress={clear}
          mt="$1.5"
          alignSelf="flex-start"
        >
          <ButtonText>{t("moc.action.eraser")}</ButtonText>
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  disabled: {
    opacity: 0.4,
  },
  hint: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    textAlign: "center",
    transform: [{ translateY: -8 }],
  },
});
