/**
 * AdsDetailScreen — Gluestack refonte: full view of a single Avis de Séjour.
 *
 * Layout:
 *   - Header card: reference + status + visit purpose + category chip + A/R chip
 *   - Site / Period / Requester card (icon + label + value rows)
 *   - Transport card (outbound + return modes + departure base)
 *   - PAX list card (each entry with status badge + non-conformité tag)
 *   - Action buttons (Soumettre / Approuver / Rejeter — based on permissions)
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Divider,
  Heading,
  HStack,
    Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon, type MIconName } from "../components/MIcon";
import { useTranslation } from "react-i18next";
import StatusBadge from "../components/StatusBadge";
import { api } from "../services/api";
import { downloadAndOpenPdf } from "../services/pdf";
import { usePermissions } from "../stores/permissions";
import { useToast } from "../components/Toast";
import type { AdsSummary } from "../types/api";

interface Props {
  route: { params: { adsId: string } };
  navigation: any;
}

interface AdsDetail extends AdsSummary {
  visit_purpose: string;
  visit_category: string;
  site_entry_asset_name: string;
  requester_display_name: string;
  outbound_transport_mode: string | null;
  outbound_departure_base_name: string | null;
  return_transport_mode: string | null;
  return_departure_base_name: string | null;
  is_round_trip_no_overnight: boolean;
  pax_entries: Array<{
    id: string;
    display_name: string;
    status: string;
    compliance_ok: boolean;
    company_name: string | null;
  }>;
}

const TRANSPORT_LABELS: Record<string, { key: string; fb: string }> = {
  helicopter: { key: "ads.transport.helicopter", fb: "Hélicoptère" },
  boat: { key: "ads.transport.boat", fb: "Bateau" },
  road: { key: "ads.transport.road", fb: "Route" },
  other: { key: "ads.transport.other", fb: "Autre" },
};

const CATEGORY_LABELS: Record<string, { key: string; fb: string }> = {
  project_work: { key: "ads.category.projectWork", fb: "Travaux projet" },
  maintenance: { key: "ads.category.maintenance", fb: "Maintenance" },
  inspection: { key: "ads.category.inspection", fb: "Inspection" },
  visit: { key: "ads.category.visit", fb: "Visite" },
  permanent_ops: { key: "ads.category.permanentOps", fb: "Opérations permanentes" },
  other: { key: "ads.category.other", fb: "Autre" },
};

export default function AdsDetailScreen({ route }: Props) {
  const { adsId } = route.params;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [ads, setAds] = useState<AdsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const canApprove = usePermissions((s) => s.has("paxlog.ads.approve"));
  const canSubmit = usePermissions((s) => s.has("paxlog.ads.submit"));
  const toast = useToast();

  const loadAds = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/v1/pax/ads/${adsId}`);
      setAds(data);
    } catch {
      toast.show(t("ads.loadError", "Impossible de charger l'ADS"), "error");
    } finally {
      setLoading(false);
    }
  }, [adsId, toast, t]);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  function handleAction(action: "submit" | "approve" | "reject") {
    if (!ads) return;
    const confirmMessages: Record<string, string> = {
      submit: t("ads.confirmSubmit", "Soumettre cet ADS pour validation ?"),
      approve: t("ads.confirmApprove", "Approuver cet ADS ?"),
      reject: t("ads.confirmReject", "Rejeter cet ADS ?"),
    };

    Alert.alert(t("common.confirm", "Confirmation"), confirmMessages[action], [
      { text: t("common.cancel", "Annuler"), style: "cancel" },
      {
        text: t("common.confirm", "Confirmer"),
        onPress: async () => {
          setActing(true);
          try {
            const { data } = await api.post(`/api/v1/pax/ads/${adsId}/${action}`);
            setAds(data);
            const successMsg =
              action === "approve"
                ? t("ads.approved", "ADS approuvé")
                : action === "reject"
                ? t("ads.rejected", "ADS rejeté")
                : t("ads.submitted", "ADS soumis");
            toast.show(successMsg, "success");
          } catch (err: any) {
            toast.show(err?.response?.data?.detail || t("common.error", "Erreur"), "error");
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center">
        <Spinner color="$primary600" />
      </Box>
    );
  }

  if (!ads) {
    return (
      <Box flex={1} bg="$backgroundLight50" alignItems="center" justifyContent="center">
        <Text color="$textLight500">{t("ads.notFound", "ADS introuvable")}</Text>
      </Box>
    );
  }

  const cat = CATEGORY_LABELS[ads.visit_category] ?? {
    key: `ads.category.${ads.visit_category}`,
    fb: ads.visit_category,
  };

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
        {/* Header */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <HStack justifyContent="space-between" alignItems="center" mb="$2">
            <Heading size="lg" color="$primary700">
              {ads.reference}
            </Heading>
            <StatusBadge status={ads.status} size="md" />
          </HStack>
          <Text size="md" color="$textLight900" mb="$3" lineHeight={22}>
            {ads.visit_purpose}
          </Text>
          <HStack space="xs" flexWrap="wrap">
            <Badge action="muted" variant="solid" size="sm">
              <BadgeText>{t(cat.key, cat.fb)}</BadgeText>
            </Badge>
            {ads.is_round_trip_no_overnight && (
              <Badge action="info" variant="solid" size="sm">
                <MIcon name="repeat" size="2xs" color="$white" mr="$1" />
                <BadgeText>{t("ads.roundTrip", "A/R sans nuitée")}</BadgeText>
              </Badge>
            )}
          </HStack>
        </Box>

        {/* Site / Period / Requester */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <DetailRow
            icon="place"
            label={t("ads.site", "Site d'accueil")}
            value={ads.site_entry_asset_name}
          />
          <Divider my="$2" />
          <DetailRow
            icon="event"
            label={t("ads.period", "Période")}
            value={`${ads.start_date} → ${ads.end_date}`}
          />
          <Divider my="$2" />
          <DetailRow
            icon="person"
            label={t("ads.requester", "Demandeur")}
            value={ads.requester_display_name}
          />
        </Box>

        {/* Transport */}
        {(ads.outbound_transport_mode || ads.return_transport_mode) && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
            <Heading
              size="xs"
              color="$textLight500"
              textTransform="uppercase"
              letterSpacing={0.5}
              mb="$3"
            >
              {t("ads.transport", "Transport")}
            </Heading>
            {ads.outbound_transport_mode && (
              <DetailRow
                icon="arrow-outward"
                label={t("ads.outbound", "Aller")}
                value={transportLabel(ads.outbound_transport_mode, ads.outbound_departure_base_name, t)}
              />
            )}
            {ads.outbound_transport_mode && ads.return_transport_mode && <Divider my="$2" />}
            {ads.return_transport_mode && (
              <DetailRow
                icon="south-west"
                label={t("ads.return", "Retour")}
                value={transportLabel(ads.return_transport_mode, ads.return_departure_base_name, t)}
              />
            )}
          </Box>
        )}

        {/* PAX list */}
        {ads.pax_entries && ads.pax_entries.length > 0 && (
          <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
            <HStack alignItems="center" space="sm" mb="$3">
              <MIcon name="people" size="sm" color="$textLight600" />
              <Heading
                size="xs"
                color="$textLight500"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                {t("ads.pax", "Personnel")} ({ads.pax_entries.length})
              </Heading>
            </HStack>
            {(ads.pax_entries ?? []).map((pax, idx) => (
              <Box key={pax.id}>
                {idx > 0 && <Divider my="$2" />}
                <HStack alignItems="center" justifyContent="space-between">
                  <VStack flex={1}>
                    <Text size="sm" fontWeight="$medium" color="$textLight900">
                      {pax.display_name}
                    </Text>
                    {pax.company_name && (
                      <Text size="xs" color="$textLight500">
                        {pax.company_name}
                      </Text>
                    )}
                  </VStack>
                  <VStack alignItems="flex-end" space="xs">
                    <StatusBadge status={pax.status} />
                    {!pax.compliance_ok && (
                      <Text size="2xs" color="$error600" fontWeight="$semibold">
                        {t("ads.nonCompliant", "Non conforme")}
                      </Text>
                    )}
                  </VStack>
                </HStack>
              </Box>
            ))}
          </Box>
        )}

        {/* Actions */}
        <VStack space="sm">
          {/* PDF download — available as soon as the ADS exists */}
          <Button
            size="lg"
            variant="outline"
            action="secondary"
            isDisabled={downloadingPdf}
            onPress={async () => {
              setDownloadingPdf(true);
              const result = await downloadAndOpenPdf(
                `/api/v1/pax/ads/${ads.id}/pdf`,
                `ADS_${ads.reference}`
              );
              setDownloadingPdf(false);
              if (!result.ok) {
                toast.show(
                  t("ads.pdfError", "Téléchargement du PDF impossible."),
                  "error"
                );
              }
            }}
          >
            {downloadingPdf ? (
              <ButtonSpinner mr="$2" />
            ) : (
              <MIcon name="picture-as-pdf" size="sm" color="$primary700" mr="$2" />
            )}
            <ButtonText>{t("ads.downloadPdf", "Télécharger le PDF")}</ButtonText>
          </Button>

          {ads.status === "draft" && canSubmit && (
            <Button size="lg" action="primary" onPress={() => handleAction("submit")} isDisabled={acting}>
              {acting && <ButtonSpinner mr="$2" />}
              <ButtonText>{t("ads.submit", "Soumettre")}</ButtonText>
            </Button>
          )}
          {(ads.status === "pending_validation" || ads.status === "pending_compliance") && canApprove && (
            <HStack space="sm">
              <Button
                size="lg"
                action="positive"
                flex={2}
                onPress={() => handleAction("approve")}
                isDisabled={acting}
              >
                {acting && <ButtonSpinner mr="$2" />}
                <ButtonText>{t("ads.approve", "Approuver")}</ButtonText>
              </Button>
              <Button
                size="lg"
                action="negative"
                variant="outline"
                flex={1}
                onPress={() => handleAction("reject")}
                isDisabled={acting}
              >
                <ButtonText>{t("ads.reject", "Rejeter")}</ButtonText>
              </Button>
            </HStack>
          )}
        </VStack>
      </ScrollView>
    </Box>
  );
}

function DetailRow({ icon, label, value }: { icon: MIconName; label: string; value: string }) {
  return (
    <HStack space="sm" alignItems="center">
      <Box bg="$primary50" borderRadius="$md" p="$2">
        <MIcon name={icon} size="sm" color="$primary700" />
      </Box>
      <VStack flex={1}>
        <Text size="xs" color="$textLight500">
          {label}
        </Text>
        <Text size="sm" fontWeight="$medium" color="$textLight900">
          {value}
        </Text>
      </VStack>
    </HStack>
  );
}

function transportLabel(mode: string, base: string | null, t: any): string {
  const tx = TRANSPORT_LABELS[mode];
  const label = tx ? t(tx.key, tx.fb) : mode;
  return base ? `${label} — ${base}` : label;
}
