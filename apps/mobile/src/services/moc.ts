/**
 * MOCTrack mobile API — read-only phase 1.
 *
 * Mirrors app/api/routes/modules/moc.py (subset). Phase 1 exposes what's
 * needed to browse and read MOCs on the go: list with filters, detail
 * with history + validations + linked_project, PDF download.
 *
 * Writes (signatures, transitions, validation upsert, promote, create,
 * attachments) arrive in phase 2/3 together with the React Native
 * signature canvas.
 */

import { api } from "./api";
import { fetchWithOfflineFallback } from "./offline";
import type { PaginatedResponse } from "../types/api";

export type MOCStatus =
  | "created"
  | "approved"
  | "submitted_to_confirm"
  | "cancelled"
  | "stand_by"
  | "approved_to_study"
  | "under_study"
  | "study_in_validation"
  | "validated"
  | "execution"
  | "executed_docs_pending"
  | "closed";

export type MOCPriority = "1" | "2" | "3";

export interface MOCSummary {
  id: string;
  reference: string;
  title: string | null;
  status: MOCStatus;
  site_label: string;
  platform_code: string;
  priority: MOCPriority | null;
  initiator_display: string | null;
  manager_id: string | null;
  project_id: string | null;
  created_at: string;
}

export interface MOCValidationEntry {
  id: string;
  role: string;
  metier_name: string | null;
  required: boolean;
  completed: boolean;
  approved: boolean | null;
  validator_id: string | null;
  validator_name: string | null;
  level: string | null;
  comments: string | null;
  validated_at: string | null;
  source: "manual" | "matrix" | "invite";
  signature: string | null;
  return_requested: boolean;
  return_reason: string | null;
}

export interface MOCStatusHistoryEntry {
  id: string;
  old_status: MOCStatus | null;
  new_status: MOCStatus;
  changed_by: string;
  changed_by_name: string | null;
  note: string | null;
  created_at: string;
}

export interface MOCLinkedProject {
  id: string;
  code: string;
  name: string;
  status: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  actual_end_date: string | null;
  manager_id: string | null;
}

export interface MOCDetail extends MOCSummary {
  nature: "OPTIMISATION" | "SECURITE" | null;
  metiers: string[] | null;
  initiator_id: string;
  initiator_email: string | null;
  initiator_function: string | null;
  objectives: string | null;
  description: string | null;
  current_situation: string | null;
  proposed_changes: string | null;
  impact_analysis: string | null;
  modification_type: "permanent" | "temporary" | null;
  temporary_start_date: string | null;
  temporary_end_date: string | null;
  is_real_change: boolean | null;
  site_chief_approved: boolean | null;
  site_chief_comment: string | null;
  production_validated: boolean | null;
  production_comment: string | null;
  do_execution_accord: boolean | null;
  dg_execution_accord: boolean | null;
  cost_bucket: string | null;
  estimated_cost_mxaf: number | null;
  hazop_required: boolean;
  hazop_completed: boolean;
  hazid_required: boolean;
  hazid_completed: boolean;
  environmental_required: boolean;
  environmental_completed: boolean;
  pid_update_required: boolean;
  pid_update_completed: boolean;
  esd_update_required: boolean;
  esd_update_completed: boolean;
  validations: MOCValidationEntry[];
  status_history: MOCStatusHistoryEntry[];
  linked_project?: MOCLinkedProject | null;
}

export interface MOCListFilters {
  status?: MOCStatus;
  site_label?: string;
  priority?: MOCPriority;
  search?: string;
  manager_id?: string;
  mine_as_manager?: boolean;
  has_project?: boolean;
  page?: number;
  page_size?: number;
}

/** List MOCs — offline-aware, returns cached data when the device is offline. */
export async function listMOCs(
  filters: MOCListFilters = {},
): Promise<PaginatedResponse<MOCSummary>> {
  const { data } = await fetchWithOfflineFallback<PaginatedResponse<MOCSummary>>(
    "/api/v1/moc",
    filters as Record<string, unknown>,
  );
  return data;
}

/** Fetch MOC detail — includes history + validations + linked_project. */
export async function getMOC(id: string): Promise<MOCDetail> {
  const { data } = await fetchWithOfflineFallback<MOCDetail>(
    `/api/v1/moc/${id}`,
  );
  return data;
}

/** Download the MOC PDF as a blob. Caller handles persistence via
 *  expo-file-system / Sharing. Language defaults to French (Perenco form). */
