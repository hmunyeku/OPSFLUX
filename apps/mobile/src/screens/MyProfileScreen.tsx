/**
 * MyProfileScreen — read-only view of the current user's contact info
 * with quick links to the verifications hub.
 *
 * Sections:
 *  - Identity (avatar, name, job, business unit)
 *  - Emails (list with verified badges)
 *  - Phones (list with verified badges)
 *  - Addresses (list of postal addresses)
 *  - Verifications (link to hub, summary of statuses)
 *  - Edit profile (link to web app — most edits live there)
 */
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Avatar,
  AvatarFallbackText,
  AvatarImage,
  Box,
  Button,
  ButtonText,
  Divider,
  Heading,
  HStack,

  Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import { useAuthStore } from "../stores/auth";
import { listMyVerifications, type UserVerification } from "../services/verifications";

interface MeProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  avatar_url: string | null;
  language: string;
  job_position_name: string | null;
  business_unit_name: string | null;
}

interface EmailRow {
  id: string;
  email: string;
  is_primary: boolean;
  verified: boolean;
}

interface PhoneRow {
  id: string;
  label: string;
  number: string;
  country_code: string | null;
  verified: boolean;
}

interface AddressRow {
  id: string;
  label: string | null;
  line1: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
}

interface Props {
  navigation: any;
}

