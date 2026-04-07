import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlignCenter,
  AlignLeft,
  Bold,
  Code2,
  Eye,
  FileOutput,
  Heading2,
  Italic,
  Languages,
  Link,
  List,
  ListOrdered,
  Loader2,
  Pencil,
  Plus,
  Redo2,
  Save,
  Trash2,
  Type,
  Underline,
  Undo2,
  Upload,
  Variable,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { usePromptInput } from '@/components/ui/ConfirmDialog'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  PanelActionButton,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import {
  useCreatePdfTemplate,
  useCreatePdfVersion,
  useDeletePdfTemplate,
  useDeletePdfVersion,
  usePdfTemplate,
  usePreviewPdfTemplate,
  usePublishPdfVersion,
  useUpdatePdfTemplate,
  useUpdatePdfVersion,
  useValidatePdfTemplate,
  type PdfTemplateValidationResult,
  type PdfTemplateVersion,
} from '@/hooks/usePdfTemplates'

const LANG_OPTIONS = ['fr', 'en'] as const
const OBJECT_TYPES = ['system', 'document', 'ads', 'project', 'travelwiz', 'voyage'] as const
const PAGE_SIZE_OPTIONS = ['A4', 'A5', 'A6', 'Letter'] as const
const ORIENTATION_OPTIONS = ['portrait', 'landscape'] as const

function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function buildSampleVariables(
  slug: string | undefined,
  variablesSchema: Record<string, unknown> | null | undefined,
) {
  const base: Record<string, unknown> = {
    entity: { name: 'OpsFlux Demo', code: 'OPS' },
    generated_at: '07/04/2026 12:00 UTC',
  }
  if (slug === 'voyage.manifest') {
    return {
      ...base,
      voyage_number: 'VYG-2026-0001',
      transport_type: 'helicopter',
      carrier: 'Super Puma',
      departure_date: '07/04/2026 06:30 UTC',
      departure_location: 'Base A',
      arrival_location: 'Site Bravo',
      total_passengers: 3,
      max_capacity: 12,
      passengers: [
        { name: 'Jean Dupont', company: 'Perenco', badge_number: 'BDG-001', compliance_status: 'boarded' },
        { name: 'Marie Kanku', company: 'Perenco', badge_number: 'BDG-002', compliance_status: 'pending' },
      ],
    }
  }
  if (slug === 'voyage.cargo_manifest') {
    return {
      ...base,
      voyage_number: 'VYG-2026-0001',
      transport_type: 'helicopter',
      carrier: 'Super Puma',
      departure_date: '07/04/2026 06:30 UTC',
      departure_location: 'Base A',
      arrival_location: 'Site Bravo',
      total_cargo_items: 2,
      total_weight_kg: 425.5,
      total_packages: 7,
      cargo_items: [
        { tracking_code: 'CGO-001', request_code: 'LTR-001', designation: 'Pompe', destination_name: 'Site Bravo', receiver_name: 'Log Base', weight_kg: 220, package_count: 2, status_label: 'Enregistre' },
        { tracking_code: 'CGO-002', request_code: 'LTR-001', designation: 'Caisse outillage', destination_name: 'Site Bravo', receiver_name: 'Log Base', weight_kg: 205.5, package_count: 5, status_label: 'Charge' },
      ],
    }
  }
  if (slug === 'cargo.lt') {
    return {
      ...base,
      request_code: 'LTR-2026-0012',
      request_title: 'Demande expedition materiel forage',
      request_status: 'approved',
      sender_name: 'Base logistique',
      receiver_name: 'Chef de site Bravo',
      destination_name: 'Site Bravo',
      requester_name: 'A. User',
      description: 'Acheminement de materiel critique pour intervention.',
      imputation_reference: 'IMP-001 Forage',
      total_cargo_items: 2,
      total_weight_kg: 425.5,
      total_packages: 7,
      cargo_items: [
        { tracking_code: 'CGO-001', designation: 'Pompe', cargo_type: 'unit', weight_kg: 220, package_count: 2, status_label: 'Enregistre' },
        { tracking_code: 'CGO-002', designation: 'Caisse outillage', cargo_type: 'consumable', weight_kg: 205.5, package_count: 5, status_label: 'Charge' },
      ],
    }
  }
  const schemaKeys = Object.keys(variablesSchema ?? {})
  for (const key of schemaKeys) {
    if (key.includes('.')) continue
    if (!(key in base)) base[key] = `Exemple ${key}`
  }
  return base
}

interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  variables?: Record<string, unknown> | null
  placeholder?: string
  minHeight?: number
}

function RichEditor({ value, onChange, variables, placeholder, minHeight = 220 }: RichEditorProps) {
  const { t } = useTranslation()
  const editorRef = useRef<HTMLDivElement>(null)
  const promptInput = usePromptInput()
  const [isSource, setIsSource] = useState(false)
  const [sourceCode, setSourceCode] = useState(value)
  const isUpdatingRef = useRef(false)

  useEffect(() => {
    if (editorRef.current && !isSource && !isUpdatingRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || ''
    }
  }, [value, isSource])

  const handleEditorInput = useCallback(() => {
    if (!editorRef.current) return
    isUpdatingRef.current = true
    onChange(editorRef.current.innerHTML)
    requestAnimationFrame(() => {
      isUpdatingRef.current = false
    })
  }, [onChange])

  const execCmd = useCallback((cmd: string, val?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
    handleEditorInput()
  }, [handleEditorInput])

  const toggleSource = useCallback(() => {
    if (isSource) {
      onChange(sourceCode)
    } else {
      setSourceCode(editorRef.current?.innerHTML || value)
    }
    setIsSource((current) => !current)
  }, [isSource, onChange, sourceCode, value])

  const insertVariable = useCallback((varKey: string) => {
    editorRef.current?.focus()
    document.execCommand('insertText', false, `{{ ${varKey} }}`)
    handleEditorInput()
  }, [handleEditorInput])

  const insertLink = useCallback(async () => {
    const url = await promptInput({
      title: t('settings.pdf_templates_editor.rich_editor.insert_link_title'),
      placeholder: 'https://...',
    })
    if (url) execCmd('createLink', url)
  }, [execCmd, promptInput, t])

  const variableEntries = Object.entries(variables ?? {})

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/50 flex-wrap">
        <ToolbarBtn onClick={() => execCmd('bold')} title={t('settings.pdf_templates_editor.rich_editor.bold')} disabled={isSource}><Bold size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('italic')} title={t('settings.pdf_templates_editor.rich_editor.italic')} disabled={isSource}><Italic size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('underline')} title={t('settings.pdf_templates_editor.rich_editor.underline')} disabled={isSource}><Underline size={13} /></ToolbarBtn>
        <ToolbarSep />
        <ToolbarBtn onClick={() => execCmd('formatBlock', 'h2')} title={t('settings.pdf_templates_editor.rich_editor.heading')} disabled={isSource}><Heading2 size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('formatBlock', 'p')} title={t('settings.pdf_templates_editor.rich_editor.paragraph')} disabled={isSource}><Type size={13} /></ToolbarBtn>
        <ToolbarSep />
        <ToolbarBtn onClick={() => execCmd('insertUnorderedList')} title={t('settings.pdf_templates_editor.rich_editor.bulleted_list')} disabled={isSource}><List size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('insertOrderedList')} title={t('settings.pdf_templates_editor.rich_editor.numbered_list')} disabled={isSource}><ListOrdered size={13} /></ToolbarBtn>
        <ToolbarSep />
        <ToolbarBtn onClick={insertLink} title={t('settings.pdf_templates_editor.rich_editor.link')} disabled={isSource}><Link size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('justifyLeft')} title={t('settings.pdf_templates_editor.rich_editor.align_left')} disabled={isSource}><AlignLeft size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('justifyCenter')} title={t('settings.pdf_templates_editor.rich_editor.align_center')} disabled={isSource}><AlignCenter size={13} /></ToolbarBtn>
        <ToolbarSep />
        <ToolbarBtn onClick={() => execCmd('undo')} title={t('settings.pdf_templates_editor.rich_editor.undo')} disabled={isSource}><Undo2 size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('redo')} title={t('settings.pdf_templates_editor.rich_editor.redo')} disabled={isSource}><Redo2 size={13} /></ToolbarBtn>
        <div className="flex-1" />
        <ToolbarBtn onClick={toggleSource} title={isSource ? t('settings.pdf_templates_editor.rich_editor.visual_editor') : t('settings.pdf_templates_editor.rich_editor.html_code')} active={isSource}><Code2 size={13} /></ToolbarBtn>
      </div>

      {variableEntries.length > 0 && !isSource && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50 bg-muted/30 flex-wrap">
          <Variable size={11} className="text-muted-foreground mr-0.5 shrink-0" />
          {variableEntries.map(([key, desc]) => (
            <button
              key={key}
              type="button"
              onClick={() => insertVariable(key)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title={typeof desc === 'string' ? desc : key}
            >
              {key}
            </button>
          ))}
        </div>
      )}

      {isSource ? (
        <textarea
          value={sourceCode}
          onChange={(e) => setSourceCode(e.target.value)}
          onBlur={() => onChange(sourceCode)}
          className="w-full p-3 font-mono text-xs bg-zinc-950 text-green-400 resize-none focus:outline-none"
          style={{ minHeight }}
          spellCheck={false}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          onInput={handleEditorInput}
          className="p-3 text-sm focus:outline-none prose prose-sm max-w-none dark:prose-invert [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground [&:empty]:before:pointer-events-none"
          style={{ minHeight }}
          data-placeholder={placeholder}
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: value || '' }}
        />
      )}
    </div>
  )
}

