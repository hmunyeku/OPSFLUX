/**
 * Reusable QR code scanner component.
 *
 * Uses expo-camera's barcode scanner. Shows a viewfinder overlay
 * and calls onScan when a QR/barcode is detected.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors } from "../utils/colors";

interface Props {
  /** Called with the scanned data string. */
  onScan: (data: string) => void;
  /** Optional instruction text shown above the viewfinder. */
  instruction?: string;
  /** Allow the caller to pause scanning (e.g. while processing). */
  paused?: boolean;
}

export default function QrScanner({
  onScan,
  instruction = "Placez le QR code dans le cadre",
  paused = false,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (paused) setScanned(false);
  }, [paused]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>
          OpsFlux a besoin d'accéder à la caméra pour scanner les QR codes.
        </Text>
        <Pressable style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Autoriser la caméra</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{
          barcodeTypes: ["qr", "code128", "code39", "ean13", "ean8"],
        }}
        onBarcodeScanned={
          scanned || paused
            ? undefined
            : ({ data }) => {
                setScanned(true);
                onScan(data);
              }
        }
      />

      {/* Viewfinder overlay */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={styles.viewfinder}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <Text style={styles.instruction}>{instruction}</Text>
          {scanned && !paused && (
            <Pressable
              style={styles.rescanButton}
              onPress={() => setScanned(false)}
            >
              <Text style={styles.rescanText}>Scanner à nouveau</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const VIEWFINDER_SIZE = 260;
const CORNER_SIZE = 30;
const CORNER_BORDER = 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: colors.background,
  },
  permText: {
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 24,
  },
  permButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  permButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "600",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  overlayMiddle: {
    flexDirection: "row",
    height: VIEWFINDER_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  viewfinder: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    paddingTop: 28,
  },
  instruction: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  rescanButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  rescanText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_BORDER,
    borderLeftWidth: CORNER_BORDER,
    borderColor: colors.accent,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_BORDER,
    borderRightWidth: CORNER_BORDER,
    borderColor: colors.accent,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_BORDER,
    borderLeftWidth: CORNER_BORDER,
    borderColor: colors.accent,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_BORDER,
    borderRightWidth: CORNER_BORDER,
    borderColor: colors.accent,
    borderBottomRightRadius: 4,
  },
});