export default function MyProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.userId);

  const [me, setMe] = useState<MeProfile | null>(null);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [phones, setPhones] = useState<PhoneRow[]>([]);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [verifications, setVerifications] = useState<UserVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [meRes, emailsRes, phonesRes, addressesRes, verifs] = await Promise.allSettled([
        api.get<MeProfile>("/api/v1/auth/me"),
        // Real endpoint is /api/v1/emails (server filters by auth context)
        api.get<EmailRow[]>(`/api/v1/emails`),
        api.get<PhoneRow[]>("/api/v1/phones", {
          params: { owner_type: "user", owner_id: userId },
        }),
        api.get<AddressRow[]>("/api/v1/addresses", {
          params: { owner_type: "user", owner_id: userId },
        }),
        listMyVerifications(),
      ]);
      if (meRes.status === "fulfilled") setMe(meRes.value.data);
      if (emailsRes.status === "fulfilled") setEmails(emailsRes.value.data);
      if (phonesRes.status === "fulfilled") setPhones(phonesRes.value.data);
      if (addressesRes.status === "fulfilled") setAddresses(addressesRes.value.data);
      if (verifs.status === "fulfilled") setVerifications(verifs.value);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const initials =
    me ? `${me.first_name?.[0] ?? ""}${me.last_name?.[0] ?? ""}`.toUpperCase() || "?" : "?";
  const verifiedCount = verifications.filter((v) => v.status === "verified").length;

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
        {loading && !me ? (
          <Box py="$10" alignItems="center">
            <Spinner color="$primary600" />
          </Box>
        ) : (
          <VStack space="md">
            {/* Identity card */}
            <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
              <HStack space="md" alignItems="center" mb="$3">
                <Avatar size="lg" bgColor="$primary600">
                  <AvatarFallbackText>{initials}</AvatarFallbackText>
                  {me?.avatar_url && <AvatarImage source={{ uri: me.avatar_url }} alt="" />}
                </Avatar>
                <VStack flex={1}>
                  <Heading size="md" color="$textLight900">
                    {me ? `${me.first_name} ${me.last_name}` : "—"}
                  </Heading>
                  <Text size="sm" color="$textLight600">
                    {me?.email}
                  </Text>
                </VStack>
              </HStack>

              {(me?.job_position_name || me?.business_unit_name) && (
                <>
                  <Divider my="$2" />
                  <VStack space="xs">
                    {me?.job_position_name && (
                      <DetailRow icon="work" label={t("profile.position", "Poste")} value={me.job_position_name} />
                    )}
                    {me?.business_unit_name && (
                      <DetailRow
                        icon="apartment"
                        label={t("profile.businessUnit", "Business unit")}
                        value={me.business_unit_name}
                      />
                    )}
                  </VStack>
                </>
              )}
            </Box>

            {/* Verifications quick link */}
            <Pressable
              onPress={() => navigation.navigate("VerificationsHub")}
              bg="$white"
              borderRadius="$lg"
              borderWidth={1}
              borderColor="$borderLight200"
              p="$4"
              $active-bg="$backgroundLight100"
            >
              <HStack space="md" alignItems="center">
                <Box bg="$success50" borderRadius="$lg" p="$2.5">
                  <MIcon name="shield" size="md" color="$success700" />
                </Box>
                <VStack flex={1}>
                  <Text size="md" fontWeight="$semibold" color="$textLight900">
                    {t("profile.verifications", "Mes vérifications")}
                  </Text>
                  <Text size="xs" color="$textLight500">
                    {verifiedCount > 0
                      ? t("profile.verifiedCount", "{{count}} élément(s) vérifié(s)", {
                          count: verifiedCount,
                        })
                      : t("profile.noneVerified", "Aucun élément vérifié")}
                  </Text>
                </VStack>
                <MIcon name="chevron-right" size="md" color="$textLight400" />
              </HStack>
            </Pressable>

            {/* Emails */}
            <SectionCard
              title={t("profile.emails", "Adresses email")}
              icon="email"
              empty={emails.length === 0}
              emptyText={t("profile.emails.empty", "Aucune adresse enregistrée.")}
            >
              {emails.map((e) => (
                <ContactRow
                  key={e.id}
                  primary={e.email}
                  secondary={e.is_primary ? t("profile.primary", "Principal") : undefined}
                  verified={e.verified}
                />
              ))}
            </SectionCard>

            {/* Phones */}
            <SectionCard
              title={t("profile.phones", "Téléphones")}
              icon="phone"
              empty={phones.length === 0}
              emptyText={t("profile.phones.empty", "Aucun numéro enregistré.")}
            >
              {phones.map((p) => (
                <ContactRow
                  key={p.id}
                  primary={`${p.country_code ?? ""}${p.number}`}
                  secondary={p.label}
                  verified={p.verified}
                />
              ))}
            </SectionCard>

            {/* Addresses */}
            <SectionCard
              title={t("profile.addresses", "Adresses postales")}
              icon="place"
              empty={addresses.length === 0}
              emptyText={t("profile.addresses.empty", "Aucune adresse enregistrée.")}
            >
              {addresses.map((a) => (
                <Box key={a.id} py="$2.5" borderBottomWidth={1} borderColor="$borderLight100">
                  <Text size="sm" fontWeight="$medium" color="$textLight900">
                    {a.label || t("profile.addresses.other", "Adresse")}
                  </Text>
                  {a.line1 && (
                    <Text size="sm" color="$textLight600">
                      {a.line1}
                    </Text>
                  )}
                  {(a.postal_code || a.city) && (
                    <Text size="sm" color="$textLight600">
                      {[a.postal_code, a.city].filter(Boolean).join(" ")}
                    </Text>
                  )}
                  {a.country && (
                    <Text size="xs" color="$textLight500" mt="$0.5">
                      {a.country}
                    </Text>
                  )}
                </Box>
              ))}
            </SectionCard>

            {/* CTA: edit on web */}
            <Box bg="$primary50" borderRadius="$lg" borderWidth={1} borderColor="$primary200" p="$4">
              <HStack space="md" alignItems="flex-start">
                <MIcon name="manage-accounts" size="md" color="$primary700" mt="$0.5" />
                <VStack flex={1}>
                  <Text size="sm" fontWeight="$semibold" color="$primary900">
                    {t("profile.editOnWeb", "Modifier mon profil")}
                  </Text>
                  <Text size="xs" color="$primary800" opacity={0.85} mb="$2">
                    {t(
                      "profile.editOnWebHint",
                      "Pour éditer vos informations, ouvrez app.opsflux.com → Paramètres → Profil."
                    )}
                  </Text>
                </VStack>
              </HStack>
            </Box>
          </VStack>
        )}
      </ScrollView>
    </Box>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <HStack space="sm" alignItems="center">
      <MIcon name={icon} size="xs" color="$textLight500" />
      <Text size="xs" color="$textLight500">
        {label} :
      </Text>
      <Text size="sm" color="$textLight900" fontWeight="$medium">
        {value}
      </Text>
    </HStack>
  );
}

function SectionCard({
  title,
  icon,
  children,
  empty,
  emptyText,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
}) {
  return (
    <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
      <HStack space="sm" alignItems="center" mb="$3">
        <MIcon name={icon} size="sm" color="$textLight600" />
        <Heading size="xs" color="$textLight700" textTransform="uppercase" letterSpacing={0.5}>
          {title}
        </Heading>
      </HStack>
      {empty ? (
        <Text size="sm" color="$textLight500" italic>
          {emptyText}
        </Text>
      ) : (
        <VStack>{children}</VStack>
      )}
    </Box>
  );
}

function ContactRow({
  primary,
  secondary,
  verified,
}: {
  primary: string;
  secondary?: string;
  verified?: boolean;
}) {
  return (
    <HStack space="md" alignItems="center" py="$2.5" borderBottomWidth={1} borderColor="$borderLight100">
      <VStack flex={1}>
        <Text size="sm" fontWeight="$medium" color="$textLight900">
          {primary}
        </Text>
        {secondary && (
          <Text size="xs" color="$textLight500" textTransform="capitalize">
            {secondary}
          </Text>
        )}
      </VStack>
      {verified && <MIcon name="verified" size="sm" color="$success600" />}
    </HStack>
  );
}
