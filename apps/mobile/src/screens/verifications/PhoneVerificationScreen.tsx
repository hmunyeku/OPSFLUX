/**
 * PhoneVerificationScreen — pick a phone then run the OTP wizard.
 *
 * Displays the list of phones attached to the current user. Tap one to
 * receive a code via WhatsApp/SMS (channel decided by entity settings).
 * Already-verified phones show a checkmark and can be re-verified.
 */
import React, { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import {
  Box,
  Heading,
  HStack,
  Icon,
  Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, BadgeCheck, Phone } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/auth";
import {
  startPhoneVerification,
  confirmPhoneVerification,
} from "../../services/verifications";
import OtpWizard from "./OtpWizard";

interface PhoneEntry {
  id: string;
  label: string;
  number: string;
  country_code: string | null;
  verified: boolean;
}

interface Props {
  navigation: any;
}

export default function PhoneVerificationScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.userId);
  const [phones, setPhones] = useState<PhoneEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState<PhoneEntry | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get<PhoneEntry[]>("/api/v1/phones", {
          params: { owner_type: "user", owner_id: userId },
        });
        setPhones(data);
      } catch {
        setPhones([]);
      } finally {
        setLoading(false);
      }
    }
    if (userId) load();
  }, [userId]);

  if (selectedPhone) {
    const fullNumber = `${selectedPhone.country_code ?? ""}${selectedPhone.number}`;
    return (
      <OtpWizard
        title={t("verif.phone.title", "Vérifier mon numéro")}
        subtitle={t(
          "verif.phone.subtitle",
          "Nous allons envoyer un code de 6 chiffres à votre numéro."
        )}
        startLabel={t("verif.phone.startBtn", "Envoyer le code")}
        confirmInstruction={t(
          "verif.phone.codeSent",
          "Saisissez le code reçu par WhatsApp ou SMS."
        )}
        onStart={async () => {
          const v = await startPhoneVerification(selectedPhone.id);
          return {
            verification_id: v.id,
            channel: v.method.replace("otp_", ""),
            target_label: fullNumber,
          };
        }}
        onConfirm={(id, otp) => confirmPhoneVerification(id, otp).then(() => {})}
        onDone={() => navigation.goBack()}
        onCancel={() => setSelectedPhone(null)}
      />
    );
  }

  return (
    <Box flex={1} bg="$backgroundLight50">
      <Box pt={insets.top + 12} px="$4">
        <Pressable onPress={() => navigation.goBack()} py="$2" alignSelf="flex-start">
          <HStack alignItems="center" space="xs">
            <Icon as={ArrowLeft} size="sm" color="$textLight600" />
            <Text size="md" color="$textLight600" fontWeight="$medium">
              {t("common.back", "Retour")}
            </Text>
          </HStack>
        </Pressable>
      </Box>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <Heading size="xl" mb="$1" color="$textLight900">
          {t("verif.phone.pickTitle", "Quel numéro vérifier ?")}
        </Heading>
        <Text size="md" color="$textLight600" mb="$5">
          {t(
            "verif.phone.pickSubtitle",
            "Sélectionnez le numéro auquel envoyer le code. Vous pouvez ajouter d'autres numéros depuis votre profil."
          )}
        </Text>

        {loading ? (
          <Box py="$10" alignItems="center">
            <Spinner color="$primary600" />
          </Box>
        ) : phones.length === 0 ? (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$6">
            <Text size="md" color="$textLight600" textAlign="center">
              {t(
                "verif.phone.empty",
                "Aucun numéro enregistré. Ajoutez-en un depuis votre profil."
              )}
            </Text>
          </Box>
        ) : (
          <VStack space="sm">
            {phones.map((p) => {
              const fullNumber = `${p.country_code ?? ""}${p.number}`;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setSelectedPhone(p)}
                  bg="$white"
                  borderRadius="$lg"
                  borderWidth={1}
                  borderColor="$borderLight200"
                  p="$4"
                  $active-bg="$backgroundLight100"
                >
                  <HStack space="md" alignItems="center">
                    <Box bg="$primary50" borderRadius="$lg" p="$2.5">
                      <Icon as={Phone} size="md" color="$primary700" />
                    </Box>
                    <VStack flex={1}>
                      <Text size="md" fontWeight="$semibold" color="$textLight900">
                        {fullNumber}
                      </Text>
                      <Text size="xs" color="$textLight500" textTransform="capitalize">
                        {p.label}
                      </Text>
                    </VStack>
                    {p.verified && (
                      <Icon as={BadgeCheck} size="md" color="$success600" />
                    )}
                  </HStack>
                </Pressable>
              );
            })}
          </VStack>
        )}
      </ScrollView>
    </Box>
  );
}
