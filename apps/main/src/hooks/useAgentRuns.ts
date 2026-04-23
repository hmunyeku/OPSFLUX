/**
 * Hooks for the autonomous maintenance agent (Sprint 3+).
 *
 * The runs list is polled every 3 seconds while a run is active so the
 * UI stepper advances without WebSocket plumbing. Once the run is in a
 * terminal status the polling stops (React Query `refetchInterval`
 * returns `false`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export type AgentAutonomyMode = 'observation' | 'recommendation' | 'autonomous_with_approval'
export type AgentRunStatus =
  | 'pending'
  | 'preparing'
  | 'running'
  | 'awaiting_human'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected'
  | 'failed_and_reverted'

export type AgentPhase =
  | 'triage'
  | 'reproduction'
  | 'diagnosis'
  | 'fix'
  | 'deploy'
  | 'verification'
  | 'report'
  | 'post_merge'

export interface AgentRun {
  id: string
  ticket_id: string
  entity_id: string
  status: AgentRunStatus
  current_phase: AgentPhase
  autonomy_mode: AgentAutonomyMode
  deployment_mode: 'A' | 'B' | 'C'
  github_branch: string | null
  github_pr_number: number | null
  github_pr_url: string | null
  github_commit_sha: string | null
  dokploy_deploy_url: string | null
  llm_tokens_used: number
  llm_cost_usd: number
  wall_time_seconds: number | null
  error_message: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
}

const TERMINAL: AgentRunStatus[] = ['completed', 'failed', 'cancelled', 'rejected', 'failed_and_reverted']

export function useAgentRunsForTicket(ticketId: string) {
  return useQuery({
    queryKey: ['agent-runs', 'ticket', ticketId],
    queryFn: async () => {
      const { data } = await api.get<AgentRun[]>('/api/v1/support/agent/runs', {
        params: { ticket_id: ticketId },
      })
      return data
    },
    refetchInterval: (query) => {
      const runs = query.state.data as AgentRun[] | undefined
      const hasActive = (runs ?? []).some((r) => !TERMINAL.includes(r.status))
      return hasActive ? 3000 : false
    },
  })
}

export function useLaunchAgentRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { ticket_id: string; autonomy_mode?: AgentAutonomyMode }) => {
      const { data } = await api.post<AgentRun>('/api/v1/support/agent/runs', body)
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['agent-runs', 'ticket', vars.ticket_id] })
    },
  })
}

export function useCancelAgentRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data } = await api.post<AgentRun>(`/api/v1/support/agent/runs/${runId}/cancel`)
      return data
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['agent-runs', 'ticket', run.ticket_id] })
    },
  })
}

export function useApproveAgentRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data } = await api.post<AgentRun>(`/api/v1/support/agent/runs/${runId}/approve`)
      return data
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['agent-runs', 'ticket', run.ticket_id] })
      qc.invalidateQueries({ queryKey: ['ticket', run.ticket_id] })
    },
  })
}

export function useRejectAgentRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ runId, reason }: { runId: string; reason?: string }) => {
      const { data } = await api.post<AgentRun>(`/api/v1/support/agent/runs/${runId}/reject`, {
        reason,
      })
      return data
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['agent-runs', 'ticket', run.ticket_id] })
    },
  })
}

export interface AgentConfig {
  enabled: boolean
  default_autonomy_mode: AgentAutonomyMode
  max_concurrent_runs: number
  monthly_budget_usd: number
  current_month_spent_usd: number
  current_consecutive_failures: number
  circuit_breaker_tripped_at: string | null
  allow_direct_deployment: boolean
}

export function useAgentConfig() {
  return useQuery({
    queryKey: ['agent-config'],
    queryFn: async () => {
      const { data } = await api.get<AgentConfig>('/api/v1/support/agent/config')
      return data
    },
  })
}

export function useUpdateAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<AgentConfig>) => {
      const { data } = await api.patch<AgentConfig>('/api/v1/support/agent/config', body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-config'] })
    },
  })
}
