/**
 * LocationVerificationScreen — capture GPS coords once and submit.
 *
 * Asks for location permission, then shows the captured coordinates
 * with the accuracy and a Confirm button.
 */
import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import {
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Heading,
  HStack,
    Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MIcon } from "../../components/MIcon";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { declareLocation } from "../../services/verifications";

interface Props {
  navigation: any;
}

export default function LocationVerificationScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"requesting" | "denied" | "ready" | "submitting" | "done">(
    "requesting"
  );
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);

  async function fetchLocation() {
    setPhase("requesting");
    setCoords(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPhase("denied");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCoords(pos.coords);
      setCapturedAt(new Date(pos.timestamp));
      setPhase("ready");
    } catch (err: any) {
      setPhase("denied");
      Alert.alert(
        t("verif.location.error", "Erreur GPS"),
        err?.message ?? t("verif.location.errorDesc", "Impossible d'obtenir votre position.")
      );
    }
  }

  useEffect(() => {
    fetchLocation();
  }, []);

  async function handleConfirm() {
    if (!coords || !capturedAt) return;
    setPhase("submitting");
    try {
      await declareLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_m: coords.accuracy ?? null,
        altitude_m: coords.altitude ?? null,
        source: "gps",
        captured_at: capturedAt.toISOString(),
      });
      setPhase("done");
      setTimeout(() => navigation.goBack(), 1500);
    } catch (err: any) {
      setPhase("ready");
      Alert.alert(
        t("common.error", "Erreur"),
        err?.response?.data?.detail ??
          t("verif.location.submitError", "Impossible d'enregistrer la position.")
      );
    }
  }

  return (
    <Box flex={1} bg="$backgroundLight50">
      <Box pt={insets.top + 12} px="$4">
        <Pressable onPress={() => navigation.goBack()} py="$2" alignSelf="flex-start">
          <HStack alignItems="center" space="xs">
            <MIcon name="arrow-back" size="sm" color="$textLight600" />
            <Text size="md" color="$textLight600" fontWeight="$medium">
              {t("common.back", "Retour")}
            </Text>
          </HStack>
        </Pressable>
      </Box>

      <Box flex={1} p="$5" justifyContent="center">
        <Box maxWidth={420} w="$full" alignSelf="center">
          {phase === "done" ? (
            <VStack space="md" alignItems="center">
              <MIcon name="check-circle" size="xl" color="$success600" />
              <Heading size="xl" textAlign="center" color="$textLight900">
                {t("verif.location.doneTitle", "Position enregistrée")}
              </Heading>
              <Text textAlign="center" color="$textLight600">
                {t(
                  "verif.location.doneSubtitle",
                  "Votre localisation est marquée comme vérifiée pour 30 jours."
                )}
              </Text>
            </VStack>
          ) : (
            <VStack space="md">
              <Heading size="xl" color="$textLight900">
                {t("verif.location.title", "Confirmer ma position")}
              </Heading>
              <Text color="$textLight600">
                {t(
                  "verif.location.subtitle",
                  "Nous allons enregistrer vos coordonnées GPS actuelles comme preuve de présence."
                )}
              </Text>

              {phase === "requesting" && (
                <HStack space="sm" alignItems="center" justifyContent="center" py="$8">
                  <Spinner color="$primary600" />
                  <Text color="$textLight600">
                    {t("verif.location.fetching", "Récupération de votre position...")}
                  </Text>
                </HStack>
              )}

              {phase === "denied" && (
                <VStack space="md" mt="$4">
                  <Box bg="$error50" borderRadius="$lg" borderWidth={1} borderColor="$error200" p="$4">
                    <Text size="sm" color="$error900">
                      {t(
                        "verif.location.permDenied",
                        "Permission GPS refusée. Activez-la dans les réglages du système."
                      )}
                    </Text>
                  </Box>
                  <Button size="xl" action="primary" onPress={fetchLocation}>
                    <ButtonText>{t("verif.location.retry", "Réessayer")}</ButtonText>
                  </Button>
                </VStack>
              )}

              {(phase === "ready" || phase === "submitting") && coords && (
                <VStack space="md" mt="$4">
                  <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
                    <HStack space="sm" alignItems="center" mb="$2">
                      <MIcon name="place" size="md" color="$primary700" />
                      <Heading size="sm" color="$textLight900">
                        {t("verif.location.captured", "Position capturée")}
                      </Heading>
                    </HStack>
                    <VStack space="xs">
                      <Row label={t("verif.location.lat", "Latitude")} value={coords.latitude.toFixed(6)} />
                      <Row label={t("verif.location.lng", "Longitude")} value={coords.longitude.toFixed(6)} />
                      <Row
                        label={t("verif.location.accuracy", "Précision")}
                        value={
                          coords.accuracy
                            ? `±${Math.round(coords.accuracy)} m`
                            : t("verif.location.unknown", "inconnue")
                        }
                      />
                      {coords.altitude != null && (
                        <Row
                          label={t("verif.location.altitude", "Altitude")}
                          value={`${Math.round(coords.altitude)} m`}
                        />
                      )}
                    </VStack>
                  </Box>

                  <Button size="xl" action="primary" onPress={handleConfirm} isDisabled={phase === "submitting"}>
                    {phase === "submitting" && <ButtonSpinner mr="$2" />}
                    <ButtonText>
                      {t("verif.location.confirmBtn", "Confirmer cette position")}
                    </ButtonText>
                  </Button>

                  <Pressable alignItems="center" py="$2" onPress={fetchLocation}>
                    <HStack alignItems="center" space="xs">
                      <MIcon name="refresh" size="xs" color="$textLight500" />
                      <Text size="sm" color="$textLight500" fontWeight="$medium">
                        {t("verif.location.refresh", "Réactualiser la position")}
                      </Text>
                    </HStack>
                  </Pressable>
                </VStack>
              )}
            </VStack>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <HStack justifyContent="space-between">
      <Text size="sm" color="$textLight500">{label}</Text>
      <Text size="sm" color="$textLight900" fontWeight="$medium" fontFamily="$mono">
        {value}
      </Text>
    </HStack>
  );
}
