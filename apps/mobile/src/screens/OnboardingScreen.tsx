/**
 * OnboardingScreen — Gluestack refonte: 6-step horizontal walkthrough.
 */
import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Box,
  Button,
  ButtonText,
  Heading,
  HStack,
  Icon,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import {
  Bell,
  CloudOff,
  FileText,
  MapPinned,
  QrCode,
  Sparkles,
  type LucideIcon,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ONBOARDING_KEY = "@opsflux:onboarding_complete";

interface Step {
  icon: LucideIcon;
  titleKey: string;
  titleFb: string;
  descKey: string;
  descFb: string;
  bg: string;
  fg: string;
}

interface Props {
  onComplete: () => void;
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    titleKey: "onboarding.welcomeTitle",
    titleFb: "Bienvenue sur OpsFlux Mobile",
    descKey: "onboarding.welcomeDesc",
    descFb:
      "Votre application terrain pour gérer les opérations, le personnel, les colis et le transport. Tout est adapté à votre rôle et vos permissions.",
    bg: "$primary50",
    fg: "$primary600",
  },
  {
    icon: QrCode,
    titleKey: "onboarding.scanTitle",
    titleFb: "Scannez en un geste",
    descKey: "onboarding.scanDesc",
    descFb:
      "Scannez les QR codes des Avis de Séjour pour le boarding, et les codes des colis pour le suivi. Le scanner supporte QR, Code128, EAN et plus.",
    bg: "$info50",
    fg: "$info600",
  },
  {
    icon: FileText,
    titleKey: "onboarding.formTitle",
    titleFb: "Formulaires intelligents",
    descKey: "onboarding.formDesc",
    descFb:
      "Créez des ADS, des demandes d'expédition et des missions directement depuis l'app. Les formulaires sont dynamiques — ils s'adaptent automatiquement sans mise à jour.",
    bg: "$primary50",
    fg: "$primary600",
  },
  {
    icon: CloudOff,
    titleKey: "onboarding.offlineTitle",
    titleFb: "Fonctionne hors-ligne",
    descKey: "onboarding.offlineDesc",
    descFb:
      "Pas de réseau ? Pas de problème. Vos données sont mises en cache et vos actions sont envoyées automatiquement dès que la connexion revient.",
    bg: "$warning50",
    fg: "$warning600",
  },
  {
    icon: MapPinned,
    titleKey: "onboarding.gpsTitle",
    titleFb: "Suivi en temps réel",
    descKey: "onboarding.gpsDesc",
    descFb:
      "Activez la balise GPS pour être suivi pendant les voyages. Les capitaines et chauffeurs peuvent consulter le manifeste et enregistrer les événements en direct.",
    bg: "$success50",
    fg: "$success600",
  },
  {
    icon: Bell,
    titleKey: "onboarding.notifTitle",
    titleFb: "Restez informé",
    descKey: "onboarding.notifDesc",
    descFb:
      "Recevez les notifications en temps réel : validations ADS, réceptions de colis, événements de voyage. Tout est centralisé dans l'app.",
    bg: "$error50",
    fg: "$error600",
  },
];

export default function OnboardingScreen({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(index);
  }

  function goToNext() {
    if (currentIndex < STEPS.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  }

  async function handleComplete() {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    onComplete();
  }

  const isLast = currentIndex === STEPS.length - 1;

  const renderStep = ({ item }: { item: Step }) => (
    <Box w={SCREEN_WIDTH} flex={1} alignItems="center" justifyContent="center" px="$10">
      <Box bg={item.bg} borderRadius="$full" p="$6" mb="$8">
        <Icon as={item.icon} size="xl" color={item.fg} />
      </Box>
      <Heading size="xl" textAlign="center" color="$textLight900" mb="$4">
        {t(item.titleKey, item.titleFb)}
      </Heading>
      <Text size="md" textAlign="center" color="$textLight600" lineHeight={26}>
        {t(item.descKey, item.descFb)}
      </Text>
    </Box>
  );

  return (
    <Box flex={1} bg="$backgroundLight50" pt={insets.top}>
      <FlatList
        ref={flatListRef}
        data={STEPS}
        renderItem={renderStep}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        keyExtractor={(_, i) => String(i)}
      />

      <HStack justifyContent="center" space="xs" py="$4">
        {STEPS.map((_, i) => (
          <Box
            key={i}
            w={i === currentIndex ? 24 : 8}
            h={8}
            borderRadius="$full"
            bg={i === currentIndex ? "$primary600" : "$borderLight300"}
          />
        ))}
      </HStack>

      <HStack
        justifyContent="space-between"
        alignItems="center"
        px="$6"
        pb={insets.bottom + 24}
      >
        <Button size="md" variant="link" onPress={handleComplete}>
          <ButtonText color="$textLight500">{t("onboarding.skip", "Passer")}</ButtonText>
        </Button>
        <Button size="lg" action="primary" onPress={isLast ? handleComplete : goToNext} minWidth={140}>
          <ButtonText>
            {isLast ? t("onboarding.start", "Commencer") : t("onboarding.next", "Suivant")}
          </ButtonText>
        </Button>
      </HStack>
    </Box>
  );
}

export async function isOnboardingComplete(): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value === "true";
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
}
