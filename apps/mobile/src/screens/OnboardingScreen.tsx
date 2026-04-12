/**
 * Onboarding walkthrough — shown on first launch after login.
 *
 * Multi-step tutorial explaining the app features:
 *  1. Welcome + role-based portal explanation
 *  2. Scanner QR (ADS + colis)
 *  3. Formulaires dynamiques
 *  4. Mode offline
 *  5. GPS tracking
 *  6. Notifications
 *
 * Saved to AsyncStorage so it only shows once.
 * Can be replayed from Settings.
 */

import React, { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
} from "react-native";
import { Button, Text } from "react-native-paper";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../utils/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ONBOARDING_KEY = "@opsflux:onboarding_complete";

interface OnboardingStep {
  icon: string;
  title: string;
  description: string;
  color: string;
}

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const steps: OnboardingStep[] = [
    {
      icon: "OPS",
      title: "Bienvenue sur OpsFlux Mobile",
      description:
        "Votre application terrain pour gérer les opérations, le personnel, les colis et le transport. Tout est adapté à votre rôle et vos permissions.",
      color: colors.primary,
    },
    {
      icon: "QR",
      title: "Scannez en un geste",
      description:
        "Scannez les QR codes des Avis de Séjour pour le boarding, et les codes des colis pour le suivi. Le scanner supporte QR, Code128, EAN et plus.",
      color: colors.info,
    },
    {
      icon: "F",
      title: "Formulaires intelligents",
      description:
        "Créez des ADS, des demandes d'expédition et des missions directement depuis l'app. Les formulaires sont dynamiques — ils s'adaptent automatiquement sans mise à jour.",
      color: colors.accent,
    },
    {
      icon: "OFF",
      title: "Fonctionne hors-ligne",
      description:
        "Pas de réseau ? Pas de problème. Vos données sont mises en cache et vos actions sont envoyées automatiquement dès que la connexion revient.",
      color: colors.warning,
    },
    {
      icon: "GPS",
      title: "Suivi en temps réel",
      description:
        "Activez la balise GPS pour être suivi pendant les voyages. Les capitaines et chauffeurs peuvent consulter le manifeste et enregistrer les événements en direct.",
      color: colors.success,
    },
    {
      icon: "!",
      title: "Restez informé",
      description:
        "Recevez les notifications en temps réel : validations ADS, réceptions de colis, événements de voyage. Tout est centralisé dans l'app.",
      color: colors.danger,
    },
  ];

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(index);
  }

  function goToNext() {
    if (currentIndex < steps.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  }

  async function handleComplete() {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    onComplete();
  }

  const isLast = currentIndex === steps.length - 1;

  const renderStep = ({ item }: { item: OnboardingStep }) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <View style={[styles.iconCircle, { backgroundColor: item.color + "20" }]}>
        <Text style={[styles.iconText, { color: item.color }]}>{item.icon}</Text>
      </View>
      <Text variant="headlineSmall" style={styles.stepTitle}>
        {item.title}
      </Text>
      <Text variant="bodyLarge" style={styles.stepDescription}>
        {item.description}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={steps}
        renderItem={renderStep}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        keyExtractor={(_, i) => String(i)}
      />

      {/* Dots */}
      <View style={styles.dotsRow}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Bottom actions */}
      <View style={styles.bottomRow}>
        <Button mode="text" onPress={handleComplete} textColor={colors.textSecondary}>
          Passer
        </Button>

        {isLast ? (
          <Button mode="contained" onPress={handleComplete} style={styles.startButton}>
            Commencer
          </Button>
        ) : (
          <Button mode="contained" onPress={goToNext} style={styles.nextButton}>
            Suivant
          </Button>
        )}
      </View>
    </View>
  );
}

/** Check if onboarding has been completed. */
export async function isOnboardingComplete(): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value === "true";
}

/** Reset onboarding flag (for Settings "replay tutorial"). */
export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  slide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  iconText: {
    fontSize: 28,
    fontWeight: "800",
  },
  stepTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 16,
  },
  stepDescription: {
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 26,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  nextButton: {
    minWidth: 120,
    borderRadius: 10,
  },
  startButton: {
    minWidth: 140,
    borderRadius: 10,
  },
});
