/**
 * CaptainPortalScreen — Gluestack refonte: 6-digit code login + voyage manifest.
 *
 * Auth flow (separate from main JWT — uses TripCodeAccess):
 *   1. Captain enters 6-digit code → POST /captain/authenticate
 *   2. Server returns session_token + voyage context
 *   3. View manifest (PAX + cargo) + record events (depart/arrive/weather/etc.)
 */

import React, { useCallback, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Heading,
  HStack,
    Input,
  InputField,
  Text,
  Textarea,
  TextareaInput,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { useTranslation } from "react-i18next";
import {
  captainAuthenticate,
  getCaptainManifest,
  postCaptainEvent,
  type CaptainAuthResult,
  type CaptainManifest,
} from "../services/travelwiz";
import StatusBadge from "../components/StatusBadge";

interface Props {
  navigation: any;
}

interface EventType {
  code: string;
  labelKey: string;
  labelFb: string;
  icon: MIconName;
  color: string;
}

const EVENT_TYPES: EventType[] = [
  { code: "departure", labelKey: "captain.event.departure", labelFb: "Départ", icon: PlaneTakeoff, color: "$info600" },
  { code: "arrival", labelKey: "captain.event.arrival", labelFb: "Arrivée", icon: PlaneLanding, color: "$success600" },
  { code: "weather", labelKey: "captain.event.weather", labelFb: "Météo", icon: Cloud, color: "$warning600" },
  { code: "incident", labelKey: "captain.event.incident", labelFb: "Incident", icon: ShieldAlert, color: "$error600" },
  { code: "fuel", labelKey: "captain.event.fuel", labelFb: "Carburant", icon: Fuel, color: "$info600" },
  { code: "technical", labelKey: "captain.event.technical", labelFb: "Technique", icon: Wrench, color: "$primary600" },
];

export default function CaptainPortalScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [step, setStep] = useState<"auth" | "manifest">("auth");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const [session, setSession] = useState<CaptainAuthResult | null>(null);
  const [manifest, setManifest] = useState<CaptainManifest | null>(null);

  const [eventNotes, setEventNotes] = useState("");
  const [recordingEvent, setRecordingEvent] = useState(false);

  const handleAuth = useCallback(async () => {
    if (code.length < 4) {
      Alert.alert(t("common.error", "Erreur"), t("captain.codeRequired", "Entrez le code d'accès voyage."));
      return;
    }
    setLoading(true);
    try {
      const result = await captainAuthenticate(code);
      setSession(result);
      const mf = await getCaptainManifest(result.voyage_id, result.session_token);
      setManifest(mf);
      setStep("manifest");
    } catch (err: any) {
      Alert.alert(
        t("captain.accessDenied", "Accès refusé"),
        err?.response?.data?.detail ?? t("captain.codeInvalid", "Code invalide ou expiré.")
      );
    } finally {
      setLoading(false);
    }
  }, [code, t]);

  const handleRecordEvent = useCallback(
    async (eventCode: string) => {
      if (!session) return;
      setRecordingEvent(true);
      try {
        await postCaptainEvent(session.voyage_id, session.session_token, {
          event_type: eventCode,
          notes: eventNotes || undefined,
        });
        Alert.alert(
          t("captain.recorded", "Enregistré"),
          t("captain.eventSaved", `Événement « {{event}} » enregistré.`, { event: eventCode })
        );
        setEventNotes("");
      } catch (err: any) {
        Alert.alert(t("common.error", "Erreur"), err?.response?.data?.detail || t("captain.saveFail", "Impossible d'enregistrer."));
      } finally {
        setRecordingEvent(false);
      }
    },
    [session, eventNotes, t]
  );

  /* ── Auth view ────────────────────────────────────────────────────── */
  if (step === "auth") {
    return (
      <Box flex={1} bg="$primary900" justifyContent="center" alignItems="center" p="$6">
        <Box maxWidth={400} w="$full" bg="$white" borderRadius="$xl" p="$6" alignItems="center">
          <Box bg="$primary50" borderRadius="$full" p="$3" mb="$3">
            <MIcon name="anchor" size="xl" color="$primary700" />
          </Box>
          <Heading size="lg" color="$primary700" mb="$1">
            {t("captain.title", "Portail Capitaine")}
          </Heading>
          <Text size="sm" color="$textLight600" textAlign="center" mb="$5">
            {t("captain.subtitle", "Entrez le code d'accès voyage à 6 chiffres")}
          </Text>
          <Input size="xl" w="$full" mb="$4" borderColor="$borderLight300">
            <InputField
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              textAlign="center"
              fontSize={28}
              letterSpacing={8}
              placeholder="••••••"
            />
          </Input>
          <Button
            size="xl"
            action="primary"
            w="$full"
            onPress={handleAuth}
            isDisabled={loading || code.length < 4}
          >
            {loading && <ButtonSpinner mr="$2" />}
            <ButtonText>{t("captain.access", "Accéder au voyage")}</ButtonText>
          </Button>
        </Box>
      </Box>
    );
  }

  /* ── Manifest view ────────────────────────────────────────────────── */
  const voyage = manifest?.voyage;
  const passengers = manifest?.passengers ?? [];
  const cargo = manifest?.cargo ?? [];
  const boardedCount = passengers.filter((p) => p.boarding_status === "boarded").length;

  return (
    <Box flex={1} bg="$backgroundLight50">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 14,
          paddingBottom: insets.bottom + 32,
          gap: 12,
        }}
      >
        {/* Voyage header */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <HStack justifyContent="space-between" alignItems="center" mb="$2">
            <Heading size="lg" color="$primary700">
              {voyage?.code ?? session?.voyage_code}
            </Heading>
            {voyage?.status && <StatusBadge status={voyage.status} size="md" />}
          </HStack>
          <Heading size="sm" color="$textLight900">
            {voyage?.vessel_name ?? session?.vessel_name}
          </Heading>
          {voyage?.scheduled_departure && (
            <Text size="xs" color="$textLight500" mt="$1">
              {t("captain.departure", "Départ :")} {new Date(voyage.scheduled_departure).toLocaleString("fr-FR")}
            </Text>
          )}
          {voyage?.scheduled_arrival && (
            <Text size="xs" color="$textLight500">
              {t("captain.arrival", "Arrivée :")} {new Date(voyage.scheduled_arrival).toLocaleString("fr-FR")}
            </Text>
          )}
        </Box>

        {/* PAX */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$3">
            {t("captain.pax", "Passagers")} ({boardedCount}/{passengers.length})
          </Heading>
          {passengers.map((pax, idx) => (
            <HStack
              key={pax.id}
              alignItems="center"
              py="$2.5"
              borderTopWidth={idx === 0 ? 0 : 1}
              borderColor="$borderLight100"
            >
              <VStack flex={1}>
                <Text size="sm" fontWeight="$semibold" color="$textLight900">
                  {pax.name}
                </Text>
                {pax.company && (
                  <Text size="xs" color="$textLight500">
                    {pax.company}
                  </Text>
                )}
              </VStack>
              <VStack alignItems="flex-end" space="xs">
                <StatusBadge status={pax.boarding_status} />
                {pax.standby && (
                  <Badge action="warning" variant="solid" size="sm">
                    <BadgeText>{t("captain.standby", "Standby")}</BadgeText>
                  </Badge>
                )}
              </VStack>
            </HStack>
          ))}
          {passengers.length === 0 && (
            <Text size="sm" color="$textLight500" italic textAlign="center" py="$3">
              {t("captain.noPax", "Aucun passager.")}
            </Text>
          )}
        </Box>

        {/* Cargo */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$3">
            {t("captain.cargo", "Cargo")} ({cargo.length})
          </Heading>
          {cargo.map((c, idx) => (
            <HStack
              key={c.id}
              alignItems="center"
              py="$2.5"
              borderTopWidth={idx === 0 ? 0 : 1}
              borderColor="$borderLight100"
            >
              <VStack flex={1}>
                <Text size="sm" fontWeight="$semibold" color="$primary700">
                  {c.reference}
                </Text>
                <Text size="xs" color="$textLight600">
                  {c.designation}
                  {c.weight_kg ? ` · ${c.weight_kg} kg` : ""}
                </Text>
              </VStack>
              {c.hazmat && (
                <Badge action="error" variant="solid" size="sm">
                  <MIcon name="warning" size="2xs" color="$white" mr="$1" />
                  <BadgeText>HAZMAT</BadgeText>
                </Badge>
              )}
            </HStack>
          ))}
          {cargo.length === 0 && (
            <Text size="sm" color="$textLight500" italic textAlign="center" py="$3">
              {t("captain.noCargo", "Aucun cargo.")}
            </Text>
          )}
        </Box>

        {/* Event recording */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$3">
            {t("captain.logbook", "Journal de bord")}
          </Heading>
          <Textarea size="md" mb="$3" borderColor="$borderLight300">
            <TextareaInput
              value={eventNotes}
              onChangeText={setEventNotes}
              placeholder={t("captain.notesPlaceholder", "Notes (optionnel)")}
            />
          </Textarea>
          <Box flexDirection="row" flexWrap="wrap" gap={8}>
            {EVENT_TYPES.map((evt) => (
              <Button
                key={evt.code}
                size="sm"
                variant="outline"
                action="secondary"
                onPress={() => handleRecordEvent(evt.code)}
                isDisabled={recordingEvent}
              >
                <MIcon name={evt.icon} size="xs" color={evt.color} mr="$1" />
                <ButtonText>{t(evt.labelKey, evt.labelFb)}</ButtonText>
              </Button>
            ))}
          </Box>
        </Box>

        {/* Disconnect */}
        <Button
          size="lg"
          variant="outline"
          action="negative"
          onPress={() => {
            setSession(null);
            setManifest(null);
            setStep("auth");
            setCode("");
          }}
        >
          <MIcon name="logout" color="$error600" size="md" mr="$2" />
          <ButtonText>{t("captain.exit", "Quitter le portail capitaine")}</ButtonText>
        </Button>
      </ScrollView>
    </Box>
  );
}
