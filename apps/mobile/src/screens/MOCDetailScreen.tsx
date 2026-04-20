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
import { api } from "../services/api";
import { downloadAndOpenPdf } from "../services/pdf";
import {
  getMOC,
  MOC_STATUS_LABELS,
  promoteMOCToProject,
  requestMOCReturn,
  setExecutionAccord,
  setMOCSignature,
  transitionMOC,
  type MOCDetail,
  type MOCStatus,
  type SignatureSlot,
} from "../services/moc";
import SignaturePad from "../components/SignaturePad";
import MOCAttachmentsSection from "../components/MOCAttachmentsSection";

interface Props {
  route: { params: { mocId: string } };
  navigation: any;
}

const PRIORITY_KEY: Record<string, string> = {
  "1": "moc.priority.high",
  "2": "moc.priority.normal",
  "3": "moc.priority.low",
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
  const { t } = useTranslation();
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
          <BadgeText>{required ? t("moc.flag.necessary") : "—"}</BadgeText>
        </Badge>
        <Badge
          action={completed ? "success" : "muted"}
          variant="outline"
          size="sm"
        >
          <BadgeText>{completed ? t("moc.flag.done") : "—"}</BadgeText>
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
        if (!moc.initiator_signature) missing.push(t("moc.transition.prereq.initiatorSignature"));
        if (moc.is_real_change === null || moc.is_real_change === undefined)
          missing.push(t("moc.transition.prereq.isRealChange"));
        if (!moc.site_chief_comment?.trim())
          missing.push(t("moc.transition.prereq.siteChiefComment"));
      } else if (to === "submitted_to_confirm") {
        if (!moc.site_chief_signature)
          missing.push(t("moc.transition.prereq.siteChiefSignature"));
      } else if (to === "validated") {
        const unapproved = (moc.validations || []).filter(
          (v) => v.required && !v.approved,
        );
        if (unapproved.length > 0)
          missing.push(t("moc.transition.prereq.allValidators"));
      } else if (to === "execution") {
        if (moc.do_execution_accord !== true) missing.push(t("moc.transition.prereq.doAccord"));
        if (moc.dg_execution_accord !== true) missing.push(t("moc.transition.prereq.dgAccord"));
      } else if (to === "closed") {
        if (moc.pid_update_required && !moc.pid_update_completed)
          missing.push(t("moc.transition.prereq.pidUpdate"));
        if (moc.esd_update_required && !moc.esd_update_completed)
          missing.push(t("moc.transition.prereq.esdUpdate"));
        // close_signature is checked server-side; we can't know it from
        // the read payload alone (redacted for most viewers).
      }
      return missing;
    },
    [moc, t],
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
          t("moc.transition.prereqsMissing"),
          missing.map((m) => `• ${m}`).join("\n"),
        );
        return;
      }
      setTxLoading(to);
      try {
        const updated = await transitionMOC(moc.id, { to_status: to });
        setMoc(updated);
        toastShow(
          t("moc.transition.statusToast", {
            label: MOC_STATUS_LABELS[updated.status] ?? updated.status,
          }),
          "success",
        );
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = (err as any)?.response?.data?.detail;
        const msg = typeof d === "string" ? d : d?.message ?? t("moc.transition.refused");
        Alert.alert(t("moc.errorGeneric"), msg);
      } finally {
        setTxLoading(null);
      }
    },
    [moc, missingPrereqs, toastShow, t],
  );

  const onPromote = useCallback(async () => {
    if (!moc) return;
    try {
      const updated = await promoteMOCToProject(moc.id);
      setMoc(updated);
      toastShow(
        t("moc.promote.success", { code: updated.linked_project?.code ?? "OK" }),
        "success",
      );
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (err as any)?.response?.data?.detail;
      const msg =
        typeof d === "string" ? d : d?.message ?? t("moc.promote.failed");
      Alert.alert(t("moc.errorGeneric"), msg);
    }
  }, [moc, toastShow, t]);

  const onDirectorAccord = useCallback(
    async (actor: "do" | "dg", accord: boolean) => {
      if (!moc) return;
      try {
        const updated = await setExecutionAccord(moc.id, {
          actor,
          accord,
        });
        setMoc(updated);
        toastShow(
          t("moc.accord.saved", {
            actor: actor.toUpperCase(),
            verdict: accord ? t("moc.badge.accord") : t("moc.badge.refus"),
          }),
          "success",
        );
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = (err as any)?.response?.data?.detail;
        const msg =
          typeof d === "string" ? d : d?.message ?? t("moc.accord.failed");
        Alert.alert(t("moc.errorGeneric"), msg);
      }
    },
    [moc, toastShow, t],
  );

  const onValidatorTap = useCallback(
    async (validationId: string, approved: boolean) => {
      if (!moc) return;
      Alert.alert(
        approved ? t("moc.action.validate") : t("moc.action.send_return"),
        approved
          ? t("moc.action.confirmValidate")
          : t("moc.action.confirmReturn"),
        [
          { text: t("moc.action.cancel"), style: "cancel" },
          {
            text: approved ? t("moc.action.validate") : t("moc.action.send_return"),
            style: approved ? "default" : "destructive",
            onPress: async () => {
              try {
                if (approved) {
                  // Upsert the validation row as approved — keyed by role +
                  // metier_code + target_validator_id (the row owner).
                  const v = moc.validations.find((x) => x.id === validationId);
                  if (!v) return;
                  await api.post(`/api/v1/moc/${moc.id}/validations`, {
                    role: v.role,
                    metier_code: (
                      v as unknown as { metier_code?: string }
                    ).metier_code,
                    approved: true,
                    target_validator_id: v.validator_id,
                  });
                  toastShow(t("moc.validation.saved"), "success");
                } else {
                  await requestMOCReturn(moc.id, {
                    stage: "validator",
                    reason: t("moc.validation.returnReasonDefault"),
                    validation_id: validationId,
                  });
                  toastShow(t("moc.validation.returnSaved"), "success");
                }
                const fresh = await getMOC(moc.id);
                setMoc(fresh);
              } catch (err: unknown) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const d = (err as any)?.response?.data?.detail;
                const msg =
                  typeof d === "string"
                    ? d
                    : d?.message ?? t("moc.actionFailed");
                Alert.alert(t("moc.errorGeneric"), msg);
              }
            },
          },
        ],
      );
    },
    [moc, toastShow, t],
  );

  const saveSignature = useCallback(async () => {
    if (!moc || !sigModalSlot || !sigDraft) return;
    setSigSaving(true);
    try {
      const updated = await setMOCSignature(moc.id, sigModalSlot, sigDraft);
      setMoc(updated);
      toastShow(t("moc.signature.saved"), "success");
      setSigModalSlot(null);
      setSigDraft(null);
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (err as any)?.response?.data?.detail;
      const msg = typeof d === "string" ? d : d?.message ?? t("moc.signature.error");
      Alert.alert(t("moc.errorGeneric"), msg);
    } finally {
      setSigSaving(false);
    }
  }, [moc, sigModalSlot, sigDraft, toastShow, t]);

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
                {t(PRIORITY_KEY[moc.priority] ?? "")}
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
                  ? t("moc.type.permanent")
                  : t("moc.type.temporary")}
              </BadgeText>
            </Badge>
          )}
          {moc.project_id && (
            <Badge action="success" variant="solid" size="sm">
              <BadgeText>{t("moc.badge.promoted")}</BadgeText>
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
          {t("moc.section.identification")}
        </Heading>
        <RoleLine label={t("moc.field.site")} value={moc.site_label} />
        <RoleLine label={t("moc.field.platform")} value={moc.platform_code} />
        <RoleLine
          label={t("moc.field.requester")}
          value={moc.initiator_display || moc.initiator_email || "—"}
        />
        {moc.manager_id && (
          <RoleLine label={t("moc.field.projectManager")} value={t("moc.field.manager_assigned")} ok={true} />
        )}
        {moc.metiers && moc.metiers.length > 0 && (
          <RoleLine label={t("moc.field.metiers")} value={moc.metiers.join(", ")} />
        )}
        {moc.modification_type === "temporary" &&
          (moc.temporary_start_date || moc.temporary_end_date) && (
            <RoleLine
              label={t("moc.field.period")}
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
          {t("moc.section.content")}
        </Heading>
        <VStack space="sm">
          {moc.objectives && (
            <VStack>
              <Text size="2xs" color="$textLight500" mb="$0.5">
                {t("moc.field.objectives")}
              </Text>
              <Text size="xs" color="$textLight900">
                {moc.objectives}
              </Text>
            </VStack>
          )}
          {(
            [
              [t("moc.field.description"), moc.description],
              [t("moc.field.currentSituation"), moc.current_situation],
              [t("moc.field.proposedChanges"), moc.proposed_changes],
              [t("moc.field.impact"), moc.impact_analysis],
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
            {t("moc.section.validations")} ({moc.validations.length})
          </Heading>
          {moc.validations.map((v) => (
            <VStack
              key={v.id}
              py="$1.5"
              borderBottomWidth={1}
              borderBottomColor="$borderLight100"
              space="xs"
            >
              <HStack justifyContent="space-between" alignItems="center">
                <Text size="xs" fontWeight="$medium" flex={1}>
                  {v.role}
                  {v.metier_name ? ` — ${v.metier_name}` : ""}
                </Text>
                {v.approved === true && (
                  <MIcon name="check-circle" size="2xs" color="$emerald600" />
                )}
                {v.approved === false && (
                  <MIcon name="cancel" size="2xs" color="$red600" />
                )}
                {v.return_requested && (
                  <Badge action="warning" variant="outline" size="sm">
                    <BadgeText>{t("moc.badge.returnChip")}</BadgeText>
                  </Badge>
                )}
              </HStack>
              {v.validator_name && (
                <Text size="2xs" color="$textLight500">
                  {v.validator_name}
                </Text>
              )}
              {v.approved !== true && !v.return_requested && (
                <HStack space="sm">
                  <Button
                    size="xs"
                    action="positive"
                    variant="outline"
                    flex={1}
                    onPress={() => onValidatorTap(v.id, true)}
                  >
                    <ButtonText>{t("moc.action.validate")}</ButtonText>
                  </Button>
                  <Button
                    size="xs"
                    action="negative"
                    variant="outline"
                    flex={1}
                    onPress={() => onValidatorTap(v.id, false)}
                  >
                    <ButtonText>{t("moc.action.send_return")}</ButtonText>
                  </Button>
                </HStack>
              )}
            </VStack>
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
          {t("moc.section.flags")}
        </Heading>
        <Flag
          label={t("moc.flag.hazop")}
          required={moc.hazop_required}
          completed={moc.hazop_completed}
        />
        <Flag
          label={t("moc.flag.hazid")}
          required={moc.hazid_required}
          completed={moc.hazid_completed}
        />
        <Flag
          label={t("moc.flag.environmental")}
          required={moc.environmental_required}
          completed={moc.environmental_completed}
        />
        <Flag
          label={t("moc.flag.pidUpdate")}
          required={moc.pid_update_required}
          completed={moc.pid_update_completed}
        />
        <Flag
          label={t("moc.flag.esdUpdate")}
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
              {t("moc.section.linked_project")}
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

      {/* Promote to project — visible only when validated+ and not already promoted */}
      {!moc.project_id &&
        ["validated", "execution", "executed_docs_pending"].includes(
          moc.status,
        ) && (
          <Button action="primary" onPress={onPromote} mb="$2">
            <MIcon name="rocket-launch" color="$white" size="sm" />
            <ButtonText>{t("moc.action.promote")}</ButtonText>
          </Button>
        )}

      {/* DO / DG accords — visible when status=validated awaiting accords */}
      {["validated", "execution"].includes(moc.status) && (
        <Box
          bg="$white"
          borderRadius="$lg"
          borderWidth={1}
          borderColor="$borderLight200"
          p="$3"
          mb="$2"
        >
          <Heading size="sm" mb="$2">
            {t("moc.section.executionAccord")}
          </Heading>
          {(["do", "dg"] as const).map((actor) => {
            const accord =
              actor === "do"
                ? moc.do_execution_accord
                : moc.dg_execution_accord;
            return (
              <VStack
                key={actor}
                py="$1.5"
                borderBottomWidth={1}
                borderBottomColor="$borderLight100"
              >
                <HStack alignItems="center" justifyContent="space-between">
                  <Text size="xs" fontWeight="$medium">
                    {actor.toUpperCase()}
                  </Text>
                  {accord === true && (
                    <Badge action="success" size="sm">
                      <BadgeText>{t("moc.badge.accord")}</BadgeText>
                    </Badge>
                  )}
                  {accord === false && (
                    <Badge action="error" size="sm">
                      <BadgeText>{t("moc.badge.refus")}</BadgeText>
                    </Badge>
                  )}
                  {accord === null && (
                    <Badge action="muted" size="sm">
                      <BadgeText>{t("moc.badge.waiting")}</BadgeText>
                    </Badge>
                  )}
                </HStack>
                {accord !== true && (
                  <HStack space="sm" mt="$1.5">
                    <Button
                      size="xs"
                      action="positive"
                      variant="outline"
                      flex={1}
                      onPress={() => onDirectorAccord(actor, true)}
                    >
                      <ButtonText>{t("moc.action.approve")}</ButtonText>
                    </Button>
                    <Button
                      size="xs"
                      action="negative"
                      variant="outline"
                      flex={1}
                      onPress={() => onDirectorAccord(actor, false)}
                    >
                      <ButtonText>{t("moc.action.refuse")}</ButtonText>
                    </Button>
                  </HStack>
                )}
              </VStack>
            );
          })}
        </Box>
      )}

      {/* Attachments — typed photo uploader (PID / schémas / photos) */}
      <MOCAttachmentsSection mocId={moc.id} />

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
            {t("moc.section.actions")}
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
                        {t("moc.transition.prereqsMissing")} :
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
          {t("moc.section.signatures")}
        </Heading>
        {(
          [
            ["initiator", t("moc.signature.slot.initiator"), moc.initiator_signature],
            ["hierarchy_reviewer", t("moc.signature.slot.hierarchy_reviewer"), moc.hierarchy_reviewer_signature as string | null],
            ["site_chief", t("moc.signature.slot.site_chief"), moc.site_chief_signature],
            ["production", t("moc.signature.slot.production"), null],
            ["process_engineer", t("moc.signature.slot.process_engineer"), null],
            ["do", t("moc.signature.slot.do"), null],
            ["dg", t("moc.signature.slot.dg"), null],
            ["close", t("moc.signature.slot.close"), null],
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
                ? `${label} — ${t("moc.badge.protected")}`
                : current
                  ? `${label} — ${t("moc.badge.signed")}`
                  : `${t("moc.badge.sign")} ${label}`}
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
          <ButtonText>{t("moc.action.refresh")}</ButtonText>
        </Button>
      </VStack>

      <Divider my="$4" />
      <Text size="2xs" color="$textLight400" textAlign="center">
        {t("moc.phase2Note")}
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
              {t("moc.signature.modalTitle", { slot: sigModalSlot ? t(`moc.signature.slot.${sigModalSlot}`) : "" })}
            </Heading>
            <Text size="2xs" color="$textLight500" mb="$3">
              {t("moc.signature.modalHint")}
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
                <ButtonText>{t("moc.action.cancel")}</ButtonText>
              </Button>
              <Button
                flex={1}
                action="primary"
                isDisabled={!sigDraft || sigSaving}
                onPress={saveSignature}
              >
                {sigSaving ? <ButtonSpinner mr="$2" /> : null}
                <ButtonText>{t("moc.action.save")}</ButtonText>
              </Button>
            </HStack>
          </Box>
        </Box>
      </Modal>
    </ScrollView>
  );
}
