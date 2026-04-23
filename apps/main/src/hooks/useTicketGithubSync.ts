/**
 * Hooks for Support ↔ GitHub bidirectional sync (Sprint 2).
 *
 * The GitHub sync state already lives on the ticket read payload
 * (`github_connection_id`, `github_issue_number`, etc.), so we don't
 * need a separate fetch — just the mutations.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export function useEnableTicketGithubSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ticketId, connectionId }: { ticketId: string; connectionId: string }) => {
      const { data } = await api.post(
        `/api/v1/support/tickets/${ticketId}/github-sync/enable`,
        { connection_id: connectionId },
      )
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ticket', vars.ticketId] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export function useDisableTicketGithubSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ticketId: string) => {
      const { data } = await api.post(`/api/v1/support/tickets/${ticketId}/github-sync/disable`)
      return data
    },
    onSuccess: (_, ticketId) => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}
