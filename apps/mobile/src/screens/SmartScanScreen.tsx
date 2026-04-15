/**
 * Smart QR / barcode scanner — auto-detects the code type and routes accordingly.
 *
 * Recognizes:
 *  - ADS boarding tokens:   URL contains `/ads-boarding/<token>` or `/ads/boarding/scan/<token>`
 *  - Cargo tracking codes:  URL contains `/cargo/<code>` OR a plain code like CGO-YYYY-NNNNN / CRG-...
 *  - AVM / mission notices: URL contains `/avm/<id>`
 *
 * Falls back to a disambiguation dialog if the code doesn't match any
 * known pattern — the user can pick the expected type manually.
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
import { getAdsBoardingScanContext } from "../services/paxlog";
import { getPublicCargoTracking } from "../services/packlog";
import { colors } from "../utils/colors";

interface Props {
  navigation: any;
}

type DetectedType =
  | { kind: "ads"; token: string }
  | { kind: "cargo"; code: string }
  | { kind: "cargo_request"; id?: string; code?: string }
  | { kind: "avm"; id: string }
  | { kind: "unknown"; raw: string };

function detect(raw: string): DetectedType {
  const trimmed = raw.trim();

  // 1. ADS boarding — accept both /ads-boarding/ (public share) and
  //    /ads/boarding/scan/ (internal)
  const adsMatch =
    trimmed.match(/\/ads-boarding\/([^/?#]+)/) ??
    trimmed.match(/\/ads\/boarding\/scan\/([^/?#]+)/);
  if (adsMatch?.[1]) {
    return { kind: "ads", token: decodeURIComponent(adsMatch[1]) };
  }

  // 2. AVM / mission notice
  const avmMatch = trimmed.match(/\/avm\/([^/?#]+)/);
  if (avmMatch?.[1]) {
    return { kind: "avm", id: decodeURIComponent(avmMatch[1]) };
  }

  // 3. Cargo request (Lettre de Transport) — encoded as
  //    `https://app.opsflux.io/packlog?request=<uuid>` by the LT PDF
  //    template (packlog_service.py:1603). Also accept raw CGR- codes.
  const requestMatch = trimmed.match(/[?&]request=([A-Za-z0-9-]+)/);
  if (requestMatch?.[1]) {
    return { kind: "cargo_request", id: decodeURIComponent(requestMatch[1]) };
  }
  if (/^CGR[- ]?\d/i.test(trimmed)) {
    return {
      kind: "cargo_request",
      code: trimmed.toUpperCase().replace(/\s+/g, ""),
    };
  }

  // 4. Cargo — either a URL with /cargo/<code> or a raw tracking code
  const cargoUrlMatch = trimmed.match(/\/cargo\/([^/?#]+)/);
  if (cargoUrlMatch?.[1]) {
    return { kind: "cargo", code: decodeURIComponent(cargoUrlMatch[1]) };
  }
  if (/^(CGO|CARGO)[- ]?\d/i.test(trimmed)) {
    return { kind: "cargo", code: trimmed.toUpperCase().replace(/\s+/g, "") };
  }

  return { kind: "unknown", raw: trimmed };
}

export default function SmartScanScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");

  async function routeScan(raw: string) {
    const detected = detect(raw);
    setLoading(true);

    try {
      if (detected.kind === "ads") {
        const context = await getAdsBoardingScanContext(detected.token);
        navigation.navigate("AdsBoardingDetail", {
          context,
          token: detected.token,
        });
        return;
      }

      if (detected.kind === "cargo") {
        const tracking = await getPublicCargoTracking(detected.code);
        navigation.navigate("CargoDetail", {
          tracking,
          trackingCode: detected.code,
        });
        return;
      }

      if (detected.kind === "cargo_request") {
        // LT (Lettre de Transport) — scanner la LT amène sur le détail
        // de la demande d'expédition avec la liste des colis.
        navigation.navigate("CargoRequestDetail", {
          requestId: detected.id,
          requestCode: detected.code,
        });
        return;
      }

      if (detected.kind === "avm") {
        navigation.navigate("AvmDetail", { avmId: detected.id });
        return;
      }

      // Unknown — try to guess: first ADS, then cargo
      try {
        const context = await getAdsBoardingScanContext(detected.raw);
        navigation.navigate("AdsBoardingDetail", {
          context,
          token: detected.raw,
        });
        return;
      } catch {
        /* fall through */
      }
      try {
        const tracking = await getPublicCargoTracking(detected.raw);
        navigation.navigate("CargoDetail", {
          tracking,
          trackingCode: detected.raw,
        });
        return;
      } catch {
        /* fall through */
      }

      Alert.alert(
        "Code non reconnu",
        `Le code scanné ne correspond à aucun ADS, AVM ou colis connu.\n\n${detected.raw.slice(0, 80)}`
      );
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 404) {
        Alert.alert(
          detected.kind === "ads" ? "ADS introuvable" : "Ressource introuvable",
          detail || "Aucun enregistrement trouvé pour ce code."
        );
      } else if (status === 403) {
        Alert.alert("Accès refusé", detail || "Droits insuffisants.");
      } else if (status === 410) {
        Alert.alert("Expiré", detail || "Cette ressource n'est plus active.");
      } else {
        Alert.alert("Erreur", detail || "Impossible de lire ce code.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Reconnaissance en cours...</Text>
      </View>
    );
  }

  if (manualMode) {
    return (
      <View style={styles.manualContainer}>
        <Text style={styles.manualTitle}>Saisie manuelle</Text>
        <Text style={styles.manualSubtitle}>
          Entrez un code (tracking colis, token ADS, ID AVM) ou collez une URL
          complète.
        </Text>
        <TextInput
          style={styles.manualInput}
          placeholder="Code ou URL"
          placeholderTextColor={colors.textMuted}
          value={manualCode}
          onChangeText={setManualCode}
          autoFocus
        />
        <Pressable
          style={styles.manualButton}
          onPress={() => routeScan(manualCode)}
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
        onScan={routeScan}
        instruction="Scannez n'importe quel QR code OpsFlux"
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
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  manualButton: {
    backgroundColor: colors.primary,
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
