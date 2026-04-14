/**
 * MyComplianceScreen — Gluestack refonte: personal credentials & compliance.
 *
 * Hero stats card with progress bar + stats grid.
 * Alerts for expired/expiring documents.
 * Sorted credential list (expired → expiring → pending → valid).
 */

import React, { useCallback, useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Box,
  Heading,
  HStack,
    Progress,
  ProgressFilledTrack,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon } from "../components/MIcon";
import { useTranslation } from "react-i18next";
import StatusBadge from "../components/StatusBadge";
import { api } from "../services/api";
import { useAuthStore } from "../stores/auth";

interface Credential {
  id: string;
  credential_type_name: string;
  credential_type_category: string;
  status: "valid" | "expired" | "pending" | "pending_validation" | "rejected";
  obtained_date: string | null;
  expiry_date: string | null;
  document_reference: string | null;
  days_until_expiry: number | null;
}

interface ComplianceStats {
  total: number;
  valid: number;
  expired: number;
  pending: number;
  expiring_soon: number;
}

const CATEGORY_ICONS: Record<string, MIconName> = {
  safety: Shield,
  medical: HeartPulse,
  technical: Wrench,
  administrative: FileText,
  training: GraduationCap,
};

export default function MyComplianceScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.userId);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await api.get(`/api/v1/pax/profiles/${userId}/credentials`);
      const items = Array.isArray(data) ? data : data?.items ?? [];
      const enriched = items.map((c: any) => ({
        ...c,
        days_until_expiry: c.expiry_date
          ? Math.ceil((new Date(c.expiry_date).getTime() - Date.now()) / 86_400_000)
          : null,
      }));
      setCredentials(enriched);
    } catch {
      /* may not have permissions */
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center">
        <Spinner color="$primary600" />
      </Box>
    );
  }

  const stats: ComplianceStats = {
    total: credentials.length,
    valid: credentials.filter((c) => c.status === "valid").length,
    expired: credentials.filter((c) => c.status === "expired").length,
    pending: credentials.filter((c) => c.status === "pending" || c.status === "pending_validation").length,
    expiring_soon: credentials.filter(
      (c) => c.days_until_expiry !== null && c.days_until_expiry > 0 && c.days_until_expiry <= 30
    ).length,
  };

  const complianceRate = stats.total > 0 ? (stats.valid / stats.total) * 100 : 0;
  const overallStatus =
    stats.expired > 0 ? "danger" : stats.expiring_soon > 0 ? "warning" : "ok";

  const sorted = [...credentials].sort((a, b) => {
    const order: Record<string, number> = {
      expired: 0,
      pending: 1,
      pending_validation: 1,
      rejected: 2,
      valid: 3,
    };
    const oa = order[a.status] ?? 4;
    const ob = order[b.status] ?? 4;
    if (oa !== ob) return oa - ob;
    if (a.days_until_expiry !== null && b.days_until_expiry !== null) {
      return a.days_until_expiry - b.days_until_expiry;
    }
    return 0;
  });

  const statusColor =
    overallStatus === "ok" ? "$success600" : overallStatus === "warning" ? "$warning600" : "$error600";
  const statusBg =
    overallStatus === "ok" ? "$success50" : overallStatus === "warning" ? "$warning50" : "$error50";

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
        {/* Hero status card */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <HStack justifyContent="space-between" alignItems="center" mb="$3">
            <Heading size="lg" color="$textLight900">
              {t("compliance.myCompliance", "Ma conformité")}
            </Heading>
            <Box bg={statusBg} px="$3" py="$1" borderRadius="$full">
              <Text size="xs" fontWeight="$bold" color={statusColor}>
                {overallStatus === "ok"
                  ? t("compliance.statusOk", "Conforme")
                  : overallStatus === "warning"
                  ? t("compliance.statusWarning", "Attention")
                  : t("compliance.statusDanger", "Non conforme")}
              </Text>
            </Box>
          </HStack>

          <Progress value={complianceRate} h={8} mb="$4">
            <ProgressFilledTrack bg={statusColor} />
          </Progress>

          <HStack justifyContent="space-around">
            <StatBox label={t("compliance.valid", "Valides")} value={stats.valid} color="$success600" />
            <StatBox
              label={t("compliance.expiring", "Expirants")}
              value={stats.expiring_soon}
              color="$warning600"
            />
            <StatBox
              label={t("compliance.expired", "Expirés")}
              value={stats.expired}
              color="$error600"
            />
            <StatBox
              label={t("compliance.pending", "En attente")}
              value={stats.pending}
              color="$info600"
            />
          </HStack>
        </Box>

        {/* Alerts */}
        {stats.expired > 0 && (
          <Box
            bg="$error50"
            borderRadius="$lg"
            borderLeftWidth={4}
            borderLeftColor="$error500"
            p="$3.5"
          >
            <HStack space="sm" alignItems="center">
              <MIcon name="warning" size="sm" color="$error600" />
              <Text size="sm" color="$error700" fontWeight="$semibold" flex={1}>
                {t(
                  "compliance.expiredAlert",
                  "{{count}} document(s) expiré(s) — veuillez les renouveler rapidement.",
                  { count: stats.expired }
                )}
              </Text>
            </HStack>
          </Box>
        )}
        {stats.expiring_soon > 0 && stats.expired === 0 && (
          <Box
            bg="$warning50"
            borderRadius="$lg"
            borderLeftWidth={4}
            borderLeftColor="$warning500"
            p="$3.5"
          >
            <HStack space="sm" alignItems="center">
              <MIcon name="warning" size="sm" color="$warning600" />
              <Text size="sm" color="$warning700" fontWeight="$semibold" flex={1}>
                {t(
                  "compliance.expiringAlert",
                  "{{count}} document(s) expire(nt) dans les 30 prochains jours.",
                  { count: stats.expiring_soon }
                )}
              </Text>
            </HStack>
          </Box>
        )}

        {/* Credential list */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5} mb="$3">
            {t("compliance.myDocuments", "Mes documents")} ({credentials.length})
          </Heading>

          {sorted.map((cred, idx) => {
            const CredIcon = CATEGORY_ICONS[cred.credential_type_category] ?? FileText;
            const iconColor =
              cred.status === "valid"
                ? "$success600"
                : cred.status === "expired"
                ? "$error600"
                : "$warning600";
            const expiryText = (() => {
              if (!cred.expiry_date || cred.days_until_expiry === null) return null;
              if (cred.days_until_expiry <= 0) {
                return {
                  text: t("compliance.expiredFor", "Expiré depuis {{days}}j", {
                    days: Math.abs(cred.days_until_expiry),
                  }),
                  color: "$error600",
                };
              }
              if (cred.days_until_expiry <= 30) {
                return {
                  text: t("compliance.expiresIn", "Expire dans {{days}}j", {
                    days: cred.days_until_expiry,
                  }),
                  color: "$warning600",
                };
              }
              return {
                text: t("compliance.expiresOn", "Expire le {{date}}", {
                  date: new Date(cred.expiry_date).toLocaleDateString("fr-FR"),
                }),
                color: "$textLight500",
              };
            })();

            return (
              <HStack
                key={cred.id}
                space="sm"
                alignItems="center"
                py="$3"
                borderTopWidth={idx === 0 ? 0 : 1}
                borderColor="$borderLight100"
              >
                <Box bg="$backgroundLight100" borderRadius="$md" p="$2">
                  <MIcon name={CredIcon} size="sm" color={iconColor} />
                </Box>
                <VStack flex={1}>
                  <Text size="sm" fontWeight="$semibold" color="$textLight900">
                    {cred.credential_type_name}
                  </Text>
                  {expiryText && (
                    <Text size="xs" color={expiryText.color}>
                      {expiryText.text}
                    </Text>
                  )}
                  {cred.document_reference && (
                    <Text size="2xs" color="$textLight400" fontFamily="$mono">
                      {t("compliance.ref", "Réf:")} {cred.document_reference}
                    </Text>
                  )}
                </VStack>
                <StatusBadge status={cred.status} />
              </HStack>
            );
          })}

          {credentials.length === 0 && (
            <Text size="sm" color="$textLight500" italic textAlign="center" py="$4">
              {t("compliance.empty", "Aucun document enregistré.")}
            </Text>
          )}
        </Box>
      </ScrollView>
    </Box>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <VStack alignItems="center">
      <Heading size="xl" color={color}>
        {value}
      </Heading>
      <Text size="xs" color="$textLight500">
        {label}
      </Text>
    </VStack>
  );
}
