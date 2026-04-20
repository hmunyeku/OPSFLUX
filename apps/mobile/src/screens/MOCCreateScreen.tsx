/**
 * MOCCreateScreen — minimal create form for a new MOC from mobile.
 *
 * Field workers often initiate a MOC from site. Phase 2 ships the
 * minimum required to pass the backend gate: site + platform (free
 * text, fallback when the asset registry isn't reachable), a title +
 * objectives, a type (permanent/temporaire), a nature
 * (OPTIMISATION/SECURITE), and the initiator signature.
 *
 * Anything richer (attachments, validation matrix, métiers multi-select,
 * installation picker from the asset registry) comes in phase 3 — this
 * screen stays deliberately short so thumb-reachable on a phone.
 */

import React, { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Heading,
  HStack,
  Input,
  InputField,
  Pressable,
  Text,
  Textarea,
  TextareaInput,
  VStack,
} from "@gluestack-ui/themed";
import { useTranslation } from "react-i18next";
import { createMOC, type CreateMOCPayload } from "../services/moc";
import SignaturePad from "../components/SignaturePad";
import { useToast } from "../components/Toast";

interface Props {
  navigation: any;
}

const NATURES: Array<"OPTIMISATION" | "SECURITE"> = [
  "OPTIMISATION",
  "SECURITE",
];
const MOD_TYPES: Array<"permanent" | "temporary"> = [
  "permanent",
  "temporary",
];
const MOD_TYPE_LABEL: Record<string, string> = {
  permanent: "Permanent",
  temporary: "Temporaire",
};

