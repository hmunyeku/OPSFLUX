/**
 * ADS QR Scanner screen.
 *
 * Scans a QR code containing a signed AdS boarding token,
 * then navigates to the boarding context detail screen.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from "react-native";
import QrScanner from "../components/QrScanner";
import { getAdsBoardingScanContext } from "../services/paxlog";
import { colors } from "../utils/colors";

interface Props {
  navigation: any;
}

export default function ScanAdsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleScan(data: string) {
    // The QR data may be a full URL or just the token.
    // Extract the token from the URL path if needed.
    let token = data;
    const scanPath = "/ads/boarding/scan/";
    const idx = data.indexOf(scanPath);
    if (idx >= 0) {
      token = data.substring(idx + scanPath.length).split("?")[0];
    }

    if (!token) {
      Alert.alert("Erreur", "QR code invalide — aucun token détecté.");
      return;
    }

    setLoading(true);
    try {
      const context = await getAdsBoardingScanContext(token);
      navigation.navigate("AdsBoardingDetail", { context, token });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 404) {
        Alert.alert("ADS introuvable", detail || "Le QR code ne correspond à aucun Avis de Séjour.");
      } else if (status === 403) {
        Alert.alert("Accès refusé", detail || "Vous n'avez pas les droits pour ce boarding.");
      } else if (status === 410) {
        Alert.alert("ADS expiré", detail || "Cet Avis de Séjour n'est plus actif.");
      } else {
        Alert.alert("Erreur", detail || "Impossible de lire ce QR code ADS.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>
          Chargement du contexte de boarding...
        </Text>
      </View>
    );
  }

  return (
    <QrScanner
      onScan={handleScan}
      instruction="Scannez le QR code de l'Avis de Séjour"
      paused={loading}
    />
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
});
