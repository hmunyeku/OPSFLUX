/**
 * EmailVerificationScreen — pick an email then run the OTP wizard.
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
import { ArrowLeft, BadgeCheck, Mail } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/auth";
import {
  startEmailVerification,
  confirmEmailVerification,
} from "../../services/verifications";
import OtpWizard from "./OtpWizard";

interface EmailEntry {
  id: string;
  email: string;
  is_primary: boolean;
  verified: boolean;
}

interface Props {
  navigation: any;
}

export default function EmailVerificationScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.userId);
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EmailEntry | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get<EmailEntry[]>(`/api/v1/users/${userId}/emails`);
        setEmails(data);
      } catch {
        setEmails([]);
      } finally {
        setLoading(false);
      }
    }
    if (userId) load();
  }, [userId]);

  if (selected) {
    return (
      <OtpWizard
        title={t("verif.email.title", "Vérifier mon email")}
        subtitle={t(
          "verif.email.subtitle",
          "Nous allons envoyer un code de 6 chiffres à votre adresse."
        )}
        startLabel={t("verif.email.startBtn", "Envoyer le code")}
        confirmInstruction={t(
          "verif.email.codeSent",
          "Saisissez le code reçu par email."
        )}
        onStart={async () => {
          const v = await startEmailVerification(selected.id);
          return {
            verification_id: v.id,
            channel: "email",
            target_label: selected.email,
          };
        }}
        onConfirm={(id, otp) => confirmEmailVerification(id, otp).then(() => {})}
        onDone={() => navigation.goBack()}
        onCancel={() => setSelected(null)}
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
          {t("verif.email.pickTitle", "Quelle adresse vérifier ?")}
        </Heading>
        <Text size="md" color="$textLight600" mb="$5">
          {t(
            "verif.email.pickSubtitle",
            "Sélectionnez l'adresse email à laquelle envoyer le code."
          )}
        </Text>

        {loading ? (
          <Box py="$10" alignItems="center">
            <Spinner color="$primary600" />
          </Box>
        ) : emails.length === 0 ? (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$6">
            <Text size="md" color="$textLight600" textAlign="center">
              {t("verif.email.empty", "Aucune adresse email enregistrée.")}
            </Text>
          </Box>
        ) : (
          <VStack space="sm">
            {emails.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => setSelected(e)}
                bg="$white"
                borderRadius="$lg"
                borderWidth={1}
                borderColor="$borderLight200"
                p="$4"
                $active-bg="$backgroundLight100"
              >
                <HStack space="md" alignItems="center">
                  <Box bg="$primary50" borderRadius="$lg" p="$2.5">
                    <Icon as={Mail} size="md" color="$primary700" />
                  </Box>
                  <VStack flex={1}>
                    <Text size="md" fontWeight="$semibold" color="$textLight900">
                      {e.email}
                    </Text>
                    {e.is_primary && (
                      <Text size="xs" color="$textLight500">
                        {t("verif.email.primary", "Principal")}
                      </Text>
                    )}
                  </VStack>
                  {e.verified && <Icon as={BadgeCheck} size="md" color="$success600" />}
                </HStack>
              </Pressable>
            ))}
          </VStack>
        )}
      </ScrollView>
    </Box>
  );
}