function ToolbarBtn({
  children,
  onClick,
  title,
  disabled,
  active,
}: {
  children: ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-1.5 rounded transition-colors',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      {children}
    </button>
  )
}

function ToolbarSep() {
  return <div className="w-px h-4 bg-border/60 mx-0.5" />
}

function CreatePdfTemplatePanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createTemplate = useCreatePdfTemplate()
  const [form, setForm] = useState({
    slug: '',
    name: '',
    description: '',
    object_type: 'system',
    enabled: true,
    page_size: 'A4',
    orientation: 'portrait',
    margin_top: 15,
    margin_right: 12,
    margin_bottom: 15,
    margin_left: 12,
  })

  const canSubmit = form.slug.trim().length > 0 && form.name.trim().length > 0 && !createTemplate.isPending

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const created = await createTemplate.mutateAsync({
        ...form,
        slug: form.slug.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      })
      toast({ title: t('settings.pdf_templates_editor.toasts.template_created'), variant: 'success' })
      openDynamicPanel({
        module: 'settings-pdf-template',
        type: 'edit',
        id: created.id,
        data: { templateId: created.id },
      })
    } catch {
      toast({ title: t('settings.pdf_templates_editor.toasts.template_create_error'), variant: 'error' })
    }
  }

  const objectTypeOptions = OBJECT_TYPES.map((value) => ({
    value,
    label: t(`settings.pdf_templates_editor.object_types.${value}`),
  }))

  return (
    <DynamicPanelShell
      title={t('settings.pdf_templates_editor.create.title')}
      subtitle={t('settings.pdf_templates_editor.create.subtitle')}
      icon={<FileOutput size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={!canSubmit}
            onClick={() => (document.getElementById('create-pdf-template-form') as HTMLFormElement | null)?.requestSubmit()}
          >
            {createTemplate.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-pdf-template-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <FormSection title={t('settings.pdf_templates_editor.sections.metadata')}>
          <FormGrid>
            <DynamicPanelField label={t('settings.pdf_templates_editor.fields.slug')} required>
              <input
                type="text"
                className={`${panelInputClass} font-mono`}
                placeholder={t('settings.pdf_templates_editor.fields.slug_placeholder')}
                value={form.slug}
                onChange={(e) => setForm((current) => ({ ...current, slug: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.name')} required>
              <input type="text" className={panelInputClass} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
            </DynamicPanelField>
            <DynamicPanelField label={t('settings.pdf_templates_editor.fields.object_type')}>
              <select className="gl-form-select" value={form.object_type} onChange={(e) => setForm((current) => ({ ...current, object_type: e.target.value }))}>
                {objectTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('settings.pdf_templates_editor.fields.page_size')}>
              <select className="gl-form-select" value={form.page_size} onChange={(e) => setForm((current) => ({ ...current, page_size: e.target.value }))}>
                {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.orientation')}>
              <select className="gl-form-select" value={form.orientation} onChange={(e) => setForm((current) => ({ ...current, orientation: e.target.value }))}>
                {ORIENTATION_OPTIONS.map((option) => <option key={option} value={option}>{t(`settings.pdf_templates_editor.orientation.${option}`)}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.active')}>
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((current) => ({ ...current, enabled: e.target.checked }))} />
                {t('settings.pdf_templates_editor.fields.template_enabled')}
              </label>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.description')} span="full">
              <textarea className={`${panelInputClass} min-h-[72px]`} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}

function EditPdfTemplateInner({ templateId }: { templateId: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: template, isLoading } = usePdfTemplate(templateId)
  const updateTemplate = useUpdatePdfTemplate()
  const deleteTemplate = useDeletePdfTemplate()
  const createVersion = useCreatePdfVersion()
  const updateVersion = useUpdatePdfVersion()
  const publishVersion = usePublishPdfVersion()
  const deleteVersion = useDeletePdfVersion()
  const previewTemplate = usePreviewPdfTemplate()
  const validateTemplate = useValidatePdfTemplate()

  const versions = useMemo(
    () => (template?.versions ?? []).slice().sort((a, b) => {
      if (a.language !== b.language) return a.language.localeCompare(b.language)
      return b.version_number - a.version_number
    }),
    [template?.versions],
  )

  const [metaForm, setMetaForm] = useState({
    name: '',
    description: '',
    object_type: 'system',
    enabled: true,
    page_size: 'A4',
    orientation: 'portrait',
    margin_top: 15,
    margin_right: 12,
    margin_bottom: 15,
    margin_left: 12,
  })
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [isCreatingVersion, setIsCreatingVersion] = useState(false)
  const [versionForm, setVersionForm] = useState({
    language: 'fr',
    body_html: '',
    header_html: '',
    footer_html: '',
    is_published: false,
  })
  const [activeEditor, setActiveEditor] = useState<'body' | 'header' | 'footer'>('body')
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<PdfTemplateValidationResult | null>(null)

  useEffect(() => {
    if (!template) return
    setMetaForm({
      name: template.name,
      description: template.description ?? '',
      object_type: template.object_type,
      enabled: template.enabled,
      page_size: template.page_size,
      orientation: template.orientation,
      margin_top: template.margin_top,
      margin_right: template.margin_right,
      margin_bottom: template.margin_bottom,
      margin_left: template.margin_left,
    })
    const preferredVersion = template.versions.find((version) => version.is_published) ?? template.versions[0] ?? null
    if (preferredVersion) setSelectedVersionId(preferredVersion.id)
  }, [template])

  useEffect(() => {
    if (!selectedVersionId) return
    const version = versions.find((item) => item.id === selectedVersionId)
    if (!version) return
    setVersionForm({
      language: version.language,
      body_html: version.body_html,
      header_html: version.header_html ?? '',
      footer_html: version.footer_html ?? '',
      is_published: version.is_published,
    })
    setIsCreatingVersion(false)
    setPreviewHtml(null)
    setValidationResult(null)
  }, [selectedVersionId, versions])

  const selectedVersion = versions.find((item) => item.id === selectedVersionId) ?? null
  const sampleVariables = useMemo(
    () => buildSampleVariables(template?.slug, template?.variables_schema),
    [template?.slug, template?.variables_schema],
  )

  const startNewVersion = useCallback((prefill?: Partial<typeof versionForm>) => {
    setSelectedVersionId(null)
    setIsCreatingVersion(true)
    setPreviewHtml(null)
    setValidationResult(null)
    setVersionForm({
      language: prefill?.language ?? 'fr',
      body_html: prefill?.body_html ?? '',
      header_html: prefill?.header_html ?? '',
      footer_html: prefill?.footer_html ?? '',
      is_published: prefill?.is_published ?? false,
    })
    setActiveEditor('body')
  }, [])

  const objectTypeOptions = OBJECT_TYPES.map((value) => ({
    value,
    label: t(`settings.pdf_templates_editor.object_types.${value}`),
  }))
  const languageOptions = LANG_OPTIONS.map((value) => ({
    value,
    label: t(`settings.pdf_templates_editor.languages.${value}`),
  }))

  const handleSaveMeta = async () => {
    try {
      await updateTemplate.mutateAsync({
        id: templateId,
        name: metaForm.name,
        description: metaForm.description || undefined,
        object_type: metaForm.object_type,
        enabled: metaForm.enabled,
        page_size: metaForm.page_size,
        orientation: metaForm.orientation,
        margin_top: metaForm.margin_top,
        margin_right: metaForm.margin_right,
        margin_bottom: metaForm.margin_bottom,
        margin_left: metaForm.margin_left,
      })
      toast({ title: t('settings.pdf_templates_editor.toasts.metadata_updated'), variant: 'success' })
    } catch {
      toast({ title: t('settings.pdf_templates_editor.toasts.template_error'), variant: 'error' })
    }
  }

  const handleSaveVersion = async () => {
    try {
      if (isCreatingVersion || !selectedVersion) {
        const created = await createVersion.mutateAsync({
          templateId,
          language: versionForm.language,
          body_html: versionForm.body_html,
          header_html: versionForm.header_html || undefined,
          footer_html: versionForm.footer_html || undefined,
          is_published: versionForm.is_published,
        })
        setSelectedVersionId(created.id)
        setIsCreatingVersion(false)
        toast({ title: t('settings.pdf_templates_editor.toasts.version_created'), variant: 'success' })
        return
      }
      await updateVersion.mutateAsync({
        templateId,
        versionId: selectedVersion.id,
        body_html: versionForm.body_html,
        header_html: versionForm.header_html || undefined,
        footer_html: versionForm.footer_html || undefined,
        is_published: versionForm.is_published,
      })
      toast({ title: t('settings.pdf_templates_editor.toasts.version_updated'), variant: 'success' })
    } catch {
      toast({ title: t('settings.pdf_templates_editor.toasts.version_save_error'), variant: 'error' })
    }
  }

  const handlePreviewHtml = async () => {
    if (!selectedVersionId) {
      toast({ title: t('settings.pdf_templates_editor.toasts.select_version_before_preview'), variant: 'warning' })
      return
    }
    try {
      const result = await previewTemplate.mutateAsync({
        templateId,
        versionId: selectedVersionId,
        variables: sampleVariables,
        output: 'html',
      })
      setPreviewHtml(result.rendered_html ?? null)
    } catch {
      toast({ title: t('settings.pdf_templates_editor.toasts.html_preview_error'), variant: 'error' })
    }
  }

  const handleValidateTemplate = async () => {
    try {
      const result = await validateTemplate.mutateAsync({
        templateId,
        body_html: versionForm.body_html,
        header_html: versionForm.header_html || undefined,
        footer_html: versionForm.footer_html || undefined,
        variables_schema: template?.variables_schema ?? null,
      })
      setValidationResult(result)
      toast({
        title: result.valid
          ? t('settings.pdf_templates_editor.toasts.template_valid')
          : t('settings.pdf_templates_editor.toasts.template_invalid'),
        description: result.valid
          ? t('settings.pdf_templates_editor.toasts.template_valid_description')
          : t('settings.pdf_templates_editor.toasts.template_invalid_description', { count: result.issues.length }),
        variant: result.valid ? 'success' : 'warning',
      })
    } catch {
      toast({ title: t('settings.pdf_templates_editor.toasts.template_validation_error'), variant: 'error' })
    }
  }

  const handlePreviewPdf = async () => {
    if (!selectedVersionId) {
      toast({ title: t('settings.pdf_templates_editor.toasts.select_version_before_preview'), variant: 'warning' })
      return
    }
    try {
      const result = await previewTemplate.mutateAsync({
        templateId,
        versionId: selectedVersionId,
        variables: sampleVariables,
        output: 'pdf',
      })
      if (result.pdf) openBlob(result.pdf)
    } catch {
      toast({ title: t('settings.pdf_templates_editor.toasts.pdf_preview_error'), variant: 'error' })
    }
  }

  const handlePublish = async (version: PdfTemplateVersion) => {
    try {
      await publishVersion.mutateAsync({ templateId, versionId: version.id })
      toast({ title: t('settings.pdf_templates_editor.toasts.version_published'), variant: 'success' })
    } catch {
      toast({ title: t('settings.pdf_templates_editor.toasts.publish_error'), variant: 'error' })
    }
  }

  const handleDeleteVersion = async (version: PdfTemplateVersion) => {
    try {
      await deleteVersion.mutateAsync({ templateId, versionId: version.id })
      if (selectedVersionId === version.id) {
        setSelectedVersionId(null)
        setIsCreatingVersion(false)
      }
      toast({ title: t('settings.pdf_templates_editor.toasts.version_deleted'), variant: 'success' })
    } catch {
      toast({ title: t('settings.pdf_templates_editor.toasts.version_delete_error'), variant: 'error' })
    }
  }

  const handleDeleteTemplate = async () => {
    try {
      await deleteTemplate.mutateAsync(templateId)
      toast({ title: t('settings.pdf_templates_editor.toasts.template_deleted'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('settings.pdf_templates_editor.toasts.template_delete_error'), variant: 'error' })
    }
  }

  if (isLoading) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<FileOutput size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  if (!template) {
    return (
      <DynamicPanelShell title={t('settings.pdf_templates_editor.not_found.title')} icon={<FileOutput size={14} className="text-primary" />}>
        <div className="px-4 py-6 text-sm text-muted-foreground">{t('settings.pdf_templates_editor.not_found.load_error')}</div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={template.name}
      subtitle={template.slug}
      icon={<FileOutput size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={handleSaveMeta} disabled={updateTemplate.isPending} icon={<Save size={12} />}>
            {t('settings.pdf_templates_editor.actions.save_metadata')}
          </PanelActionButton>
          <PanelActionButton onClick={handleDeleteTemplate} disabled={deleteTemplate.isPending} icon={<Trash2 size={12} />}>
            {t('settings.pdf_templates_editor.actions.delete_template')}
          </PanelActionButton>
        </>
      }
    >
      <div className="space-y-5">
        <FormSection title={t('settings.pdf_templates_editor.sections.template_metadata')}>
          <FormGrid>
            <DynamicPanelField label={t('settings.pdf_templates_editor.fields.slug')}>
              <input type="text" value={template.slug} disabled className={`${panelInputClass} font-mono bg-muted/40`} />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.name')}>
              <input type="text" value={metaForm.name} onChange={(e) => setMetaForm((current) => ({ ...current, name: e.target.value }))} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('settings.pdf_templates_editor.fields.object_type')}>
              <select className="gl-form-select" value={metaForm.object_type} onChange={(e) => setMetaForm((current) => ({ ...current, object_type: e.target.value }))}>
                {objectTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('settings.pdf_templates_editor.fields.page_size')}>
              <select className="gl-form-select" value={metaForm.page_size} onChange={(e) => setMetaForm((current) => ({ ...current, page_size: e.target.value }))}>
                {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.orientation')}>
              <select className="gl-form-select" value={metaForm.orientation} onChange={(e) => setMetaForm((current) => ({ ...current, orientation: e.target.value }))}>
                {ORIENTATION_OPTIONS.map((option) => <option key={option} value={option}>{t(`settings.pdf_templates_editor.orientation.${option}`)}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.active')}>
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" checked={metaForm.enabled} onChange={(e) => setMetaForm((current) => ({ ...current, enabled: e.target.checked }))} />
                {t('settings.pdf_templates_editor.fields.template_enabled')}
              </label>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.description')} span="full">
              <textarea value={metaForm.description} onChange={(e) => setMetaForm((current) => ({ ...current, description: e.target.value }))} className={`${panelInputClass} min-h-[72px]`} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>
        <FormSection title={t('settings.pdf_templates_editor.sections.versions', { count: versions.length })}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setSelectedVersionId(version.id)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left text-xs',
                    selectedVersionId === version.id && !isCreatingVersion
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border/60 bg-card text-muted-foreground',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Languages size={12} />
                    {version.language.toUpperCase()} v{version.version_number}
                    {version.is_published ? ` · ${t('settings.pdf_templates_editor.version_badges.published')}` : ''}
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => startNewVersion()}
                className={cn(
                  'rounded-md border border-dashed px-3 py-2 text-xs',
                  isCreatingVersion ? 'border-primary bg-primary/5 text-foreground' : 'border-border/70 text-muted-foreground',
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Plus size={12} />
                  {t('settings.pdf_templates_editor.actions.new_version')}
                </span>
              </button>
              {selectedVersion && (
                <button
                  type="button"
                  onClick={() => startNewVersion({
                    language: selectedVersion.language === 'fr' ? 'en' : 'fr',
                    body_html: selectedVersion.body_html,
                    header_html: selectedVersion.header_html ?? '',
                    footer_html: selectedVersion.footer_html ?? '',
                    is_published: false,
                  })}
                  className="rounded-md border border-border/70 px-3 py-2 text-xs text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Languages size={12} />
                    {t('common.clone')}
                  </span>
                </button>
              )}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {t('settings.pdf_templates_editor.available_variables', {
                variables: Object.keys(template.variables_schema ?? {}).join(', ') || t('settings.pdf_templates_editor.no_declared_variables'),
              })}
            </div>
          </div>
        </FormSection>

        <FormSection title={isCreatingVersion
          ? t('settings.pdf_templates_editor.sections.new_multilingual_version')
          : selectedVersion
            ? t('settings.pdf_templates_editor.sections.edit_version', { language: selectedVersion.language.toUpperCase(), version: selectedVersion.version_number })
            : t('settings.pdf_templates_editor.sections.version')}>
          <div className="space-y-4">
            <FormGrid>
              <DynamicPanelField label={t('settings.pdf_templates_editor.fields.language')}>
                <select value={versionForm.language} onChange={(e) => setVersionForm((current) => ({ ...current, language: e.target.value }))} className="gl-form-select" disabled={!isCreatingVersion && !!selectedVersion}>
                  {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.publish')}>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={versionForm.is_published} onChange={(e) => setVersionForm((current) => ({ ...current, is_published: e.target.checked }))} />
                  {t('settings.pdf_templates_editor.fields.use_as_published')}
                </label>
              </DynamicPanelField>
            </FormGrid>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setActiveEditor('body')} className={cn('rounded-md border px-3 py-1.5 text-xs', activeEditor === 'body' ? 'border-primary bg-primary/5 text-foreground' : 'border-border/60 text-muted-foreground')}>
                <span className="inline-flex items-center gap-1.5"><Pencil size={12} /> {t('settings.pdf_templates_editor.editors.body_tab')}</span>
              </button>
              <button type="button" onClick={() => setActiveEditor('header')} className={cn('rounded-md border px-3 py-1.5 text-xs', activeEditor === 'header' ? 'border-primary bg-primary/5 text-foreground' : 'border-border/60 text-muted-foreground')}>
                {t('settings.pdf_templates_editor.editors.header_tab')}
              </button>
              <button type="button" onClick={() => setActiveEditor('footer')} className={cn('rounded-md border px-3 py-1.5 text-xs', activeEditor === 'footer' ? 'border-primary bg-primary/5 text-foreground' : 'border-border/60 text-muted-foreground')}>
                {t('settings.pdf_templates_editor.editors.footer_tab')}
              </button>
            </div>
            {activeEditor === 'body' && (
              <DynamicPanelField label={t('settings.pdf_templates_editor.editors.body_label')}>
                <RichEditor
                  value={versionForm.body_html}
                  onChange={(body_html) => setVersionForm((current) => ({ ...current, body_html }))}
                  variables={template.variables_schema}
                  placeholder={t('settings.pdf_templates_editor.placeholders.body')}
                  minHeight={340}
                />
              </DynamicPanelField>
            )}
            {activeEditor === 'header' && (
              <DynamicPanelField label={t('settings.pdf_templates_editor.editors.header_label')}>
                <RichEditor
                  value={versionForm.header_html}
                  onChange={(header_html) => setVersionForm((current) => ({ ...current, header_html }))}
                  variables={template.variables_schema}
                  placeholder={t('settings.pdf_templates_editor.placeholders.header')}
                  minHeight={180}
                />
              </DynamicPanelField>
            )}
            {activeEditor === 'footer' && (
              <DynamicPanelField label={t('settings.pdf_templates_editor.editors.footer_label')}>
                <RichEditor
                  value={versionForm.footer_html}
                  onChange={(footer_html) => setVersionForm((current) => ({ ...current, footer_html }))}
                  variables={template.variables_schema}
                  placeholder={t('settings.pdf_templates_editor.placeholders.footer')}
                  minHeight={180}
                />
              </DynamicPanelField>
            )}

            <div className="flex flex-wrap gap-2">
              <PanelActionButton
                onClick={handleSaveVersion}
                disabled={(createVersion.isPending || updateVersion.isPending) || !versionForm.body_html.trim()}
                icon={<Save size={12} />}
              >
                {isCreatingVersion || !selectedVersion ? t('settings.pdf_templates_editor.actions.create_version') : t('settings.pdf_templates_editor.actions.save_version')}
              </PanelActionButton>
              <PanelActionButton onClick={handleValidateTemplate} disabled={validateTemplate.isPending || !versionForm.body_html.trim()} icon={<Code2 size={12} />}>
                {t('settings.pdf_templates_editor.actions.validate_template')}
              </PanelActionButton>
              {selectedVersion && (
                <>
                  <PanelActionButton onClick={() => handlePublish(selectedVersion)} disabled={publishVersion.isPending} icon={<Upload size={12} />}>
                    {t('common.publish')}
                  </PanelActionButton>
                  <PanelActionButton onClick={() => handleDeleteVersion(selectedVersion)} disabled={deleteVersion.isPending} icon={<Trash2 size={12} />}>
                    {t('settings.pdf_templates_editor.actions.delete_version')}
                  </PanelActionButton>
                </>
              )}
              <PanelActionButton onClick={handlePreviewHtml} disabled={previewTemplate.isPending || !selectedVersionId} icon={<Eye size={12} />}>
                {t('settings.pdf_templates_editor.actions.preview_html')}
              </PanelActionButton>
              <PanelActionButton onClick={handlePreviewPdf} disabled={previewTemplate.isPending || !selectedVersionId} icon={<FileOutput size={12} />}>
                {t('settings.pdf_templates_editor.actions.preview_pdf')}
              </PanelActionButton>
            </div>
          </div>
        </FormSection>

        <FormSection title={t('settings.pdf_templates_editor.sections.preview')}>
          {previewHtml ? (
            <div className="rounded-lg border border-border/60 bg-white overflow-hidden">
              <iframe title="PDF template HTML preview" srcDoc={previewHtml} className="h-[420px] w-full bg-white" />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-xs text-muted-foreground">
              {t('settings.pdf_templates_editor.preview_empty')}
            </div>
          )}
        </FormSection>
        <FormSection title={t('settings.pdf_templates_editor.sections.validation')}>
          {validationResult ? (
            <div className="space-y-3">
              <div className={cn(
                'rounded-lg border px-3 py-2 text-xs',
                validationResult.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900',
              )}>
                {validationResult.valid ? t('settings.pdf_templates_editor.validation.valid') : t('settings.pdf_templates_editor.validation.invalid')}
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {t('settings.pdf_templates_editor.validation.referenced_variables', {
                  variables: validationResult.referenced_variables.join(', ') || t('common.none'),
                })}
              </div>
              {validationResult.issues.length > 0 && (
                <div className="space-y-2">
                  {validationResult.issues.map((issue, index) => (
                    <div key={`${issue.area}-${index}`} className={cn(
                      'rounded-lg border px-3 py-2 text-xs',
                      issue.level === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900',
                    )}>
                      <div className="font-medium uppercase tracking-wide">{issue.level} · {issue.area}</div>
                      <div className="mt-1">{issue.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-xs text-muted-foreground">
              {t('settings.pdf_templates_editor.validation.empty')}
            </div>
          )}
        </FormSection>
      </div>
    </DynamicPanelShell>
  )
}

export function EditPdfTemplatePanel({
  templateId,
  mode = 'edit',
}: {
  templateId?: string | null
  mode?: 'create' | 'edit'
}) {
  const { t } = useTranslation()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const resolvedMode = dynamicPanel?.module === 'settings-pdf-template'
    ? (dynamicPanel.type === 'create' ? 'create' : 'edit')
    : mode
  const resolvedTemplateId = (
    templateId
    ?? (typeof dynamicPanel?.data?.templateId === 'string' ? dynamicPanel.data.templateId : null)
    ?? (dynamicPanel?.module === 'settings-pdf-template' && dynamicPanel.type !== 'create' ? dynamicPanel.id : null)
  )

  if (resolvedMode === 'create') return <CreatePdfTemplatePanel />

  if (!resolvedTemplateId) {
    return (
      <DynamicPanelShell title={t('settings.pdf_templates_editor.not_found.title')} icon={<FileOutput size={14} className="text-primary" />}>
        <div className="px-4 py-6 text-sm text-muted-foreground">{t('settings.pdf_templates_editor.not_found.missing_id')}</div>
      </DynamicPanelShell>
    )
  }

  return <EditPdfTemplateInner templateId={resolvedTemplateId} />
}