export async function downloadMOCPdf(
  id: string,
  language: "fr" | "en" = "fr",
): Promise<Blob> {
  const response = await api.get<Blob>(`/api/v1/moc/${id}/pdf`, {
    params: { language },
    responseType: "blob",
  });
  return response.data as unknown as Blob;
}

// ─── Phase 2 writes ──────────────────────────────────────────────────────

export type SignatureSlot =
  | "initiator"
  | "hierarchy_reviewer"
  | "site_chief"
  | "production"
  | "director"
  | "process_engineer"
  | "do"
  | "dg"
  | "close";

export interface TransitionPayload {
  to_status: MOCStatus;
  comment?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface CreateMOCPayload {
  title?: string | null;
  nature?: "OPTIMISATION" | "SECURITE" | null;
  metiers?: string[] | null;
  installation_id?: string | null;
  site_label?: string | null;
  platform_code?: string | null;
  objectives?: string | null;
  description?: string | null;
  current_situation?: string | null;
  proposed_changes?: string | null;
  impact_analysis?: string | null;
  modification_type?: "permanent" | "temporary" | null;
  initiator_signature?: string | null;
  initiator_email?: string | null;
  initiator_function?: string | null;
  manager_id?: string | null;
}

/** Fire a FSM transition. Backend enforces preconditions; we surface a
 *  readable error message when it refuses. */
export async function transitionMOC(
  id: string,
  payload: TransitionPayload,
): Promise<MOCDetail> {
  const { data } = await api.post<MOCDetail>(
    `/api/v1/moc/${id}/transition`,
    payload,
  );
  return data;
}

/** Store a signature at a named slot. SVG or PNG data URL — the backend
 *  treats them identically and both render in the PDF. */
export async function setMOCSignature(
  id: string,
  slot: SignatureSlot,
  signature: string,
): Promise<MOCDetail> {
  const { data } = await api.post<MOCDetail>(`/api/v1/moc/${id}/signature`, {
    slot,
    signature,
  });
  return data;
}

/** Request a return-for-rework at a specific stage. `stage=validator`
 *  requires `validation_id`. */
export async function requestMOCReturn(
  id: string,
  payload: {
    stage: "site_chief" | "production" | "do" | "dg" | "validator";
    reason: string;
    validation_id?: string;
  },
): Promise<MOCDetail> {
  const { data } = await api.post<MOCDetail>(
    `/api/v1/moc/${id}/return`,
    payload,
  );
  return data;
}

/** Production mise-en-étude (Daxium tab 3). */
export async function setProductionValidation(
  id: string,
  payload: {
    validated: boolean;
    comment?: string | null;
    signature?: string | null;
    priority?: MOCPriority | null;
    return_requested?: boolean;
    return_reason?: string | null;
  },
): Promise<MOCDetail> {
  const { data } = await api.post<MOCDetail>(
    `/api/v1/moc/${id}/production-validation`,
    payload,
  );
  return data;
}

/** DO / DG accord or refus (+ optional signature). */
export async function setExecutionAccord(
  id: string,
  payload: {
    actor: "do" | "dg";
    accord: boolean;
    comment?: string | null;
    signature?: string | null;
    return_requested?: boolean;
    return_reason?: string | null;
  },
): Promise<MOCDetail> {
  const { data } = await api.post<MOCDetail>(
    `/api/v1/moc/${id}/execution-accord`,
    payload,
  );
  return data;
}

/** Promote a validated MOC to a Project. Idempotent — 409 on re-promote. */
export async function promoteMOCToProject(id: string): Promise<MOCDetail> {
  const { data } = await api.post<MOCDetail>(
    `/api/v1/moc/${id}/promote-to-project`,
  );
  return data;
}

/** Create a new MOC — returns the created record (MOCRead shape). */
export async function createMOC(payload: CreateMOCPayload): Promise<MOCDetail> {
  const { data } = await api.post<MOCDetail>(`/api/v1/moc`, payload);
  return data;
}

/** Humanised status → FR label (matches the web app). Keep in sync with
 *  `MOC_STATUS_LABELS` in apps/main/src/services/mocService.ts. */
export const MOC_STATUS_LABELS: Record<MOCStatus, string> = {
  created: "Créé",
  approved: "Approuvé",
  submitted_to_confirm: "Soumis à confirmer",
  cancelled: "Annulé",
  stand_by: "Stand-by",
  approved_to_study: "Confirmé à étudier",
  under_study: "En étude Process",
  study_in_validation: "Étudié en validation",
  validated: "Validé à exécuter",
  execution: "Exécution",
  executed_docs_pending: "Exécuté, docs à MAJ",
  closed: "Clôturé",
};
