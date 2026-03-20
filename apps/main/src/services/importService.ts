import api from '@/lib/api'
import type {
  ImportTargetObject,
  TargetObjectInfo,
  ImportMapping,
  ImportMappingCreate,
  ImportPreviewResponse,
  ImportExecuteResponse,
  DuplicateStrategy,
} from '@/types/api'

export const importService = {
  getTargets: async (): Promise<TargetObjectInfo[]> => {
    const { data } = await api.get('/api/v1/import/targets')
    return data
  },

  autoDetect: async (
    targetObject: ImportTargetObject,
    fileHeaders: string[],
  ): Promise<{ suggested_mapping: Record<string, string>; confidence: Record<string, number> }> => {
    const { data } = await api.post('/api/v1/import/auto-detect', {
      target_object: targetObject,
      file_headers: fileHeaders,
    })
    return data
  },

  validate: async (params: {
    target_object: ImportTargetObject
    column_mapping: Record<string, string>
    rows: Record<string, unknown>[]
    duplicate_strategy: DuplicateStrategy
  }): Promise<ImportPreviewResponse> => {
    const { data } = await api.post('/api/v1/import/validate', params)
    return data
  },

  execute: async (params: {
    target_object: ImportTargetObject
    column_mapping: Record<string, string>
    rows: Record<string, unknown>[]
    duplicate_strategy: DuplicateStrategy
    mapping_id?: string
  }): Promise<ImportExecuteResponse> => {
    const { data } = await api.post('/api/v1/import/execute', params)
    return data
  },

  listMappings: async (targetObject?: string): Promise<ImportMapping[]> => {
    const { data } = await api.get('/api/v1/import/mappings', {
      params: targetObject ? { target_object: targetObject } : {},
    })
    return data
  },

  createMapping: async (payload: ImportMappingCreate): Promise<ImportMapping> => {
    const { data } = await api.post('/api/v1/import/mappings', payload)
    return data
  },

  deleteMapping: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/import/mappings/${id}`)
  },

  // ── User Sync from external providers ──
  userSyncProviders: () =>
    api.get<{ id: string; label: string; configured: boolean; last_sync_at: string | null }[]>('/api/v1/user-sync/providers').then(r => r.data),

  userSyncPreview: (provider: string) =>
    api.post<{
      provider: string
      total: number
      users: Array<{
        external_ref: string
        email: string
        first_name: string
        last_name: string
        department: string | null
        position: string | null
        phone: string | null
        groups: string[]
        active: boolean
        already_exists: boolean
      }>
      new_count: number
      existing_count: number
    }>('/api/v1/user-sync/preview', { provider }).then(r => r.data),

  userSyncExecute: (params: {
    provider: string
    selected_emails: string[]
    group_mapping: Array<{ source_group: string; target_group_id: string | null }>
    duplicate_strategy: 'skip' | 'update'
    default_password?: string
  }) =>
    api.post<{ created: number; updated: number; skipped: number; errors: string[] }>(
      '/api/v1/user-sync/execute', params
    ).then(r => r.data),
}
