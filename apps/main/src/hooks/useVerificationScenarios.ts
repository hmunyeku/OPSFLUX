/**
 * CRUD hooks for Playwright verification scenarios (Sprint 6).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export type ScenarioCriticality = 'critical' | 'important' | 'nice_to_have'
export type ScenarioLanguage = 'typescript' | 'python'

export interface VerificationScenario {
  id: string
  entity_id: string
  name: string
  description: string | null
  tags: string[]
  script_language: ScenarioLanguage
  script_content: string
  expected_assertions: string[]
  timeout_seconds: number
  is_smoke_test: boolean
  criticality: ScenarioCriticality
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface ScenarioCreate {
  name: string
  description?: string
  tags?: string[]
  script_language?: ScenarioLanguage
  script_content: string
  expected_assertions?: string[]
  timeout_seconds?: number
  is_smoke_test?: boolean
  criticality?: ScenarioCriticality
  enabled?: boolean
}

export type ScenarioUpdate = Partial<ScenarioCreate>

const BASE = '/api/v1/support/verification-scenarios'

export function useVerificationScenarios() {
  return useQuery({
    queryKey: ['verification-scenarios'],
    queryFn: async () => {
      const { data } = await api.get<VerificationScenario[]>(BASE)
      return data
    },
  })
}

export function useCreateVerificationScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: ScenarioCreate) => {
      const { data } = await api.post<VerificationScenario>(BASE, body)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['verification-scenarios'] }),
  })
}

export function useUpdateVerificationScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: ScenarioUpdate & { id: string }) => {
      const { data } = await api.patch<VerificationScenario>(`${BASE}/${id}`, body)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['verification-scenarios'] }),
  })
}

export function useDeleteVerificationScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${BASE}/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['verification-scenarios'] }),
  })
}
