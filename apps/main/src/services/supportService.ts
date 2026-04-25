/**
 * Support API service — tickets, comments, stats.
 */
import api from '@/lib/api'
import type { PaginatedResponse } from '@/types/api'

// ── Types ──────────────────────────────────────────────────

export type TicketType = 'bug' | 'improvement' | 'question' | 'other'
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus = 'open' | 'in_progress' | 'waiting_info' | 'resolved' | 'closed' | 'rejected'

export interface SupportTicket {
  id: string
  entity_id: string
  reference: string
  title: string
  description: string | null
  ticket_type: TicketType
  priority: TicketPriority
  status: TicketStatus
  source_url: string | null
  browser_info: Record<string, unknown> | null
  reporter_id: string
  assignee_id: string | null
  resolved_at: string | null
  resolved_by: string | null
  closed_at: string | null
  resolution_notes: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
  reporter_name: string | null
  assignee_name: string | null
  comment_count: number
}

export interface TicketCreate {
  title: string
  description?: string
  ticket_type?: TicketType
  priority?: TicketPriority
  source_url?: string
  browser_info?: Record<string, unknown>
  tags?: string[]
}

export interface TicketUpdate {
  title?: string
  description?: string
  ticket_type?: TicketType
  priority?: TicketPriority
  status?: TicketStatus
  assignee_id?: string | null
  resolution_notes?: string
  tags?: string[]
}

export interface TicketComment {
  id: string
  ticket_id: string
  author_id: string
  body: string
  is_internal: boolean
  attachment_ids: string[] | null
  created_at: string
  updated_at: string
  author_name: string | null
}

export interface TicketTodo {
  id: string
  ticket_id: string
  title: string
  completed: boolean
  completed_at: string | null
  completed_by: string | null
  order: number
  created_at: string
}

export interface StatusHistoryEntry {
  id: string
  ticket_id: string
  old_status: string | null
  new_status: string
  changed_by: string
  note: string | null
  created_at: string
  changed_by_name: string | null
}

export interface TicketStats {
  total: number
  open: number
  in_progress: number
  resolved: number
  closed: number
  by_type: Record<string, number>
  by_priority: Record<string, number>
  avg_resolution_hours: number | null
  resolved_this_week: number
}

interface TicketListParams {
  page?: number
  page_size?: number
  status?: string
  priority?: string
  ticket_type?: string
  assignee_id?: string
  search?: string
}

// ── Service ────────────────────────────────────────────────

export const supportService = {
  listTickets: async (params: TicketListParams = {}): Promise<PaginatedResponse<SupportTicket>> => {
    const { data } = await api.get('/api/v1/support/tickets', { params })
    return data
  },

  getTicket: async (id: string): Promise<SupportTicket> => {
    const { data } = await api.get(`/api/v1/support/tickets/${id}`)
    return data
  },

  createTicket: async (payload: TicketCreate): Promise<SupportTicket> => {
    const { data } = await api.post('/api/v1/support/tickets', payload)
    return data
  },

  updateTicket: async (id: string, payload: TicketUpdate): Promise<SupportTicket> => {
    const { data } = await api.patch(`/api/v1/support/tickets/${id}`, payload)
    return data
  },

  deleteTicket: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/support/tickets/${id}`)
  },

  assignTicket: async (id: string, assigneeId: string): Promise<SupportTicket> => {
    const { data } = await api.post(`/api/v1/support/tickets/${id}/assign`, { assignee_id: assigneeId })
    return data
  },

  resolveTicket: async (id: string, notes?: string): Promise<SupportTicket> => {
    const { data } = await api.post(`/api/v1/support/tickets/${id}/resolve`, { resolution_notes: notes })
    return data
  },

  closeTicket: async (id: string): Promise<SupportTicket> => {
    const { data } = await api.post(`/api/v1/support/tickets/${id}/close`)
    return data
  },

  reopenTicket: async (id: string): Promise<SupportTicket> => {
    const { data } = await api.post(`/api/v1/support/tickets/${id}/reopen`)
    return data
  },

  // ── Comments ──
  listComments: async (ticketId: string): Promise<TicketComment[]> => {
    const { data } = await api.get(`/api/v1/support/tickets/${ticketId}/comments`)
    return data
  },

  addComment: async (ticketId: string, body: string, isInternal = false, attachmentIds?: string[]): Promise<TicketComment> => {
    const { data } = await api.post(`/api/v1/support/tickets/${ticketId}/comments`, {
      body, is_internal: isInternal, attachment_ids: attachmentIds || null,
    })
    return data
  },

  // ── History ──
  getStatusHistory: async (ticketId: string): Promise<StatusHistoryEntry[]> => {
    const { data } = await api.get(`/api/v1/support/tickets/${ticketId}/history`)
    return data
  },

  // ── Stats ──
  getStats: async (): Promise<TicketStats> => {
    const { data } = await api.get('/api/v1/support/stats')
    return data
  },

  // ── Todos ──
  listTodos: async (ticketId: string): Promise<TicketTodo[]> => {
    const { data } = await api.get(`/api/v1/support/tickets/${ticketId}/todos`)
    return data
  },

  addTodo: async (ticketId: string, title: string, order = 0): Promise<TicketTodo> => {
    const { data } = await api.post(`/api/v1/support/tickets/${ticketId}/todos`, { title, order })
    return data
  },

  updateTodo: async (todoId: string, payload: { title?: string; completed?: boolean; order?: number }): Promise<TicketTodo> => {
    const { data } = await api.patch(`/api/v1/support/todos/${todoId}`, payload)
    return data
  },

  deleteTodo: async (todoId: string): Promise<void> => {
    await api.delete(`/api/v1/support/todos/${todoId}`)
  },
}
