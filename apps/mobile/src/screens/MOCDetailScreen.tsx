/**
 * MOCDetailScreen — read-only view of a MOC record (phase 1).
 *
 * Scrollable layout:
 *   1. Header card — reference + status + priority + nature
 *   2. Identification card — site / platform / manager / project link
 *   3. Content — objectives + description (rich HTML rendered as plain
 *      text via a tag-strip helper, to avoid pulling in a WebView on
 *      mobile), situation, proposed changes, impact analysis
 *   4. Validation matrix — one row per validator with status pill
 *   5. Flags grid — HAZOP/HAZID/ENV/PID/ESD with necessary+completed chips
 *   6. Linked project summary (when promoted)
 *   7. Action buttons — Download PDF + refresh. Writes arrive in phase 2.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, ScrollView } from "react-native";
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
import { useTranslation } from "react-i18next";
import { MIcon } from "../components/MIcon";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";

const useToastShow = () => useToast((s) => s.show);
import { downloadAndOpenPdf } from "../services/pdf";
import {
  getMOC,
  MOC_STATUS_LABELS,
  setMOCSignature,
  transitionMOC,
  type MOCDetail,
  type MOCStatus,
  type SignatureSlot,
} from "../services/moc";
import SignaturePad from "../components/SignaturePad";

interface Props {
  route: { params: { mocId: string } };
  navigation: any;
}

const PRIORITY_LABEL: Record<string, string> = {
  "1": "Priorité haute",
  "2": "Priorité normale",
  "3": "Priorité basse",
};
const PRIORITY_COLOR: Record<string, string> = {
  "1": "$red500",
  "2": "$amber500",
  "3": "$emerald500",
};

// Strip HTML tags for plain-text display — RN has no innerHTML and a
// WebView would be overkill for a small card. Decodes the common
// entities the Tiptap editor produces.
function stripHtml(html: string | null | undefined): string {
  if (!html) return "—";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim() || "—";
}

function RoleLine({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean | null;
}) {
  return (
    <HStack
      justifyContent="space-between"
      alignItems="center"
      py="$1.5"
      borderBottomWidth={1}
      borderBottomColor="$borderLight100"
    >
      <Text size="xs" color="$textLight700" flex={1} fontWeight="$medium">
        {label}
      </Text>
      <HStack space="xs" alignItems="center">
        <Text size="xs" color="$textLight500" numberOfLines={1}>
          {value}
        </Text>
        {ok === true && <MIcon name="check-circle" size="2xs" color="$emerald600" />}
        {ok === false && <MIcon name="cancel" size="2xs" color="$red600" />}
      </HStack>
    </HStack>
  );
}

function Flag({
  label,
  required,
  completed,
}: {
  label: string;
  required: boolean;
  completed: boolean;
}) {
  return (
    <HStack
      justifyContent="space-between"
      alignItems="center"
      py="$1.5"
      borderBottomWidth={1}
      borderBottomColor="$borderLight100"
    >
      <Text size="xs" color="$textLight700" flex={1} fontWeight="$medium">
        {label}
      </Text>
      <HStack space="xs">
        <Badge
          action={required ? "warning" : "muted"}
          variant="outline"
          size="sm"
        >
          <BadgeText>{required ? "Nécessaire" : "—"}</BadgeText>
        </Badge>
        <Badge
          action={completed ? "success" : "muted"}
          variant="outline"
          size="sm"
        >
          <BadgeText>{completed ? "Réalisé" : "—"}</BadgeText>
        </Badge>
      </HStack>
    </HStack>
  );
}

export default function MOCDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toastShow = useToastShow();
  const { mocId } = route.params;

  const [moc, setMoc] = useState<MOCDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Signature modal — shared across all slots the user can sign.
  const [sigModalSlot, setSigModalSlot] = useState<SignatureSlot | null>(null);
  const [sigDraft, setSigDraft] = useState<string | null>(null);
  const [sigSaving, setSigSaving] = useState(false);
  // Transition runner — one spinner for the whole workflow card.
  const [txLoading, setTxLoading] = useState<MOCStatus | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      const d = await getMOC(mocId);
      setMoc(d);
      navigation.setOptions?.({ title: d.reference });
    } catch {
      Alert.alert(
        t("moc.loadError", "Erreur"),
        t("moc.loadErrorDesc", "Impossible de charger le MOC."),
      );
    } finally {
      setLoading(false);
    }
  }, [mocId, navigation, t]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const onDownloadPdf = useCallback(async () => {
    if (!moc) return;
    setPdfLoading(true);
    const res = await downloadAndOpenPdf(
      `/api/v1/moc/${moc.id}/pdf?language=fr`,
      `${moc.reference}.pdf`,
      { forceFresh: true },
    );
    setPdfLoading(false);
    if (!res.ok) {
      toastShow(
        `${t("moc.pdfFailed", "Échec PDF")} — ${res.error}`,
        "error",
      );
    }
  }, [moc, toastShow, t]);

  /** Mirror of apps/main's `missingPrereqsFor` — returns the human list
   *  of prerequisites missing to execute a given FSM transition. Kept in
   *  sync with app/services/modules/moc_service.py.
   */
  const missingPrereqs = useCallback(
    (to: MOCStatus): string[] => {
      if (!moc) return [];
      const missing: string[] = [];
      if (to === "approved") {
        if (!moc.initiator_signature) missing.push("Signature du demandeur");
        if (moc.is_real_change === null || moc.is_real_change === undefined)
          missing.push("Revue hiérarchie (Oui/Non)");
        if (!moc.site_chief_comment?.trim())
          missing.push("Commentaire du Chef de site");
      } else if (to === "submitted_to_confirm") {
        if (!moc.site_chief_signature)
          missing.push("Signature Chef de site");
      } else if (to === "validated") {
        const unapproved = (moc.validations || []).filter(
          (v) => v.required && !v.approved,
        );
        if (unapproved.length > 0)
          missing.push("Toutes les validations requises");
      } else if (to === "execution") {
        if (moc.do_execution_accord !== true) missing.push("Accord D.O");
        if (moc.dg_execution_accord !== true) missing.push("Accord D.G");
      } else if (to === "closed") {
        if (moc.pid_update_required && !moc.pid_update_completed)
          missing.push("MAJ PID");
        if (moc.esd_update_required && !moc.esd_update_completed)
          missing.push("MAJ ESD");
        // close_signature is checked server-side; we can't know it from
        // the read payload alone (redacted for most viewers).
      }
      return missing;
    },
    [moc],
  );

  /** Allowed transitions from the current status. The server also
   *  enforces permissions — we can't know the caller's roles here,
   *  so we show every outgoing transition and let the backend filter.
   */
  const outgoingTransitions = useMemo<MOCStatus[]>(() => {
    if (!moc) return [];
    // Minimal static FSM mirror — do not call /fsm from the mobile
    // detail screen; the set of destinations per status is stable.
    const FSM: Record<string, MOCStatus[]> = {
      created: ["approved", "cancelled"],
      approved: ["submitted_to_confirm", "cancelled"],
      submitted_to_confirm: ["approved_to_study", "stand_by", "cancelled"],
      stand_by: ["submitted_to_confirm", "cancelled"],
      approved_to_study: ["under_study"],
      under_study: ["study_in_validation", "cancelled"],
      study_in_validation: ["validated", "under_study", "cancelled"],
      validated: ["execution", "cancelled"],
      execution: ["executed_docs_pending"],
      executed_docs_pending: ["closed"],
    };
    return FSM[moc.status] ?? [];
  }, [moc]);

  const runTransition = useCallback(
    async (to: MOCStatus) => {
      if (!moc) return;
      const missing = to === "cancelled" ? [] : missingPrereqs(to);
      if (missing.length > 0) {
        Alert.alert(
          "Prérequis manquants",
          missing.map((m) => `• ${m}`).join("\n"),
        );
        return;
      }
      setTxLoading(to);
      try {
        const updated = await transitionMOC(moc.id, { to_status: to });
        setMoc(updated);
        toastShow(
          `Statut : ${MOC_STATUS_LABELS[updated.status] ?? updated.status}`,
          "success",
        );
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = (err as any)?.response?.data?.detail;
        const msg = typeof d === "string" ? d : d?.message ?? "Transition refusée";
        Alert.alert("Erreur", msg);
      } finally {
        setTxLoading(null);
      }
    },
    [moc, missingPrereqs, toastShow],
  );

  const saveSignature = useCallback(async () => {
    if (!moc || !sigModalSlot || !sigDraft) return;
    setSigSaving(true);
    try {
      const updated = await setMOCSignature(moc.id, sigModalSlot, sigDraft);
      setMoc(updated);
      toastShow("Signature enregistrée", "success");
      setSigModalSlot(null);
      setSigDraft(null);
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (err as any)?.response?.data?.detail;
      const msg = typeof d === "string" ? d : d?.message ?? "Échec signature";
      Alert.alert("Erreur", msg);
    } finally {
      setSigSaving(false);
    }
  }, [moc, sigModalSlot, sigDraft, toastShow]);

  if (loading || !moc) {
    return (
      <Box
        flex={1}
        bg="$backgroundLight50"
        alignItems="center"
        justifyContent="center"
      >
        <Spinner color="$primary600" size="large" />
      </Box>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: "#f8fafc", flex: 1 }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 14,
      }}
    >
      {/* Header card */}
      <Box
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        p="$3"
        mb="$2"
      >
        <HStack
          alignItems="flex-start"
          justifyContent="space-between"
          mb="$2"
        >
          <VStack flex={1}>
            <Text size="xs" color="$textLight500">
              {moc.reference}
            </Text>
            <Heading size="md" color="$primary900">
              {moc.title || "—"}
            </Heading>
          </VStack>
          <StatusBadge status={moc.status} />
        </HStack>
        <HStack space="sm" alignItems="center" flexWrap="wrap">
          {moc.priority && (
            <HStack space="xs" alignItems="center">
              <Box
                w="$2"
                h="$2"
                borderRadius="$full"
                bg={PRIORITY_COLOR[moc.priority] ?? "$textLight400"}
              />
              <Text size="2xs" color="$textLight600">
                {PRIORITY_LABEL[moc.priority]}
              </Text>
            </HStack>
          )}
          {moc.nature && (
            <Badge action="info" variant="outline" size="sm">
              <BadgeText>{moc.nature}</BadgeText>
            </Badge>
          )}
          {moc.modification_type && (
            <Badge action="muted" variant="outline" size="sm">
              <BadgeText>
                {moc.modification_type === "permanent"
                  ? "Permanent"
                  : "Temporaire"}
              </BadgeText>
            </Badge>
          )}
          {moc.project_id && (
            <Badge action="success" variant="solid" size="sm">
              <BadgeText>Promu en projet</BadgeText>
            </Badge>
          )}
        </HStack>
      </Box>

      {/* Identification */}
      <Box
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        p="$3"
        mb="$2"
      >
        <Heading size="sm" mb="$2">
          Identification
        </Heading>
        <RoleLine label="Site" value={moc.site_label} />
        <RoleLine label="Plateforme" value={moc.platform_code} />
        <RoleLine
          label="Demandeur"
          value={moc.initiator_display || moc.initiator_email || "—"}
        />
        {moc.manager_id && (
          <RoleLine label="Chef de projet" value="Assigné" ok={true} />
        )}
        {moc.metiers && moc.metiers.length > 0 && (
          <RoleLine label="Métiers" value={moc.metiers.join(", ")} />
        )}
        {moc.modification_type === "temporary" &&
          (moc.temporary_start_date || moc.temporary_end_date) && (
            <RoleLine
              label="Période"
              value={`${moc.temporary_start_date ?? "?"} → ${moc.temporary_end_date ?? "?"}`}
            />
          )}
      </Box>

      {/* Content */}
      <Box
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        p="$3"
        mb="$2"
      >
        <Heading size="sm" mb="$2">
          Contenu
        </Heading>
        <VStack space="sm">
          {moc.objectives && (
            <VStack>
              <Text size="2xs" color="$textLight500" mb="$0.5">
                OBJECTIFS
              </Text>
              <Text size="xs" color="$textLight900">
                {moc.objectives}
              </Text>
            </VStack>
          )}
          {(
            [
              ["DESCRIPTION", moc.description],
              ["SITUATION ACTUELLE", moc.current_situation],
              ["MODIFICATIONS PROPOSÉES", moc.proposed_changes],
              ["ANALYSE D'IMPACT", moc.impact_analysis],
            ] as Array<[string, string | null]>
          )
            .filter(([, v]) => v && v.trim())
            .map(([label, v]) => (
              <VStack key={label}>
                <Text size="2xs" color="$textLight500" mb="$0.5">
                  {label}
                </Text>
                <Text size="xs" color="$textLight900">
                  {stripHtml(v)}
                </Text>
              </VStack>
            ))}
        </VStack>
      </Box>

      {/* Validations */}
      {moc.validations && moc.validations.length > 0 && (
        <Box
          bg="$white"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$borderLight200"
          p="$3"
          mb="$2"
        >
          <Heading size="sm" mb="$2">
            Validations ({moc.validations.length})
          </Heading>
          {moc.validations.map((v) => (
            <RoleLine
              key={v.id}
              label={`${v.role}${v.metier_name ? ` — ${v.metier_name}` : ""}`}
              value={
                v.return_requested
                  ? "Renvoi demandé"
                  : v.validator_name || "—"
              }
              ok={v.approved}
            />
          ))}
        </Box>
      )}

      {/* Flags */}
      <Box
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        p="$3"
        mb="$2"
      >
        <Heading size="sm" mb="$2">
          Prérequis sécurité / documentaire
        </Heading>
        <Flag
          label="HAZOP"
          required={moc.hazop_required}
          completed={moc.hazop_completed}
        />
        <Flag
          label="HAZID"
          required={moc.hazid_required}
          completed={moc.hazid_completed}
        />
        <Flag
          label="Étude environnementale"
          required={moc.environmental_required}
          completed={moc.environmental_completed}
        />
        <Flag
          label="MAJ PID"
          required={moc.pid_update_required}
          completed={moc.pid_update_completed}
        />
        <Flag
          label="MAJ ESD"
          required={moc.esd_update_required}
          completed={moc.esd_update_completed}
        />
      </Box>

      {/* Linked project */}
      {moc.linked_project && (
        <Box
          bg="$emerald50"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$emerald200"
          p="$3"
          mb="$2"
        >
          <HStack alignItems="center" space="xs" mb="$2">
            <MIcon name="rocket-launch" size="sm" color="$emerald700" />
            <Heading size="sm" color="$emerald900">
              Projet lié
            </Heading>
          </HStack>
          <Text size="xs" color="$emerald900" fontWeight="$bold">
            {moc.linked_project.code} — {moc.linked_project.name}
          </Text>
          <Text size="2xs" color="$emerald700" mt="$1">
            Avancement : {moc.linked_project.progress}% · Statut :{" "}
            {moc.linked_project.status}
          </Text>
        </Box>
      )}

      {/* Workflow — outgoing transitions with precondition hints */}
      {outgoingTransitions.length > 0 && (
        <Box
          bg="$white"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$borderLight200"
          p="$3"
          mb="$2"
        >
          <Heading size="sm" mb="$2">
            Actions workflow
          </Heading>
          <VStack space="xs">
            {outgoingTransitions.map((to) => {
              const missing = to === "cancelled" ? [] : missingPrereqs(to);
              const isBlocked = missing.length > 0;
              const isCancel = to === "cancelled";
              return (
                <VStack key={to} space="xs">
                  <Button
                    size="sm"
                    action={isCancel ? "negative" : "primary"}
                    variant={isCancel ? "outline" : "solid"}
                    isDisabled={txLoading !== null || isBlocked}
                    onPress={() => runTransition(to)}
                  >
                    {txLoading === to ? <ButtonSpinner mr="$2" /> : null}
                    <ButtonText>
                      {MOC_STATUS_LABELS[to] ?? to}
                    </ButtonText>
                  </Button>
                  {isBlocked && (
                    <Box
                      bg="$amber50"
                      borderWidth={1}
                      borderColor="$amber200"
                      borderRadius="$md"
                      px="$2"
                      py="$1.5"
                    >
                      <Text size="2xs" color="$amber900" fontWeight="$bold">
                        Prérequis manquants :
                      </Text>
                      {missing.map((m) => (
                        <Text key={m} size="2xs" color="$amber800">
                          • {m}
                        </Text>
                      ))}
                    </Box>
                  )}
                </VStack>
              );
            })}
          </VStack>
        </Box>
      )}

      {/* Signature slots — tap a row to open the canvas modal */}
      <Box
        bg="$white"
        borderRadius="$lg"
        borderWidth={1}
        borderColor="$borderLight200"
        p="$3"
        mb="$2"
      >
        <Heading size="sm" mb="$2">
          Signatures
        </Heading>
        {(
          [
            ["initiator", "Demandeur", moc.initiator_signature],
            ["hierarchy_reviewer", "Revue hiérarchie", moc.hierarchy_reviewer_signature as string | null],
            ["site_chief", "Chef de site (accord)", moc.site_chief_signature],
            ["production", "Production", null],
            ["process_engineer", "Process Engineer", null],
            ["do", "D.O", null],
            ["dg", "D.G", null],
            ["close", "Clôture CDS", null],
          ] as Array<[SignatureSlot, string, string | null]>
        ).map(([slot, label, current]) => (
          <Button
            key={slot}
            size="sm"
            variant="outline"
            action="secondary"
            onPress={() => {
              setSigModalSlot(slot);
              setSigDraft(null);
            }}
            mb="$1.5"
          >
            <ButtonText>
              {current === "__REDACTED__"
                ? `${label} — protégée`
                : current
                  ? `${label} — déjà signée · changer`
                  : `Signer ${label}`}
            </ButtonText>
          </Button>
        ))}
      </Box>

      {/* Actions */}
      <VStack space="sm" mt="$2">
        <Button action="primary" onPress={onDownloadPdf} isDisabled={pdfLoading}>
          {pdfLoading ? <ButtonSpinner mr="$2" /> : null}
          <ButtonText>
            {pdfLoading
              ? t("moc.downloadingPdf", "Génération…")
              : t("moc.downloadPdf", "Formulaire PDF")}
          </ButtonText>
        </Button>
        <Button
          action="secondary"
          variant="outline"
          onPress={() => {
            setLoading(true);
            fetchDetail();
          }}
        >
          <ButtonText>{t("common.refresh", "Actualiser")}</ButtonText>
        </Button>
      </VStack>

      <Divider my="$4" />
      <Text size="2xs" color="$textLight400" textAlign="center">
        Mobile phase 2 — signatures + transitions. Attachements photos arrivent.
      </Text>

      {/* Signature modal — SVG canvas, save via /signature endpoint */}
      <Modal
        visible={sigModalSlot !== null}
        animationType="slide"
        transparent
        onRequestClose={() => !sigSaving && setSigModalSlot(null)}
      >
        <Box
          flex={1}
          bg="rgba(15, 23, 42, 0.6)"
          justifyContent="flex-end"
        >
          <Box
            bg="$white"
            borderTopLeftRadius="$xl"
            borderTopRightRadius="$xl"
            p="$4"
            pb={insets.bottom + 16}
          >
            <Heading size="sm" mb="$1">
              Signer — {sigModalSlot}
            </Heading>
            <Text size="2xs" color="$textLight500" mb="$3">
              Signez dans le cadre ci-dessous avec le doigt ou un stylet.
            </Text>
            <SignaturePad
              value={sigDraft}
              onChange={setSigDraft}
              disabled={sigSaving}
            />
            <HStack space="sm" mt="$4">
              <Button
                flex={1}
                variant="outline"
                action="secondary"
                isDisabled={sigSaving}
                onPress={() => {
                  setSigModalSlot(null);
                  setSigDraft(null);
                }}
              >
                <ButtonText>Annuler</ButtonText>
              </Button>
              <Button
                flex={1}
                action="primary"
                isDisabled={!sigDraft || sigSaving}
                onPress={saveSignature}
              >
                {sigSaving ? <ButtonSpinner mr="$2" /> : null}
                <ButtonText>Enregistrer</ButtonText>
              </Button>
            </HStack>
          </Box>
        </Box>
      </Modal>
    </ScrollView>
  );
}
