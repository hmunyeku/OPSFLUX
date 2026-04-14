/**
 * Cargo/Colis QR/Barcode Scanner screen.
 *
 * Scans a tracking code (QR or barcode) then navigates to cargo detail.
 * Supports both:
 *  - Public tracking codes (CGO-YYYY-NNNNN)
 *  - Full URLs containing the tracking code
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QrScanner from "../components/QrScanner";
import { getCargoByTrackingCode, getPublicCargoTracking } from "../services/packlog";
import { useAuthStore } from "../stores/auth";
import { colors } from "../utils/colors";

interface Props {
  navigation: any;
}

export default function ScanCargoScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");

  async function lookupTracking(code: string) {
    // Extract tracking code from URLs if needed
    let trackingCode = code.trim();
    const cargoPath = "/cargo/";
    const idx = code.indexOf(cargoPath);
    if (idx >= 0) {
      trackingCode = code.substring(idx + cargoPath.length).split("?")[0].split("/")[0];
    }

    if (!trackingCode) {
      Alert.alert("Erreur", "Code de tracking invalide.");
      return;
    }

    setLoading(true);
    try {
      // Authenticated users go through the scan assistant (GPS capture
      // + location match + optional status change). Anonymous users
      // fall back to the public tracking page.
      const isAuth = !!useAuthStore.getState().accessToken;
      if (isAuth) {
        try {
          const cargo = await getCargoByTrackingCode(trackingCode);
          navigation.replace("CargoScanAssistant", {
            cargoId: cargo.id,
            trackingCode,
          });
          return;
        } catch (authErr: any) {
          // Fall through to public tracking if the authed lookup
          // 404s — shouldn't happen for a valid code within the user's
          // entity, but keeps public codes (cross-entity return
          // receipts, etc.) working.
          if (authErr?.response?.status !== 404) throw authErr;
        }
      }
      const tracking = await getPublicCargoTracking(trackingCode);
      navigation.navigate("CargoDetail", { tracking, trackingCode });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 404) {
        Alert.alert(
          "Colis introuvable",
          `Aucun colis trouvé avec le code "${trackingCode}".`
        );
      } else {
        Alert.alert("Erreur", detail || "Impossible de trouver ce colis.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Recherche du colis...</Text>
      </View>
    );
  }

  if (manualMode) {
    return (
      <View style={styles.manualContainer}>
        <Text style={styles.manualTitle}>Saisie manuelle</Text>
        <Text style={styles.manualSubtitle}>
          Entrez le code de tracking du colis (ex: CGO-2026-00123)
        </Text>
        <TextInput
          style={styles.manualInput}
          placeholder="Code de tracking"
          placeholderTextColor={colors.textMuted}
          value={manualCode}
          onChangeText={setManualCode}
          autoCapitalize="characters"
          autoFocus
        />
        <Pressable
          style={styles.manualButton}
          onPress={() => lookupTracking(manualCode)}
        >
          <Text style={styles.manualButtonText}>Rechercher</Text>
        </Pressable>
        <Pressable onPress={() => setManualMode(false)}>
          <Text style={styles.link}>Retour au scanner</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <QrScanner
        onScan={lookupTracking}
        instruction="Scannez le code du colis"
        paused={loading}
      />
      <View style={styles.bottomBar}>
        <Pressable
          style={styles.manualToggle}
          onPress={() => setManualMode(true)}
        >
          <Text style={styles.manualToggleText}>Saisir manuellement</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingTop: 12,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  manualToggle: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  manualToggleText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  manualContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: "center",
  },
  manualTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  manualSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  manualInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 16,
  },
  manualButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  manualButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "600",
  },
  link: {
    color: colors.primaryLight,
    textAlign: "center",
    marginTop: 16,
    fontSize: 14,
  },
});
