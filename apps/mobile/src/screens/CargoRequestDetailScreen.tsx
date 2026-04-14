/**
 * CargoRequestDetailScreen — résultat du scan d'une Lettre de Transport.
 *
 * Le QR d'une LT encode l'UUID (ou le code CGR-...) de la demande
 * d'expédition. L'écran fetche la demande + la liste des colis
 * associés. Chaque colis est tapable pour ouvrir l'assistant scan
 * (avec GPS + statut).
 */

import React, { useCallback, useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Badge,
  BadgeText,
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
import { useTranslation } from "react-i18next";
import { MIcon } from "../components/MIcon";
import { api } from "../services/api";
import { downloadAndOpenPdf } from "../services/pdf";

interface Props {
  navigation: any;
  route: {
    params: {
      requestId?: string;
      requestCode?: string;
    };
  };
}

interface CargoRequest {
  id: string;
  request_code: string;
  description?: string | null;
  status?: string;
  workflow_status?: string;
  total_cargo_items?: number;
  sender_tier_name?: string | null;
  destination_asset_name?: string | null;
  created_at?: string;
  project_name?: string | null;
}

interface CargoItem {
  id: string;
  tracking_code: string;
  description: string;
  cargo_type?: string;
  status: string;
  weight_kg?: number;
  hazmat_validated?: boolean;
}

export default function CargoRequestDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { requestId, requestCode } = route.params;

  const [request, setRequest] = useState<CargoRequest | null>(null);
  const [cargoItems, setCargoItems] = useState<CargoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Resolve the request by id first; if only a code is provided,
      // we'd need a resolve endpoint (not built yet — unlikely since
      // the LT QR always encodes the UUID).
      const idToUse = requestId;
      if (!idToUse) {
        setRequest(null);
        setLoading(false);
        return;
      }
      const { data: req } = await api.get<CargoRequest>(
        `/api/v1/packlog/cargo-requests/${idToUse}`
      );
      setRequest(req);
      // List cargo items for this request.
      const { data: items } = await api.get<any>(
        "/api/v1/packlog/cargo",
        { params: { request_id: idToUse, page_size: 100 } }
      );
      const list: CargoItem[] = Array.isArray(items)
        ? items
        : items.items ?? items.results ?? [];
      setCargoItems(list);
    } catch {
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Box flex={1} alignItems="center" justifyContent="center" bg="$backgroundLight50">
        <Spinner size="large" color="$primary600" />
      </Box>
    );
  }

  if (!request) {
    return (
      <Box flex={1} alignItems="center" justifyContent="center" bg="$backgroundLight50" px="$6">
        <MIcon name="error-outline" size="2xl" color="$error500" />
        <Heading size="sm" color="$textLight900" mt="$3" textAlign="center">
          {t("cargoRequest.notFound", "Demande d'expédition introuvable")}
        </Heading>
        <Text size="sm" color="$textLight500" mt="$2" textAlign="center">
          {requestCode ?? requestId}
        </Text>
        <Button action="primary" mt="$5" onPress={() => navigation.goBack()}>
          <ButtonText>{t("common.back", "Retour")}</ButtonText>
        </Button>
      </Box>
    );
  }

  return (
    <Box flex={1} bg="$backgroundLight50">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 14,
          paddingBottom: insets.bottom + 24,
          gap: 12,
        }}
      >
        {/* Header card */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <HStack space="sm" alignItems="center" mb="$2">
            <Box bg="$primary50" borderRadius="$md" p="$2">
              <MIcon name="description" size="md" color="$primary700" />
            </Box>
            <VStack flex={1}>
              <Text size="2xs" color="$textLight500" textTransform="uppercase">
                {t("cargoRequest.title", "Lettre de Transport")}
              </Text>
              <Heading size="sm" color="$textLight900" numberOfLines={1}>
                {request.request_code}
              </Heading>
            </VStack>
          </HStack>
          {request.description && (
            <Text size="sm" color="$textLight700" mb="$2">
              {request.description}
            </Text>
          )}
          <HStack space="md" flexWrap="wrap">
            {request.workflow_status && (
              <Badge action="muted" variant="outline" size="sm">
                <BadgeText>{request.workflow_status}</BadgeText>
              </Badge>
            )}
            {request.sender_tier_name && (
              <Text size="xs" color="$textLight500">
                {t("cargoRequest.sender", "Expéditeur :")} {request.sender_tier_name}
              </Text>
            )}
            {request.destination_asset_name && (
              <Text size="xs" color="$textLight500">
                {t("cargoRequest.destination", "Destination :")}{" "}
                {request.destination_asset_name}
              </Text>
            )}
          </HStack>
        </Box>

        {/* Cargo items card */}
        <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
          <HStack space="sm" alignItems="center" mb="$3">
            <MIcon name="inventory-2" size="sm" color="$textLight600" />
            <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5}>
              {t("cargoRequest.items", "Colis")} ({cargoItems.length})
            </Heading>
          </HStack>
          {cargoItems.length === 0 ? (
            <Text size="sm" color="$textLight500" italic textAlign="center" py="$3">
              {t("cargoRequest.noItems", "Aucun colis associé.")}
            </Text>
          ) : (
            <VStack>
              {cargoItems.map((item, idx) => (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    navigation.navigate("CargoScanAssistant", {
                      cargoId: item.id,
                      trackingCode: item.tracking_code,
                    })
                  }
                  py="$2.5"
                  borderTopWidth={idx === 0 ? 0 : 1}
                  borderColor="$borderLight100"
                  $active-bg="$backgroundLight50"
                >
                  <HStack space="sm" alignItems="center">
                    <Box bg="$primary50" borderRadius="$md" p="$2">
                      <MIcon name="qr-code" size="sm" color="$primary700" />
                    </Box>
                    <VStack flex={1}>
                      <Text size="sm" fontWeight="$semibold" color="$textLight900">
                        {item.tracking_code}
                      </Text>
                      <Text size="xs" color="$textLight500" numberOfLines={1}>
                        {item.description}
                      </Text>
                    </VStack>
                    {item.hazmat_validated && (
                      <Badge action="error" variant="solid" size="sm">
                        <BadgeText>HAZMAT</BadgeText>
                      </Badge>
                    )}
                    <MIcon name="chevron-right" size="sm" color="$textLight400" />
                  </HStack>
                </Pressable>
              ))}
            </VStack>
          )}
        </Box>

        {/* Download LT PDF */}
        <Button
          size="lg"
          variant="outline"
          action="secondary"
          isDisabled={pdfDownloading}
          onPress={async () => {
            setPdfDownloading(true);
            await downloadAndOpenPdf(
              `/api/v1/travelwiz/cargo-requests/${request.id}/pdf/lt`,
              `LT_${request.request_code}`
            );
            setPdfDownloading(false);
          }}
        >
          {pdfDownloading ? (
            <Spinner size="small" color="$primary600" mr="$2" />
          ) : (
            <MIcon name="picture-as-pdf" size="sm" color="$primary700" mr="$2" />
          )}
          <ButtonText>
            {t("cargoRequest.downloadLt", "Télécharger la lettre de transport")}
          </ButtonText>
        </Button>
      </ScrollView>
    </Box>
  );
}
