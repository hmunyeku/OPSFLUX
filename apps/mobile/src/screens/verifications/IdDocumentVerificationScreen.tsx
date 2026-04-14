/**
 * IdDocumentVerificationScreen — multi-step wizard to upload an ID document.
 *
 * Steps:
 *   1. Pick document type (passport / national_id / driver_license)
 *   2. Take photo of FRONT
 *   3. (If national_id or driver_license) take photo of BACK
 *   4. Take a SELFIE
 *   5. Confirm: uploads all photos as attachments + submits verification
 *      with attachment IDs. Status pending until operator approves.
 */
import React, { useState } from "react";
import { Alert, Image } from "react-native";
import {
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Heading,
  HStack,
    Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { MIcon, type MIconName } from "../../components/MIcon";
import { SuccessCheck } from "../../components/illustrations";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { uploadAttachment } from "../../services/attachments";
import { useAuthStore } from "../../stores/auth";
import { submitIdDocument } from "../../services/verifications";

interface Props {
  navigation: any;
}

type DocType = "passport" | "national_id" | "driver_license";
type Step = "type" | "front" | "back" | "selfie" | "review" | "submitting" | "done";

const NEEDS_BACK: Record<DocType, boolean> = {
  passport: false,
  national_id: true,
  driver_license: true,
};

export default function IdDocumentVerificationScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.userId);

  const [step, setStep] = useState<Step>("type");
  const [docType, setDocType] = useState<DocType | null>(null);
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);

  function pickType(t: DocType) {
    setDocType(t);
    setStep("front");
  }

  async function captureFront() {
    const uri = await captureCamera({ allowsEditing: true });
    if (uri) {
      setFrontUri(uri);
      setStep(NEEDS_BACK[docType!] ? "back" : "selfie");
    }
  }

  async function captureBack() {
    const uri = await captureCamera({ allowsEditing: true });
    if (uri) {
      setBackUri(uri);
      setStep("selfie");
    }
  }

  async function captureSelfie() {
    const uri = await captureCamera({ allowsEditing: false, useFront: true });
    if (uri) {
      setSelfieUri(uri);
      setStep("review");
    }
  }

  async function submit() {
    if (!docType || !frontUri || !selfieUri) return;
    if (NEEDS_BACK[docType] && !backUri) return;
    if (!userId) return;

    setStep("submitting");
    try {
      // Upload each photo as an attachment first.
      // owner_type=user, owner_id=current user — they're personal documents.
      const front = await uploadAttachment(frontUri, "user", userId, "ID front");
      if (!front.success || !front.attachment) throw new Error(front.error ?? "front upload failed");

      let backId: string | undefined;
      if (NEEDS_BACK[docType] && backUri) {
        const back = await uploadAttachment(backUri, "user", userId, "ID back");
        if (!back.success || !back.attachment) throw new Error(back.error ?? "back upload failed");
        backId = back.attachment.id;
      }

      const selfie = await uploadAttachment(selfieUri, "user", userId, "ID selfie");
      if (!selfie.success || !selfie.attachment) throw new Error(selfie.error ?? "selfie upload failed");

      await submitIdDocument({
        id_document_type: docType,
        front_attachment_id: front.attachment.id,
        back_attachment_id: backId,
        selfie_attachment_id: selfie.attachment.id,
      });

      setStep("done");
      setTimeout(() => navigation.goBack(), 2500);
    } catch (err: any) {
      setStep("review");
      Alert.alert(
        t("common.error", "Erreur"),
        err?.message ?? t("verif.id.submitError", "Échec de la soumission. Réessayez.")
      );
    }
  }

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <Box flex={1} bg="$backgroundLight50">
      <Box pt={insets.top + 12} px="$4">
        <Pressable
          onPress={() => (step === "type" ? navigation.goBack() : setStep("type"))}
          py="$2"
          alignSelf="flex-start"
        >
          <HStack alignItems="center" space="xs">
            <MIcon name="arrow-back" size="sm" color="$textLight600" />
            <Text size="md" color="$textLight600" fontWeight="$medium">
              {t("common.back", "Retour")}
            </Text>
          </HStack>
        </Pressable>
      </Box>

      <Box flex={1} p="$5">
        <Box maxWidth={420} w="$full" alignSelf="center" flex={1}>
          {step === "type" && (
            <VStack space="md">
              <Heading size="xl" color="$textLight900">
                {t("verif.id.pickType", "Quel document ?")}
              </Heading>
              <Text color="$textLight600" mb="$2">
                {t(
                  "verif.id.pickTypeSub",
                  "Choisissez le type de pièce d'identité que vous allez photographier."
                )}
              </Text>
              <DocTypeRow type="passport" labelKey="verif.id.passport" labelFallback="Passeport" onPress={pickType} />
              <DocTypeRow type="national_id" labelKey="verif.id.nationalId" labelFallback="Carte nationale d'identité" onPress={pickType} />
              <DocTypeRow type="driver_license" labelKey="verif.id.driverLicense" labelFallback="Permis de conduire" onPress={pickType} />
            </VStack>
          )}

          {step === "front" && (
            <CapturePrompt
              titleKey="verif.id.frontTitle"
              titleFallback="Photo recto"
              descKey="verif.id.frontDesc"
              descFallback="Posez le document à plat, sur fond uni. Toutes les informations doivent être lisibles."
              icon="badge"
              uri={frontUri}
              onCapture={captureFront}
            />
          )}

          {step === "back" && (
            <CapturePrompt
              titleKey="verif.id.backTitle"
              titleFallback="Photo verso"
              descKey="verif.id.backDesc"
              descFallback="Retournez le document et photographiez l'autre côté."
              icon="badge"
              uri={backUri}
              onCapture={captureBack}
            />
          )}

          {step === "selfie" && (
            <CapturePrompt
              titleKey="verif.id.selfieTitle"
              titleFallback="Selfie"
              descKey="verif.id.selfieDesc"
              descFallback="Prenez un selfie de votre visage en pleine lumière, sans lunettes ni masque."
              icon="person"
              uri={selfieUri}
              onCapture={captureSelfie}
            />
          )}

          {(step === "review" || step === "submitting") && (
            <ReviewStep
              docType={docType!}
              frontUri={frontUri!}
              backUri={backUri}
              selfieUri={selfieUri!}
              onEdit={(s) => setStep(s)}
              onSubmit={submit}
              submitting={step === "submitting"}
            />
          )}

          {step === "done" && (
            <VStack space="md" alignItems="center" justifyContent="center" flex={1}>
              <SuccessCheck width={180} />
              <Heading size="xl" textAlign="center" color="$textLight900" mt="$2">
                {t("verif.id.doneTitle", "Documents soumis")}
              </Heading>
              <Text textAlign="center" color="$textLight600" px="$4">
                {t(
                  "verif.id.doneSubtitle",
                  "Un opérateur va vérifier vos documents. Vous serez notifié dès que la vérification est terminée."
                )}
              </Text>
            </VStack>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function DocTypeRow({
  type,
  labelKey,
  labelFallback,
  onPress,
}: {
  type: DocType;
  labelKey: string;
  labelFallback: string;
  onPress: (t: DocType) => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => onPress(type)}
      bg="$white"
      borderRadius="$lg"
      borderWidth={1}
      borderColor="$borderLight200"
      p="$4"
      $active-bg="$backgroundLight100"
    >
      <HStack space="md" alignItems="center">
        <Box bg="$primary50" borderRadius="$lg" p="$2.5">
          <MIcon name="badge" size="md" color="$primary700" />
        </Box>
        <Text flex={1} size="md" fontWeight="$semibold" color="$textLight900">
          {t(labelKey, labelFallback)}
        </Text>
        <MIcon name="chevron-right" size="md" color="$textLight400" />
      </HStack>
    </Pressable>
  );
}

function CapturePrompt({
  titleKey,
  titleFallback,
  descKey,
  descFallback,
  icon,
  uri,
  onCapture,
}: {
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
  icon: MIconName;
  uri: string | null;
  onCapture: () => void;
}) {
  const { t } = useTranslation();
  return (
    <VStack space="md">
      <Heading size="xl" color="$textLight900">
        {t(titleKey, titleFallback)}
      </Heading>
      <Text color="$textLight600" mb="$2">
        {t(descKey, descFallback)}
      </Text>

      {uri ? (
        <Box
          borderRadius="$lg"
          overflow="hidden"
          borderWidth={1}
          borderColor="$borderLight200"
        >
          <Image source={{ uri }} style={{ width: "100%", aspectRatio: 4 / 3 }} resizeMode="cover" />
        </Box>
      ) : (
        <Box
          borderRadius="$lg"
          borderWidth={2}
          borderStyle="dashed"
          borderColor="$borderLight300"
          bg="$backgroundLight100"
          aspectRatio={4 / 3}
          alignItems="center"
          justifyContent="center"
        >
          <MIcon name={icon} size="xl" color="$textLight400" />
        </Box>
      )}

      <Button size="xl" action="primary" onPress={onCapture}>
        <MIcon name={uri ? "refresh" : "camera-alt"} color="$white" size="md" mr="$2" />
        <ButtonText>
          {uri ? t("verif.id.retake", "Reprendre") : t("verif.id.takePhoto", "Prendre la photo")}
        </ButtonText>
      </Button>
    </VStack>
  );
}

function ReviewStep({
  docType,
  frontUri,
  backUri,
  selfieUri,
  onEdit,
  onSubmit,
  submitting,
}: {
  docType: DocType;
  frontUri: string;
  backUri: string | null;
  selfieUri: string;
  onEdit: (step: Step) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <VStack space="md">
      <Heading size="xl" color="$textLight900">
        {t("verif.id.reviewTitle", "Vérification finale")}
      </Heading>
      <Text color="$textLight600" mb="$2">
        {t(
          "verif.id.reviewDesc",
          "Vérifiez que toutes les photos sont nettes et lisibles avant d'envoyer."
        )}
      </Text>

      <Thumb label={t("verif.id.front", "Recto")} uri={frontUri} onEdit={() => onEdit("front")} />
      {backUri && NEEDS_BACK[docType] && (
        <Thumb label={t("verif.id.back", "Verso")} uri={backUri} onEdit={() => onEdit("back")} />
      )}
      <Thumb label={t("verif.id.selfie", "Selfie")} uri={selfieUri} onEdit={() => onEdit("selfie")} />

      <Button size="xl" action="primary" onPress={onSubmit} isDisabled={submitting} mt="$2">
        {submitting && <ButtonSpinner mr="$2" />}
        <ButtonText>
          {submitting
            ? t("verif.id.submitting", "Envoi...")
            : t("verif.id.submit", "Soumettre pour vérification")}
        </ButtonText>
      </Button>
    </VStack>
  );
}

function Thumb({ label, uri, onEdit }: { label: string; uri: string; onEdit: () => void }) {
  return (
    <Pressable onPress={onEdit}>
      <HStack
        space="md"
        alignItems="center"
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        p="$3"
      >
        <Image source={{ uri }} style={{ width: 64, height: 48, borderRadius: 6 }} resizeMode="cover" />
        <Text flex={1} size="md" fontWeight="$medium" color="$textLight900">
          {label}
        </Text>
        <MIcon name="refresh" size="sm" color="$textLight500" />
      </HStack>
    </Pressable>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

async function captureCamera({
  allowsEditing,
  useFront = false,
}: {
  allowsEditing: boolean;
  useFront?: boolean;
}): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") return null;
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.8,
    allowsEditing,
    aspect: allowsEditing ? [4, 3] : undefined,
    cameraType: useFront ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}
