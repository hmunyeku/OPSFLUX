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

export interface AgentReportFile {
  path: string
  lines_added: number
  lines_removed: number
  purpose: string
}

export interface AgentReport {
  status: 'success' | 'partial' | 'failed'
  failure_reason?: string | null
  phases_completed?: string[]
  root_cause?: string
  files_modified?: AgentReportFile[]
  tests_added?: { path: string; name: string }[]
  pr?: {
    number?: number | null
    url?: string | null
    branch?: string
    commit_sha?: string
  }
  metrics?: {
    total_tokens_used?: number
    wall_time_seconds?: number
    iterations_required?: number
  }
  reasoning_summary?: string
  warnings?: string[]
  next_steps_recommended?: string[]
}

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
  report_json: AgentReport | null
  failed_gates: Record<string, { ok: boolean; message: string; details?: Record<string, unknown> }> | null
}

export interface AgentLogEntry {
  timestamp: string | null
  type: 'init' | 'agent_text' | 'bash' | 'edit' | 'read' | 'grep' | 'todo' | 'tool' | 'error' | 'end'
  summary: string
  is_error: boolean
}

export function useAgentLogExcerpt(runId: string | null, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['agent-run-logs', runId],
    queryFn: async () => {
      if (!runId) return []
      const { data } = await api.get<AgentLogEntry[]>(
        `/api/v1/support/agent/runs/${runId}/log-excerpt`,
        { params: { limit: 300 } },
      )
      return data
    },
    enabled: opts?.enabled !== false && !!runId,
  })
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

export interface VerificationResult {
  id: string
  scenario_id: string | null
  scenario_name: string
  criticality: 'critical' | 'important' | 'nice_to_have'
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'error'
  duration_seconds: number | null
  error_excerpt: string | null
  screenshots_paths: string[]
  video_path: string | null
  console_errors: string[]
  target_url: string | null
  started_at: string | null
  ended_at: string | null
}

export function useVerificationResults(runId: string | null) {
  return useQuery({
    queryKey: ['agent-run-verification', runId],
    queryFn: async () => {
      if (!runId) return []
      const { data } = await api.get<VerificationResult[]>(
        `/api/v1/support/agent/runs/${runId}/verification-results`,
      )
      return data
    },
    enabled: !!runId,
  })
}

export function useDeployAndVerify() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data } = await api.post(
        `/api/v1/support/agent/runs/${runId}/deploy-and-verify`,
      )
      return data as {
        deploy_ok: boolean
        deploy_message?: string
        deploy_url?: string
        total?: number
        passed?: number
        failed?: number
        critical_failures?: number
      }
    },
    onSuccess: (_, runId) => {
      qc.invalidateQueries({ queryKey: ['agent-run-verification', runId] })
      qc.invalidateQueries({ queryKey: ['agent-runs'] })
    },
  })
}

export function useRetryCiAgentRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data } = await api.post<AgentRun>(`/api/v1/support/agent/runs/${runId}/retry-ci`)
      return data
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['agent-runs', 'ticket', run.ticket_id] })
      qc.invalidateQueries({ queryKey: ['agent-supervision'] })
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
  // Sprint 7 — scheduler
  auto_window_start_hour?: number | null
  auto_window_end_hour?: number | null
  auto_max_runs_per_window?: number
  auto_report_email?: string | null
  auto_report_hour_utc?: number
  last_digest_sent_at?: string | null
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
