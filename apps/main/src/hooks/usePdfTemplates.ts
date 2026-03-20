/**
 * usePdfTemplates — React Query hooks for the PDF template system.
 *
 * Provides:
 *  - usePdfTemplates()          — list all PDF templates
 *  - usePdfTemplate(id)         — single template with versions
 *  - Mutation hooks for CRUD, version management, publish, seed, preview
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

// ── Types ──────────────────────────────────────────────────

export interface PdfTemplateSummary {
  id: string
  entity_id: string | null
  slug: string
  name: string
  description: string | null
  object_type: string
  enabled: boolean
  page_size: string
  orientation: string
  created_at: string
  updated_at: string
  published_languages: string[]
  version_count: number
}

export interface PdfTemplateVersion {
  id: string
  template_id: string
  version_number: number
  language: string
  body_html: string
  header_html: string | null
  footer_html: string | null
  is_published: boolean
  created_by: string | null
  created_at: string
}

export interface PdfTemplateFull {
  id: string
  entity_id: string | null
  slug: string
  name: string
  description: string | null
  object_type: string
  enabled: boolean
  variables_schema: Record<string, unknown> | null
  page_size: string
  orientation: string
  margin_top: number
  margin_right: number
  margin_bottom: number
  margin_left: number
  created_at: string
  updated_at: string
  versions: PdfTemplateVersion[]
}

// ── Query hooks ────────────────────────────────────────────

/** List all PDF templates for the current entity. */
export function usePdfTemplates() {
  return useQuery({
    queryKey: ['pdf-templates'],
    queryFn: async () => {
      const { data } = await api.get<PdfTemplateSummary[]>('/api/v1/pdf-templates')
      return data
    },
  })
}

/** Get a single PDF template with all versions. */
export function usePdfTemplate(id: string | null) {
  return useQuery({
    queryKey: ['pdf-templates', id],
    queryFn: async () => {
      const { data } = await api.get<PdfTemplateFull>(`/api/v1/pdf-templates/${id}`)
      return data
    },
    enabled: !!id,
  })
}

/** List versions of a template. */
export function usePdfTemplateVersions(templateId: string | null) {
  return useQuery({
    queryKey: ['pdf-templates', templateId, 'versions'],
    queryFn: async () => {
      const { data } = await api.get<PdfTemplateVersion[]>(`/api/v1/pdf-templates/${templateId}/versions`)
      return data
    },
    enabled: !!templateId,
  })
}

// ── Mutation hooks ─────────────────────────────────────────

/** Create a new PDF template. */
export function useCreatePdfTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      slug: string
      name: string
      description?: string
      object_type?: string
      enabled?: boolean
      variables_schema?: Record<string, unknown>
      page_size?: string
      orientation?: string
      margin_top?: number
      margin_right?: number
      margin_bottom?: number
      margin_left?: number
    }) => {
      const { data } = await api.post<PdfTemplateFull>('/api/v1/pdf-templates', body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pdf-templates'] })
    },
  })
}

/** Update PDF template metadata. */
export function useUpdatePdfTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: {
      id: string
      name?: string
      description?: string
      object_type?: string
      enabled?: boolean
      variables_schema?: Record<string, unknown>
      page_size?: string
      orientation?: string
      margin_top?: number
      margin_right?: number
      margin_bottom?: number
      margin_left?: number
    }) => {
      const { data } = await api.patch<PdfTemplateFull>(`/api/v1/pdf-templates/${id}`, body)
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pdf-templates'] })
      qc.invalidateQueries({ queryKey: ['pdf-templates', vars.id] })
    },
  })
}

/** Delete a PDF template and all its versions. */
export function useDeletePdfTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/pdf-templates/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pdf-templates'] })
    },
  })
}

/** Create a new version of a PDF template. */
export function useCreatePdfVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ templateId, ...body }: {
      templateId: string
      language: string
      body_html: string
      header_html?: string
      footer_html?: string
      is_published?: boolean
    }) => {
      const { data } = await api.post<PdfTemplateVersion>(
        `/api/v1/pdf-templates/${templateId}/versions`,
        body,
      )
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pdf-templates', vars.templateId] })
      qc.invalidateQueries({ queryKey: ['pdf-templates', vars.templateId, 'versions'] })
      qc.invalidateQueries({ queryKey: ['pdf-templates'] })
    },
  })
}

/** Publish a specific version (make it the active one for its language). */
export function usePublishPdfVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ templateId, versionId }: { templateId: string; versionId: string }) => {
      const { data } = await api.post<PdfTemplateVersion>(
        `/api/v1/pdf-templates/${templateId}/versions/${versionId}/publish`,
      )
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pdf-templates', vars.templateId] })
      qc.invalidateQueries({ queryKey: ['pdf-templates', vars.templateId, 'versions'] })
      qc.invalidateQueries({ queryKey: ['pdf-templates'] })
    },
  })
}

/** Delete a PDF template version. */
export function useDeletePdfVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ templateId, versionId }: { templateId: string; versionId: string }) => {
      await api.delete(`/api/v1/pdf-templates/${templateId}/versions/${versionId}`)
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pdf-templates', vars.templateId] })
      qc.invalidateQueries({ queryKey: ['pdf-templates', vars.templateId, 'versions'] })
      qc.invalidateQueries({ queryKey: ['pdf-templates'] })
    },
  })
}

/** Seed default PDF templates. */
export function useSeedPdfTemplates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ seeded: string[]; count: number }>(
        '/api/v1/pdf-templates/seed',
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pdf-templates'] })
    },
  })
}

/** Preview a rendered PDF template version with sample variables. */
export function usePreviewPdfTemplate() {
  return useMutation({
    mutationFn: async ({ templateId, versionId, variables, output = 'html' }: {
      templateId: string
      versionId: string
      variables: Record<string, unknown>
      output?: 'html' | 'pdf'
    }) => {
      if (output === 'pdf') {
        const resp = await api.post(
          `/api/v1/pdf-templates/${templateId}/preview`,
          { version_id: versionId, variables, output: 'pdf' },
          { responseType: 'blob' },
        )
        return { pdf: resp.data as Blob }
      }
      const { data } = await api.post<{ rendered_html: string }>(
        `/api/v1/pdf-templates/${templateId}/preview`,
        { version_id: versionId, variables, output: 'html' },
      )
      return { rendered_html: data.rendered_html }
    },
  })
}
