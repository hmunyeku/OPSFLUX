/**
 * MOC (Management of Change) API client.
 *
 * Mirrors app/api/routes/modules/moc.py + app/schemas/moc.py. Keep in
 * sync when the backend schema changes.
 */
import api from '@/lib/api'
import type { PaginatedResponse } from '@/types/api'

// ── Types ──────────────────────────────────────────────────

export type MOCStatus =
  | 'created'
  | 'approved'
  | 'submitted_to_confirm'
  | 'cancelled'
  | 'stand_by'
  | 'approved_to_study'
  | 'under_study'
  | 'study_in_validation'
  | 'validated'
  | 'execution'
  | 'executed_docs_pending'
  | 'closed'

export type MOCModificationType = 'permanent' | 'temporary'
export type MOCPriority = '1' | '2' | '3'
export type MOCCostBucket = 'lt_20' | '20_to_50' | '50_to_100' | 'gt_100'
export type MOCValidationLevel = 'DO' | 'DG' | 'DO_AND_DG'
export type MOCValidationRole =
  | 'hse'
  | 'lead_process'
  | 'production_manager'
  | 'gas_manager'
  | 'maintenance_manager'
  | 'process_engineer'
  | 'metier'

export type MOCSiteRole =
  | 'site_chief'
  | 'director'
  | 'lead_process'
  | 'hse'
  | 'production_manager'
  | 'gas_manager'
  | 'maintenance_manager'

export interface MOCSiteAssignment {
  id: string
  site_label: string
  role: MOCSiteRole
  user_id: string
  user_display: string | null
  active: boolean
  created_at: string
}

export interface MOCStatusHistoryEntry {
  id: string
  old_status: MOCStatus | null
  new_status: MOCStatus
  changed_by: string
  changed_by_name: string | null
  note: string | null
  created_at: string
}

export interface MOCValidation {
  id: string
  role: MOCValidationRole
  metier_code: string | null
  metier_name: string | null
  required: boolean
  completed: boolean
  approved: boolean | null
  validator_id: string | null
  validator_name: string | null
  level: MOCValidationLevel | null
  comments: string | null
  validated_at: string | null
}

export interface MOC {
  id: string
  reference: string
  status: MOCStatus
  status_changed_at: string
  created_at: string
  updated_at: string
  // Location
  site_label: string
  site_id: string | null
  platform_code: string
  installation_id: string | null
  // Initiator
  initiator_id: string
  initiator_name: string | null
  initiator_function: string | null
  initiator_display: string | null
  // Content
  objectives: string | null
  description: string | null
  current_situation: string | null
  proposed_changes: string | null
  impact_analysis: string | null
  modification_type: MOCModificationType | null
  temporary_duration_days: number | null
  // Hierarchy review
  is_real_change: boolean | null
  hierarchy_reviewer_id: string | null
  hierarchy_review_at: string | null
  hierarchy_review_comment: string | null
  // Site chief
  site_chief_approved: boolean | null
  site_chief_id: string | null
  site_chief_approved_at: string | null
  site_chief_comment: string | null
  site_chief_display: string | null
  // Director
  director_id: string | null
  director_confirmed_at: string | null
  director_comment: string | null
  director_display: string | null
  priority: MOCPriority | null
  // Study
  lead_process_id: string | null
  responsible_id: string | null
  responsible_display: string | null
  study_started_at: string | null
  study_completed_at: string | null
  estimated_cost_mxaf: number | null
  cost_bucket: MOCCostBucket | null
  // Validation flags
  hazop_required: boolean
  hazop_completed: boolean
  hazid_required: boolean
  hazid_completed: boolean
  environmental_required: boolean
  environmental_completed: boolean
  pid_update_required: boolean
  pid_update_completed: boolean
  esd_update_required: boolean
  esd_update_completed: boolean
  // Execution
  execution_started_at: string | null
  execution_completed_at: string | null
  execution_supervisor_id: string | null
  planned_implementation_date: string | null
  actual_implementation_date: string | null
  // DO / DG execution accords (paper form p.5 "Réalisation du MOC")
  do_execution_accord: boolean | null
  dg_execution_accord: boolean | null
  do_execution_accord_at: string | null
  dg_execution_accord_at: string | null
  do_execution_accord_by: string | null
  dg_execution_accord_by: string | null
  do_execution_comment: string | null
  dg_execution_comment: string | null
  // Extras
  tags: string[] | null
  metadata: Record<string, unknown> | null
}

export interface MOCWithDetails extends MOC {
  status_history: MOCStatusHistoryEntry[]
  validations: MOCValidation[]
}

export interface MOCCreatePayload {
  initiator_name?: string | null
  initiator_function?: string | null
  // Either installation_id alone (backend auto-derives site/platform from
  // the asset registry hierarchy) OR both site_label + platform_code.
  site_label?: string | null
  site_id?: string | null
  platform_code?: string | null
  installation_id?: string | null
  objectives?: string | null
  description?: string | null
  current_situation?: string | null
  proposed_changes?: string | null
  impact_analysis?: string | null
  modification_type?: MOCModificationType | null
  temporary_duration_days?: number | null
  planned_implementation_date?: string | null
  tags?: string[] | null
}

export type MOCUpdatePayload = Partial<MOC>