export default function MOCCreateScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toastShow = useToast((s) => s.show);

  const [title, setTitle] = useState("");
  const [site, setSite] = useState("");
  const [platform, setPlatform] = useState("");
  const [objectives, setObjectives] = useState("");
  const [description, setDescription] = useState("");
  const [situation, setSituation] = useState("");
  const [proposed, setProposed] = useState("");
  const [impact, setImpact] = useState("");
  const [nature, setNature] = useState<"OPTIMISATION" | "SECURITE" | null>(null);
  const [modType, setModType] =
    useState<"permanent" | "temporary" | null>("permanent");
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit =
    !!site.trim() &&
    !!platform.trim() &&
    !!objectives.trim() &&
    !saving;

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload: CreateMOCPayload = {
        title: title.trim() || null,
        site_label: site.trim(),
        platform_code: platform.trim().toUpperCase(),
        objectives: objectives.trim(),
        description: description.trim() || null,
        current_situation: situation.trim() || null,
        proposed_changes: proposed.trim() || null,
        impact_analysis: impact.trim() || null,
        modification_type: modType,
        nature,
        initiator_signature: signature,
      };
      const moc = await createMOC(payload);
      toastShow(`MOC ${moc.reference} créé`, "success");
      navigation.replace("MOCDetail", { mocId: moc.id });
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (err as any)?.response?.data?.detail;
      const msg =
        typeof d === "string"
          ? d
          : d?.message ?? "Impossible de créer le MOC.";
      Alert.alert("Erreur", msg);
    } finally {
      setSaving(false);
    }
  }, [
    canSubmit,
    title,
    site,
    platform,
    objectives,
    description,
    situation,
    proposed,
    impact,
    modType,
    nature,
    signature,
    toastShow,
    navigation,
  ]);

  const chip = (
    label: string,
    active: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      onPress={onPress}
      bg={active ? "$primary600" : "$white"}
      borderWidth={1}
      borderColor={active ? "$primary600" : "$borderLight200"}
      px="$3"
      py="$1.5"
      borderRadius="$full"
    >
      <Text
        size="sm"
        fontWeight="$semibold"
        color={active ? "$white" : "$textLight700"}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={{ backgroundColor: "#f8fafc", flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 14,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Heading size="md" mb="$2">
          Nouveau MOC
        </Heading>

        {/* Localisation */}
        <Box
          bg="$white"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$borderLight200"
          p="$3"
          mb="$2"
        >
          <Text size="2xs" color="$textLight500" mb="$0.5">
            SITE *
          </Text>
          <Input borderColor="$borderLight300" bg="$white" mb="$2">
            <InputField
              value={site}
              onChangeText={setSite}
              placeholder="RDR EAST, RDR WEST, SOUTH…"
              autoCapitalize="characters"
            />
          </Input>
          <Text size="2xs" color="$textLight500" mb="$0.5">
            PLATEFORME *
          </Text>
          <Input borderColor="$borderLight300" bg="$white">
            <InputField
              value={platform}
              onChangeText={setPlatform}
              placeholder="BRF1, INF1, DS1…"
              autoCapitalize="characters"
            />
          </Input>
        </Box>

        {/* Titre + objectifs */}
        <Box
          bg="$white"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$borderLight200"
          p="$3"
          mb="$2"
        >
          <Text size="2xs" color="$textLight500" mb="$0.5">
            TITRE DU MOC
          </Text>
          <Input borderColor="$borderLight300" bg="$white" mb="$2">
            <InputField
              value={title}
              onChangeText={setTitle}
              placeholder="Ex. Remplacement du compresseur K-101"
            />
          </Input>
          <Text size="2xs" color="$textLight500" mb="$0.5">
            OBJECTIFS *
          </Text>
          <Textarea>
            <TextareaInput
              value={objectives}
              onChangeText={setObjectives}
              placeholder="Brève description des objectifs de la modification"
              multiline
              numberOfLines={3}
            />
          </Textarea>
        </Box>

        {/* Nature + type modification */}
        <Box
          bg="$white"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$borderLight200"
          p="$3"
          mb="$2"
        >
          <Text size="2xs" color="$textLight500" mb="$1">
            NATURE
          </Text>
          <HStack space="sm" flexWrap="wrap" mb="$2">
            {NATURES.map((n) =>
              chip(n, nature === n, () =>
                setNature(nature === n ? null : n),
              ),
            )}
          </HStack>
          <Text size="2xs" color="$textLight500" mb="$1">
            TYPE DE MODIFICATION
          </Text>
          <HStack space="sm" flexWrap="wrap">
            {MOD_TYPES.map((mt) =>
              chip(MOD_TYPE_LABEL[mt], modType === mt, () =>
                setModType(modType === mt ? null : mt),
              ),
            )}
          </HStack>
        </Box>

        {/* Contenu long */}
        <Box
          bg="$white"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$borderLight200"
          p="$3"
          mb="$2"
        >
          <Text size="2xs" color="$textLight500" mb="$0.5">
            DESCRIPTION
          </Text>
          <Textarea mb="$2">
            <TextareaInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
            />
          </Textarea>
          <Text size="2xs" color="$textLight500" mb="$0.5">
            SITUATION ACTUELLE
          </Text>
          <Textarea mb="$2">
            <TextareaInput
              value={situation}
              onChangeText={setSituation}
              multiline
              numberOfLines={3}
            />
          </Textarea>
          <Text size="2xs" color="$textLight500" mb="$0.5">
            MODIFICATIONS PROPOSÉES
          </Text>
          <Textarea mb="$2">
            <TextareaInput
              value={proposed}
              onChangeText={setProposed}
              multiline
              numberOfLines={3}
            />
          </Textarea>
          <Text size="2xs" color="$textLight500" mb="$0.5">
            ANALYSE D'IMPACT
          </Text>
          <Textarea>
            <TextareaInput
              value={impact}
              onChangeText={setImpact}
              multiline
              numberOfLines={3}
            />
          </Textarea>
        </Box>

        {/* Signature demandeur */}
        <Box
          bg="$white"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$borderLight200"
          p="$3"
          mb="$2"
        >
          <Text size="2xs" color="$textLight500" mb="$1">
            SIGNATURE DEMANDEUR
          </Text>
          <SignaturePad
            value={signature}
            onChange={setSignature}
            width={300}
            height={130}
            disabled={saving}
          />
        </Box>

        {/* Submit */}
        <VStack space="sm" mt="$2">
          <Button
            action="primary"
            isDisabled={!canSubmit}
            onPress={submit}
          >
            {saving ? <ButtonSpinner mr="$2" /> : null}
            <ButtonText>
              {saving ? "Création…" : "Créer le MOC"}
            </ButtonText>
          </Button>
          <Button
            action="secondary"
            variant="outline"
            onPress={() => navigation.goBack()}
          >
            <ButtonText>{t("common.cancel", "Annuler")}</ButtonText>
          </Button>
        </VStack>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
