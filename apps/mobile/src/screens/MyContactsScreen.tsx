/**
 * MyContactsScreen — Gluestack refonte: manage personal phones, emails, addresses.
 *
 * Note: phone OTP verification was duplicated here. We now point users to
 * the unified VerificationsHub for OTP flow; this screen focuses on
 * read/delete operations.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonText,
  Heading,
  HStack,
  Icon,
  Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import {
  BadgeCheck,
  Mail,
  MapPin,
  Phone,
  Shield,
  Trash2,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import { useToast } from "../components/Toast";

interface PhoneRow {
  id: string;
  number: string;
  country_code?: string | null;
  label: string | null;
  verified: boolean;
  is_primary: boolean;
}
interface EmailRow {
  id: string;
  email: string;
  verified: boolean;
  is_primary: boolean;
}
interface AddressRow {
  id: string;
  label: string | null;
  street: string;
  city: string;
  postal_code: string;
  country: string;
}

export default function MyContactsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const [phones, setPhones] = useState<PhoneRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [phonesRes, emailsRes, addrRes] = await Promise.all([
        api.get("/api/v1/phones").catch(() => ({ data: [] })),
        api.get("/api/v1/contact-emails").catch(() => ({ data: [] })),
        api.get("/api/v1/addresses").catch(() => ({ data: [] })),
      ]);
      setPhones(Array.isArray(phonesRes.data) ? phonesRes.data : phonesRes.data?.items ?? []);
      setEmails(Array.isArray(emailsRes.data) ? emailsRes.data : emailsRes.data?.items ?? []);
      setAddresses(Array.isArray(addrRes.data) ? addrRes.data : addrRes.data?.items ?? []);
    } catch {
      /* partial load ok */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(kind: "phone" | "address", id: string) {
    Alert.alert(
      t("contacts.deleteTitle", "Supprimer"),
      kind === "phone"
        ? t("contacts.deletePhone", "Supprimer ce numéro ?")
        : t("contacts.deleteAddress", "Supprimer cette adresse ?"),
      [
        { text: t("common.cancel", "Annuler"), style: "cancel" },
        {
          text: t("common.delete", "Supprimer"),
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/api/v1/${kind === "phone" ? "phones" : "addresses"}/${id}`);
              load();
              toast.show(
                kind === "phone"
                  ? t("contacts.phoneDeleted", "Numéro supprimé")
                  : t("contacts.addressDeleted", "Adresse supprimée"),
                "success"
              );
            } catch {
              toast.show(t("common.error", "Erreur"), "error");
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center">
        <Spinner color="$primary600" />
      </Box>
    );
  }

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
        {/* Verifications shortcut */}
        <Pressable
          onPress={() => navigation.navigate("VerificationsHub")}
          bg="$primary50"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$primary200"
          p="$4"
          $active-bg="$primary100"
        >
          <HStack space="md" alignItems="center">
            <Box bg="$primary100" borderRadius="$lg" p="$2.5">
              <Icon as={Shield} size="md" color="$primary700" />
            </Box>
            <VStack flex={1}>
              <Text size="md" fontWeight="$semibold" color="$primary900">
                {t("contacts.verify", "Vérifier mes coordonnées")}
              </Text>
              <Text size="xs" color="$primary800" opacity={0.85}>
                {t("contacts.verifyDesc", "Téléphones, emails, GPS, pièce d'identité")}
              </Text>
            </VStack>
          </HStack>
        </Pressable>

        {/* Phones */}
        <SectionCard
          icon={Phone}
          title={t("contacts.phones", "Téléphones")}
          count={phones.length}
        >
          {phones.length === 0 ? (
            <EmptyText t={t} key_="contacts.noPhones" fb="Aucun numéro." />
          ) : (
            phones.map((p, idx) => (
              <Row
                key={p.id}
                idx={idx}
                left={<Icon as={Phone} size="sm" color={p.verified ? "$success600" : "$textLight400"} />}
                primary={`${p.country_code ?? ""}${p.number}`}
                secondary={p.label ?? undefined}
                trailing={
                  <HStack space="xs" alignItems="center">
                    {p.verified ? (
                      <Badge action="success" variant="solid" size="sm">
                        <Icon as={BadgeCheck} size="2xs" color="$white" mr="$1" />
                        <BadgeText>{t("contacts.verified", "Vérifié")}</BadgeText>
                      </Badge>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        action="primary"
                        onPress={() => navigation.navigate("PhoneVerification")}
                      >
                        <ButtonText>{t("contacts.verifyAction", "Vérifier")}</ButtonText>
                      </Button>
                    )}
                    <Pressable onPress={() => handleDelete("phone", p.id)} p="$1.5">
                      <Icon as={Trash2} size="xs" color="$error500" />
                    </Pressable>
                  </HStack>
                }
              />
            ))
          )}
        </SectionCard>

        {/* Emails */}
        <SectionCard
          icon={Mail}
          title={t("contacts.emails", "Emails")}
          count={emails.length}
        >
          {emails.length === 0 ? (
            <EmptyText t={t} key_="contacts.noEmails" fb="Aucun email." />
          ) : (
            emails.map((e, idx) => (
              <Row
                key={e.id}
                idx={idx}
                left={<Icon as={Mail} size="sm" color={e.verified ? "$success600" : "$textLight400"} />}
                primary={e.email}
                secondary={e.is_primary ? t("contacts.primary", "Principal") : undefined}
                trailing={
                  e.verified ? (
                    <Badge action="success" variant="solid" size="sm">
                      <Icon as={BadgeCheck} size="2xs" color="$white" mr="$1" />
                      <BadgeText>{t("contacts.verified", "Vérifié")}</BadgeText>
                    </Badge>
                  ) : (
                    <Button
                      size="xs"
                      variant="outline"
                      action="primary"
                      onPress={() => navigation.navigate("EmailVerification")}
                    >
                      <ButtonText>{t("contacts.verifyAction", "Vérifier")}</ButtonText>
                    </Button>
                  )
                }
              />
            ))
          )}
        </SectionCard>

        {/* Addresses */}
        <SectionCard
          icon={MapPin}
          title={t("contacts.addresses", "Adresses")}
          count={addresses.length}
        >
          {addresses.length === 0 ? (
            <EmptyText t={t} key_="contacts.noAddresses" fb="Aucune adresse." />
          ) : (
            addresses.map((a, idx) => (
              <Row
                key={a.id}
                idx={idx}
                left={<Icon as={MapPin} size="sm" color="$textLight500" />}
                primary={a.street}
                secondary={`${a.postal_code} ${a.city}${a.country ? ", " + a.country : ""}`}
                superscript={a.label ?? undefined}
                trailing={
                  <Pressable onPress={() => handleDelete("address", a.id)} p="$1.5">
                    <Icon as={Trash2} size="xs" color="$error500" />
                  </Pressable>
                }
              />
            ))
          )}
        </SectionCard>
      </ScrollView>
    </Box>
  );
}

function SectionCard({
  icon,
  title,
  count,
  children,
}: {
  icon: any;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
      <HStack space="sm" alignItems="center" mb="$3">
        <Icon as={icon} size="sm" color="$textLight600" />
        <Heading
          size="xs"
          color="$textLight500"
          textTransform="uppercase"
          letterSpacing={0.5}
        >
          {title} ({count})
        </Heading>
      </HStack>
      <VStack>{children}</VStack>
    </Box>
  );
}

function Row({
  idx,
  left,
  primary,
  secondary,
  superscript,
  trailing,
}: {
  idx: number;
  left: React.ReactNode;
  primary: string;
  secondary?: string;
  superscript?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <HStack
      space="sm"
      alignItems="center"
      py="$2.5"
      borderTopWidth={idx === 0 ? 0 : 1}
      borderColor="$borderLight100"
    >
      <Box w={32} alignItems="center">
        {left}
      </Box>
      <VStack flex={1}>
        {superscript && (
          <Text size="2xs" color="$textLight500">
            {superscript}
          </Text>
        )}
        <Text size="sm" fontWeight="$medium" color="$textLight900">
          {primary}
        </Text>
        {secondary && (
          <Text size="xs" color="$textLight500">
            {secondary}
          </Text>
        )}
      </VStack>
      {trailing}
    </HStack>
  );
}

function EmptyText({ t, key_, fb }: { t: any; key_: string; fb: string }) {
  return (
    <Text size="sm" color="$textLight500" italic textAlign="center" py="$3">
      {t(key_, fb)}
    </Text>
  );
}