export interface MOCTransitionPayload {
  to_status: MOCStatus
  comment?: string | null
  payload?: Record<string, unknown> | null
}

export interface MOCValidationUpsertPayload {
  role: MOCValidationRole
  metier_code?: string | null
  metier_name?: string | null
  required?: boolean | null
  completed?: boolean | null
  approved?: boolean | null
  level?: MOCValidationLevel | null
  comments?: string | null
}

export interface MOCExecutionAccordPayload {
  actor: 'do' | 'dg'
  accord: boolean
  comment?: string | null
}

export interface MOCSiteAssignmentCreatePayload {
  site_label: string
  role: MOCSiteRole
  user_id: string
  active?: boolean
}

export interface MOCListFilters {
  status?: MOCStatus
  site_label?: string
  platform_code?: string
  priority?: MOCPriority
  search?: string
  initiator_id?: string
  page?: number
  page_size?: number
}

export interface MOCFsmDescription {
  statuses: MOCStatus[]
  transitions: Record<MOCStatus, { to: MOCStatus; permission: string }[]>
}

export interface MOCStatsSummary {
  total: number
  by_status: { status: string; count: number }[]
  by_site: { site_label: string; count: number; percentage: number }[]
  by_type: { modification_type: string; count: number; percentage: number }[]
  by_priority: { status: string; count: number }[]
  avg_cycle_time_days: number | null
}

// ── API calls ──────────────────────────────────────────────

const BASE = '/api/v1/moc'

export const mocService = {
  list: async (filters: MOCListFilters = {}): Promise<PaginatedResponse<MOC>> => {
    const { data } = await api.get<PaginatedResponse<MOC>>(BASE, { params: filters })
    return data
  },

  get: async (id: string): Promise<MOCWithDetails> => {
    const { data } = await api.get<MOCWithDetails>(`${BASE}/${id}`)
    return data
  },

  create: async (payload: MOCCreatePayload): Promise<MOC> => {
    const { data } = await api.post<MOC>(BASE, payload)
    return data
  },

  update: async (id: string, payload: MOCUpdatePayload): Promise<MOC> => {
    const { data } = await api.patch<MOC>(`${BASE}/${id}`, payload)
    return data
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`)
  },

  transition: async (
    id: string,
    payload: MOCTransitionPayload,
  ): Promise<MOCWithDetails> => {
    const { data } = await api.post<MOCWithDetails>(
      `${BASE}/${id}/transition`,
      payload,
    )
    return data
  },

  upsertValidation: async (
    id: string,
    payload: MOCValidationUpsertPayload,
  ): Promise<MOCValidation> => {
    const { data } = await api.post<MOCValidation>(
      `${BASE}/${id}/validations`,
      payload,
    )
    return data
  },

  fsm: async (): Promise<MOCFsmDescription> => {
    const { data } = await api.get<MOCFsmDescription>(`${BASE}/fsm`)
    return data
  },

  stats: async (): Promise<MOCStatsSummary> => {
    const { data } = await api.get<MOCStatsSummary>(`${BASE}/stats`)
    return data
  },

  executionAccord: async (
    id: string,
    payload: MOCExecutionAccordPayload,
  ): Promise<MOCWithDetails> => {
    const { data } = await api.post<MOCWithDetails>(
      `${BASE}/${id}/execution-accord`,
      payload,
    )
    return data
  },

  listSiteAssignments: async (
    site_label?: string,
  ): Promise<MOCSiteAssignment[]> => {
    const { data } = await api.get<MOCSiteAssignment[]>(
      `${BASE}/site-assignments`,
      { params: site_label ? { site_label } : undefined },
    )
    return data
  },

  createSiteAssignment: async (
    payload: MOCSiteAssignmentCreatePayload,
  ): Promise<MOCSiteAssignment> => {
    const { data } = await api.post<MOCSiteAssignment>(
      `${BASE}/site-assignments`,
      payload,
    )
    return data
  },

  deleteSiteAssignment: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/site-assignments/${id}`)
  },
}

/** Localised labels for each MOC status. */
export const MOC_STATUS_LABELS: Record<MOCStatus, string> = {
  created: 'Créé',
  approved: 'Approuvé',
  submitted_to_confirm: 'Soumis à confirmer',
  cancelled: 'Annulé',
  stand_by: 'Stand-by',
  approved_to_study: 'Confirmé à étudier',
  under_study: 'En étude Process',
  study_in_validation: 'Étudié en validation',
  validated: 'Validé à exécuter',
  execution: 'Exécution',
  executed_docs_pending: 'Exécuté, PID/ESD à MAJ',
  closed: 'Clôturé',
}

export const MOC_STATUS_COLOURS: Record<MOCStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  created: 'neutral',
  approved: 'info',
  submitted_to_confirm: 'info',
  cancelled: 'danger',
  stand_by: 'warning',
  approved_to_study: 'info',
  under_study: 'warning',
  study_in_validation: 'warning',
  validated: 'success',
  execution: 'info',
  executed_docs_pending: 'warning',
  closed: 'success',
}

/** Ordered list of statuses for progress bars. */
export const MOC_STATUS_ORDER: MOCStatus[] = [
  'created',
  'approved',
  'submitted_to_confirm',
  'approved_to_study',
  'under_study',
  'study_in_validation',
  'validated',
  'execution',
  'executed_docs_pending',
  'closed',
]
