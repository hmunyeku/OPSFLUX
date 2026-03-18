/**
 * Conformite (compliance) API service.
 */
import api from '@/lib/api'
import type {
  ComplianceType, ComplianceTypeCreate, ComplianceTypeUpdate,
  ComplianceRule, ComplianceRuleCreate,
  ComplianceRecord, ComplianceRecordCreate, ComplianceRecordUpdate,
  ComplianceCheckResult,
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
}
