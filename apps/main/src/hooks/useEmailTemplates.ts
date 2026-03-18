/**
 * useEmailTemplates — React Query hooks for the email template system.
 *
 * Provides:
 *  - useEmailTemplates()           — list all templates
 *  - useEmailTemplate(id)          — single template with versions/links
 *  - useEmailTemplateCheck(slug)   — availability check (for conditional UI)
 *  - Mutation hooks for CRUD operations
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

// ── Types ──────────────────────────────────────────────────

export interface EmailTemplateSummary {
  id: string
  entity_id: string
  slug: string
  name: string
  description: string | null
  object_type: string
  enabled: boolean
  created_at: string
  updated_at: string
  active_languages: string[]
  version_count: number
}

export interface EmailTemplateVersion {
  id: string
  template_id: string
  version: number
  language: string
  subject: string
  body_html: string
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  created_by: string | null
  created_at: string
}

export interface EmailTemplateLink {
  id: string
  template_id: string
  link_type: string
  link_id: string
}

export interface EmailTemplateFull {
  id: string
  entity_id: string
  slug: string
  name: string
  description: string | null
  object_type: string
  enabled: boolean
  variables_schema: Record<string, string> | null
  created_at: string
  updated_at: string
  versions: EmailTemplateVersion[]
  links: EmailTemplateLink[]
}

export interface EmailTemplateCheckResult {
  available: boolean
  enabled: boolean
  template_id: string | null
  active_languages: string[]
}

// ── Query hooks ────────────────────────────────────────────

/** List all templates for the current entity. */
export function useEmailTemplates() {
  return useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data } = await api.get<EmailTemplateSummary[]>('/api/v1/email-templates')
      return data
    },
  })
}

/** Get a single template with versions and links. */
export function useEmailTemplate(id: string | null) {
  return useQuery({
    queryKey: ['email-templates', id],
    queryFn: async () => {
      const { data } = await api.get<EmailTemplateFull>(`/api/v1/email-templates/${id}`)
      return data
    },
    enabled: !!id,
  })
}

/** Check if a template slug is configured and active. Used for conditional UI. */
export function useEmailTemplateCheck(slug: string) {
  return useQuery({
    queryKey: ['email-templates', 'check', slug],
    queryFn: async () => {
      const { data } = await api.get<EmailTemplateCheckResult>(`/api/v1/email-templates/check/${slug}`)
      return data
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 min
  })
}

// ── Mutation hooks ─────────────────────────────────────────

/** Create a new email template. */
export function useCreateEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      slug: string
      name: string
      description?: string
      object_type?: string
      enabled?: boolean
      variables_schema?: Record<string, string>
    }) => {
      const { data } = await api.post<EmailTemplateFull>('/api/v1/email-templates', body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] })
    },
  })
}

/** Update template metadata. */
export function useUpdateEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: {
      id: string
      name?: string
      description?: string
      object_type?: string
      enabled?: boolean
      variables_schema?: Record<string, string>
    }) => {
      const { data } = await api.put<EmailTemplateFull>(`/api/v1/email-templates/${id}`, body)
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['email-templates'] })
      qc.invalidateQueries({ queryKey: ['email-templates', vars.id] })
    },
  })
}

/** Delete a template. */
export function useDeleteEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/email-templates/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] })
    },
  })
}

/** Create a new version of a template. */
export function useCreateTemplateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ templateId, ...body }: {
      templateId: string
      language: string
      subject: string
      body_html: string
      is_active?: boolean
      valid_from?: string | null
      valid_until?: string | null
    }) => {
      const { data } = await api.post<EmailTemplateVersion>(
        `/api/v1/email-templates/${templateId}/versions`,
        body,
      )
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['email-templates', vars.templateId] })
      qc.invalidateQueries({ queryKey: ['email-templates'] })
    },
  })
}

/** Update a version. */
export function useUpdateTemplateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ templateId, versionId, ...body }: {
      templateId: string
      versionId: string
      subject?: string
      body_html?: string
      is_active?: boolean
      valid_from?: string | null
      valid_until?: string | null
    }) => {
      const { data } = await api.put<EmailTemplateVersion>(
        `/api/v1/email-templates/${templateId}/versions/${versionId}`,
        body,
      )
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['email-templates', vars.templateId] })
      qc.invalidateQueries({ queryKey: ['email-templates'] })
    },
  })
}

/** Activate a specific version. */
export function useActivateTemplateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ templateId, versionId }: { templateId: string; versionId: string }) => {
      const { data } = await api.post<EmailTemplateVersion>(
        `/api/v1/email-templates/${templateId}/versions/${versionId}/activate`,
      )
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['email-templates', vars.templateId] })
      qc.invalidateQueries({ queryKey: ['email-templates'] })
    },
  })
}

/** Delete a version. */
export function useDeleteTemplateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ templateId, versionId }: { templateId: string; versionId: string }) => {
      await api.delete(`/api/v1/email-templates/${templateId}/versions/${versionId}`)
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['email-templates', vars.templateId] })
      qc.invalidateQueries({ queryKey: ['email-templates'] })
    },
  })
}

/** Seed default templates. */
export function useSeedEmailTemplates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ seeded: string[]; count: number }>(
        '/api/v1/email-templates/seed',
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] })
    },
  })
}

/** Preview a rendered template. */
export function usePreviewTemplate() {
  return useMutation({
    mutationFn: async ({ templateId, versionId, variables }: {
      templateId: string
      versionId: string
      variables: Record<string, unknown>
    }) => {
      const { data } = await api.post<{ subject: string; body_html: string }>(
        `/api/v1/email-templates/${templateId}/preview`,
        { version_id: versionId, variables },
      )
      return data
    },
  })
}
