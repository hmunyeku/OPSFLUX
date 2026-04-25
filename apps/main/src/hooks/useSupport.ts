/**
 * React Query hooks for Support module — tickets, comments, stats.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supportService, type TicketCreate, type TicketUpdate } from '@/services/supportService'

export function useTickets(params: {
  page?: number; page_size?: number; status?: string; priority?: string;
  ticket_type?: string; assignee_id?: string; search?: string
} = {}) {
  return useQuery({
    queryKey: ['support-tickets', params],
    queryFn: () => supportService.listTickets(params),
  })
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['support-tickets', id],
    queryFn: () => supportService.getTicket(id),
    enabled: !!id,
  })
}

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TicketCreate) => supportService.createTicket(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })
}

export function useUpdateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TicketUpdate }) =>
      supportService.updateTicket(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })
}

export function useDeleteTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => supportService.deleteTicket(id),
    onSuccess: (_data, id) => {
      // Remove the specific ticket + related queries before invalidating list
      // to prevent a 404 refetch on the now-archived ticket
      qc.removeQueries({ queryKey: ['support-tickets', id] })
      qc.removeQueries({ queryKey: ['support-comments', id] })
      qc.removeQueries({ queryKey: ['support-history', id] })
      qc.invalidateQueries({ queryKey: ['support-tickets'] })
      qc.invalidateQueries({ queryKey: ['support-stats'] })
    },
  })
}

export function useAssignTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) =>
      supportService.assignTicket(id, assigneeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })
}

export function useResolveTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      supportService.resolveTicket(id, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })
}

export function useCloseTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => supportService.closeTicket(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })
}

export function useReopenTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => supportService.reopenTicket(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })
}

export function useTicketComments(ticketId: string) {
  return useQuery({
    queryKey: ['support-comments', ticketId],
    queryFn: () => supportService.listComments(ticketId),
    enabled: !!ticketId,
  })
}

export function useAddComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ticketId, body, isInternal, attachmentIds }: { ticketId: string; body: string; isInternal?: boolean; attachmentIds?: string[] }) =>
      supportService.addComment(ticketId, body, isInternal, attachmentIds),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['support-comments', vars.ticketId] })
      qc.invalidateQueries({ queryKey: ['support-tickets'] })
    },
  })
}

export function useTicketStatusHistory(ticketId: string) {
  return useQuery({
    queryKey: ['support-history', ticketId],
    queryFn: () => supportService.getStatusHistory(ticketId),
    enabled: !!ticketId,
  })
}

export function useTicketStats() {
  return useQuery({
    queryKey: ['support-stats'],
    queryFn: () => supportService.getStats(),
    staleTime: 60_000,
  })
}

// ── Todos ──

export function useTicketTodos(ticketId: string) {
  return useQuery({
    queryKey: ['support-todos', ticketId],
    queryFn: () => supportService.listTodos(ticketId),
    enabled: !!ticketId,
  })
}

export function useAddTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ticketId, title, order }: { ticketId: string; title: string; order?: number }) =>
      supportService.addTodo(ticketId, title, order),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['support-todos', vars.ticketId] }),
  })
}

export function useUpdateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ todoId, payload }: { todoId: string; ticketId: string; payload: { title?: string; completed?: boolean; order?: number } }) =>
      supportService.updateTodo(todoId, payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['support-todos', vars.ticketId] }),
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ todoId }: { todoId: string; ticketId: string }) =>
      supportService.deleteTodo(todoId),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['support-todos', vars.ticketId] }),
  })
}
