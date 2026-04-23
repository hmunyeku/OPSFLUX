/**
 * useIntegrationConnections — React Query hooks for heavy integration
 * connectors (GitHub, Dokploy, Agent Runner).
 *
 * Lives alongside the legacy `Setting`-based light integrations hook.
 * CRUD + "Test connection" endpoint wired to /api/v1/integration-connections.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export type IntegrationConnectionType = 'github' | 'dokploy' | 'agent_runner'
export type IntegrationConnectionStatus = 'active' | 'suspended' | 'error' | 'disabled'

export interface IntegrationConnection {
  id: string
  entity_id: string
  connection_type: IntegrationConnectionType
  name: string
  config: Record<string, unknown>
  status: IntegrationConnectionStatus
  last_tested_at: string | null
  last_test_result: {
    ok: boolean
    message: string
    details?: Record<string, unknown>
    tested_at?: string
  } | null
  created_at: string
  updated_at: string
  credentials_preview: Record<string, string>
}

export interface TestResult {
  ok: boolean
  message: string
  details: Record<string, unknown>
  tested_at: string
}

export interface ConnectionCreate {
  connection_type: IntegrationConnectionType
  name: string
  config: Record<string, unknown>
  credentials: Record<string, unknown>
}

export interface ConnectionUpdate {
  name?: string
  config?: Record<string, unknown>
  credentials?: Record<string, unknown>
  status?: IntegrationConnectionStatus
}

const BASE = '/api/v1/integration-connections'

export function useIntegrationConnections(connectionType?: IntegrationConnectionType) {
  return useQuery({
    queryKey: ['integration-connections', connectionType ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get<IntegrationConnection[]>(BASE, {
        params: connectionType ? { connection_type: connectionType } : {},
      })
      return data
    },
  })
}

export function useCreateIntegrationConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: ConnectionCreate) => {
      const { data } = await api.post<IntegrationConnection>(BASE, body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integration-connections'] })
    },
  })
}

export function useUpdateIntegrationConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: ConnectionUpdate & { id: string }) => {
      const { data } = await api.patch<IntegrationConnection>(`${BASE}/${id}`, body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integration-connections'] })
    },
  })
}

export function useDeleteIntegrationConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${BASE}/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integration-connections'] })
    },
  })
}

export function useTestIntegrationConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<TestResult>(`${BASE}/${id}/test`)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integration-connections'] })
    },
  })
}
