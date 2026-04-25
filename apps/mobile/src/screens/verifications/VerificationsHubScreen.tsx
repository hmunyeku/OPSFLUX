/**
 * VerificationsHub — lists verification types and their current status.
 *
 * Routes to the appropriate flow when a tile is tapped:
 *   - phone       → PhoneVerification
 *   - email       → EmailVerification
 *   - location    → LocationVerification
 *   - id_document → IdDocumentVerification
 *
 * Polls listMyVerifications() to show real-time status (pending, verified,
 * rejected, expired).
 */

import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Box,
  Heading,
  HStack,
    Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon, type MIconName } from "../../components/MIcon";
import { useTranslation } from "react-i18next";
import { listMyVerifications, type UserVerification } from "../../services/verifications";

interface Props {
  navigation: any;
}

type VType = "phone" | "email" | "location" | "id_document";

interface Tile {
  type: VType;
  route: string;
  icon: MIconName;
  labelKey: string;
  labelFallback: string;
  descKey: string;
  descFallback: string;
}

const TILES: Tile[] = [
  {
    type: "phone",
    route: "PhoneVerification",
    icon: "phone",
    labelKey: "verif.phone.title",
    labelFallback: "Numéro de téléphone",
    descKey: "verif.phone.desc",
    descFallback: "Recevez un code par SMS ou WhatsApp",
  },
  {
    type: "email",
    route: "EmailVerification",
    icon: "email",
    labelKey: "verif.email.title",
    labelFallback: "Adresse email",
    descKey: "verif.email.desc",
    descFallback: "Recevez un code par email",
  },
  {
    type: "location",
    route: "LocationVerification",
    icon: "place",
    labelKey: "verif.location.title",
    labelFallback: "Localisation GPS",
    descKey: "verif.location.desc",
    descFallback: "Confirmez votre position actuelle",
  },
  {
    type: "id_document",
    route: "IdDocumentVerification",
    icon: "badge",
    labelKey: "verif.id.title",
    labelFallback: "Pièce d'identité",
    descKey: "verif.id.desc",
    descFallback: "Passeport, carte nationale ou permis",
  },
];

function statusOf(verifications: UserVerification[], type: VType): UserVerification | null {
  // Prefer the most recent "verified", else the latest entry
  const matching = verifications.filter((v) => v.type === type);
  const verified = matching.find((v) => v.status === "verified");
  if (verified) return verified;
  return matching[0] ?? null;
}

export default function VerificationsHubScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [verifications, setVerifications] = useState<UserVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listMyVerifications();
      setVerifications(data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Box flex={1} bg="$backgroundLight50">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 24,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <VStack space="md">
          <Box mb="$2">
            <Heading size="xl" color="$textLight900">
              {t("verif.hub.title", "Mes vérifications")}
            </Heading>
            <Text size="md" color="$textLight600" mt="$1">
              {t(
                "verif.hub.subtitle",
                "Renforcez la sécurité de votre compte en vérifiant votre identité."
              )}
            </Text>
          </Box>

          {loading ? (
            <Box py="$10" alignItems="center">
              <Spinner color="$primary600" />
            </Box>
          ) : (
            TILES.map((tile) => {
              const state = statusOf(verifications, tile.type);
              return (
                <Pressable
                  key={tile.type}
                  onPress={() => navigation.navigate(tile.route)}
                  bg="$white"
                  borderRadius="$lg"
                  borderWidth={1}
                  borderColor="$borderLight200"
                  p="$4"
                  $active-bg="$backgroundLight100"
                >
                  <HStack space="md" alignItems="center">
                    <Box
                      bg="$primary50"
                      borderRadius="$lg"
                      p="$2.5"
                    >
                      <MIcon name={tile.icon} size="lg" color="$primary700" />
                    </Box>
                    <VStack flex={1}>
                      <Text size="md" fontWeight="$semibold" color="$textLight900">
                        {t(tile.labelKey, tile.labelFallback)}
                      </Text>
                      <Text size="xs" color="$textLight500" mt="$0.5">
                        {t(tile.descKey, tile.descFallback)}
                      </Text>
                      <StatusBadge state={state} />
                    </VStack>
                    <MIcon name="chevron-right" size="md" color="$textLight400" />
                  </HStack>
                </Pressable>
              );
            })
          )}
        </VStack>
      </ScrollView>
    </Box>
  );
}

function StatusBadge({ state }: { state: UserVerification | null }) {
  const { t } = useTranslation();

  if (!state) {
    return (
      <HStack mt="$1.5" alignItems="center" space="xs">
        <Box w="$2" h="$2" borderRadius="$full" bg="$textLight300" />
        <Text size="xs" color="$textLight500" fontWeight="$medium">
          {t("verif.status.notStarted", "Non vérifié")}
        </Text>
      </HStack>
    );
  }

  if (state.status === "verified") {
    return (
      <HStack mt="$1.5" alignItems="center" space="xs">
        <MIcon name="verified" size="xs" color="$success600" />
        <Text size="xs" color="$success700" fontWeight="$medium">
          {t("verif.status.verified", "Vérifié")}
        </Text>
      </HStack>
    );
  }

  if (state.status === "pending") {
    return (
      <HStack mt="$1.5" alignItems="center" space="xs">
        <MIcon name="schedule" size="xs" color="$warning600" />
        <Text size="xs" color="$warning700" fontWeight="$medium">
          {t("verif.status.pending", "En attente")}
        </Text>
      </HStack>
    );
  }

  return (
    <HStack mt="$1.5" alignItems="center" space="xs">
      <MIcon name="cancel" size="xs" color="$error600" />
      <Text size="xs" color="$error700" fontWeight="$medium">
        {state.status === "rejected"
          ? t("verif.status.rejected", "Rejeté")
          : t("verif.status.expired", "Expiré")}
      </Text>
    </HStack>
  );
}
