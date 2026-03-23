/**
 * Conformite (compliance) API service.
 */
import api from '@/lib/api'
import type {
  ComplianceType, ComplianceTypeCreate, ComplianceTypeUpdate,
  ComplianceRule, ComplianceRuleCreate,
  ComplianceRecord, ComplianceRecordCreate, ComplianceRecordUpdate,
  ComplianceCheckResult,
  ComplianceExemption, ComplianceExemptionCreate, ComplianceExemptionUpdate,
  JobPosition, JobPositionCreate, JobPositionUpdate,
  TierContactTransfer, TierContactTransferCreate,
  PaginatedResponse, PaginationParams,
} from '@/types/api'

interface ComplianceTypeListParams extends PaginationParams {
  category?: string
  search?: string
}

interface ComplianceRecordListParams extends PaginationParams {
  owner_type?: string
  owner_id?: string
  compliance_type_id?: string
  status?: string
  category?: string
  search?: string
}

export const conformiteService = {
  // ── Types (referentiel) ──
  listTypes: async (params: ComplianceTypeListParams = {}): Promise<PaginatedResponse<ComplianceType>> => {
    const { data } = await api.get('/api/v1/conformite/types', { params })
    return data
  },

  createType: async (payload: ComplianceTypeCreate): Promise<ComplianceType> => {
    const { data } = await api.post('/api/v1/conformite/types', payload)
    return data
  },

  updateType: async (id: string, payload: ComplianceTypeUpdate): Promise<ComplianceType> => {
    const { data } = await api.patch(`/api/v1/conformite/types/${id}`, payload)
    return data
  },

  deleteType: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/conformite/types/${id}`)
  },

  // ── Rules ──
  listRules: async (complianceTypeId?: string): Promise<ComplianceRule[]> => {
    const params = complianceTypeId ? { compliance_type_id: complianceTypeId } : {}
    const { data } = await api.get('/api/v1/conformite/rules', { params })
    return data
  },

  createRule: async (payload: ComplianceRuleCreate): Promise<ComplianceRule> => {
    const { data } = await api.post('/api/v1/conformite/rules', payload)
    return data
  },

  updateRule: async (id: string, payload: Partial<ComplianceRuleCreate>): Promise<ComplianceRule> => {
    const { data } = await api.patch(`/api/v1/conformite/rules/${id}`, payload)
    return data
  },

  deleteRule: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/conformite/rules/${id}`)
  },

  // ── Records ──
  listRecords: async (params: ComplianceRecordListParams = {}): Promise<PaginatedResponse<ComplianceRecord>> => {
    const { data } = await api.get('/api/v1/conformite/records', { params })
    return data
  },

  createRecord: async (payload: ComplianceRecordCreate): Promise<ComplianceRecord> => {
    const { data } = await api.post('/api/v1/conformite/records', payload)
    return data
  },

  updateRecord: async (id: string, payload: ComplianceRecordUpdate): Promise<ComplianceRecord> => {
    const { data } = await api.patch(`/api/v1/conformite/records/${id}`, payload)
    return data
  },

  deleteRecord: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/conformite/records/${id}`)
  },

  // ── Check ──
  checkCompliance: async (ownerType: string, ownerId: string): Promise<ComplianceCheckResult> => {
    const { data } = await api.get(`/api/v1/conformite/check/${ownerType}/${ownerId}`)
    return data
  },

  // ── Job Positions (fiches de poste) ──
  listJobPositions: async (params: PaginationParams & { department?: string; search?: string } = {}): Promise<PaginatedResponse<JobPosition>> => {
    const { data } = await api.get('/api/v1/conformite/job-positions', { params })
    return data
  },

  createJobPosition: async (payload: JobPositionCreate): Promise<JobPosition> => {
    const { data } = await api.post('/api/v1/conformite/job-positions', payload)
    return data
  },

  updateJobPosition: async (id: string, payload: JobPositionUpdate): Promise<JobPosition> => {
    const { data } = await api.patch(`/api/v1/conformite/job-positions/${id}`, payload)
    return data
  },

  deleteJobPosition: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/conformite/job-positions/${id}`)
  },

  // ── Exemptions ──
  listExemptions: async (params: PaginationParams & { status?: string; compliance_type_id?: string; search?: string } = {}): Promise<PaginatedResponse<ComplianceExemption>> => {
    const { data } = await api.get('/api/v1/conformite/exemptions', { params })
    return data
  },

  createExemption: async (payload: ComplianceExemptionCreate): Promise<ComplianceExemption> => {
    const { data } = await api.post('/api/v1/conformite/exemptions', payload)
    return data
  },

  updateExemption: async (id: string, payload: ComplianceExemptionUpdate): Promise<ComplianceExemption> => {
    const { data } = await api.patch(`/api/v1/conformite/exemptions/${id}`, payload)
    return data
  },

  approveExemption: async (id: string): Promise<ComplianceExemption> => {
    const { data } = await api.post(`/api/v1/conformite/exemptions/${id}/approve`)
    return data
  },

  rejectExemption: async (id: string, reason: string): Promise<ComplianceExemption> => {
    const { data } = await api.post(`/api/v1/conformite/exemptions/${id}/reject`, { reason })
    return data
  },

  deleteExemption: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/conformite/exemptions/${id}`)
  },

  // ── Employee Transfers ──
  listTransfers: async (params: PaginationParams & { contact_id?: string; from_tier_id?: string; to_tier_id?: string } = {}): Promise<PaginatedResponse<TierContactTransfer>> => {
    const { data } = await api.get('/api/v1/conformite/transfers', { params })
    return data
  },

  createTransfer: async (payload: TierContactTransferCreate): Promise<TierContactTransfer> => {
    const { data } = await api.post('/api/v1/conformite/transfers', payload)
    return data
  },

  // ── Verification ──

  listPendingVerifications: async (): Promise<{ items: PendingVerificationItem[]; total: number }> => {
    const { data } = await api.get('/api/v1/conformite/pending-verifications')
    return data
  },

  verifyRecord: async (recordType: string, recordId: string, action: 'verify' | 'reject', rejectionReason?: string): Promise<unknown> => {
    const { data } = await api.post(`/api/v1/conformite/verify/${recordType}/${recordId}`, {
      action, rejection_reason: rejectionReason || null,
    })
    return data
  },
}

export interface PendingVerificationItem {
  id: string
  record_type: string
  owner_type: string | null
  owner_id: string | null
  owner_name: string | null
  description: string
  submitted_at: string
  verification_status: string
}
