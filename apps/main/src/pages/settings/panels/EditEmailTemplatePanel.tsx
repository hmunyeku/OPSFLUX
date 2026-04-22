/**
 * EditEmailTemplatePanel — Professional email template editor.
 *
 * Features:
 *  - Rich text editor (contentEditable + toolbar) with HTML source toggle
 *  - Variable chips clickable to insert into editor
 *  - Inline version editing (subject + body)
 *  - Version activation/deactivation per language
 *  - Live preview with rendered Jinja2 variables
 *  - Duplicate version to another language
 *  - Scheduling (valid_from / valid_until)
 *  - Template metadata editing
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Mail,
  Loader2,
  Plus,
  Check,
  X,
  Eye,
  Play,
  Trash2,
  Calendar,
  Languages,
  Copy,
  Code2,
  Pencil,
  Save,
  Bold,
  Italic,
  Underline,
  Link,
  List,
  ListOrdered,
  Heading2,
  AlignLeft,
  AlignCenter,
  Undo2,
  Redo2,
  Type,
  Variable,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useConfirm, usePromptInput } from '@/components/ui/ConfirmDialog'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormSection,
  PanelActionButton,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import {
  useEmailTemplate,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
  useCreateTemplateVersion,
  useUpdateTemplateVersion,
  useActivateTemplateVersion,
  useDeleteTemplateVersion,
  usePreviewTemplate,
  type EmailTemplateVersion,
  type EmailTemplateFull,
} from '@/hooks/useEmailTemplates'

// ── Constants ────────────────────────────────────────────────

const LANG_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'ar', label: 'العربية' },
]

const OBJECT_TYPES = [
  { value: 'system', label: 'Système' },
  { value: 'user', label: 'Utilisateur' },
  { value: 'tier', label: 'Tiers' },
  { value: 'asset', label: 'Actif' },
]

const SAMPLE_VARIABLES: Record<string, unknown> = {
  user: { first_name: 'Jean', last_name: 'Dupont', email: 'alice.dupont@example.com' },
  entity: { name: 'ACME Energy S.A.' },
  inviter: { first_name: 'Marie', last_name: 'Curie' },
  verification_url: 'https://app.opsflux.io/verify?token=abc123',
  invitation_url: 'https://app.opsflux.io/signup?token=xyz789',
  reset_url: 'https://app.opsflux.io/reset?token=def456',
  login_url: 'https://app.opsflux.io/login',
}

// ═══════════════════════════════════════════════════════════════
// Rich Text Editor Component
// ═══════════════════════════════════════════════════════════════

interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  variables?: Record<string, string>
  placeholder?: string
  minHeight?: number
}

function RichEditor({ value, onChange, variables, placeholder, minHeight = 200 }: RichEditorProps) {
  const { t } = useTranslation()
  const editorRef = useRef<HTMLDivElement>(null)
  const promptInput = usePromptInput()
  const [isSource, setIsSource] = useState(false)
  const [sourceCode, setSourceCode] = useState(value)
  const isUpdatingRef = useRef(false)

  // Sync value → editor when value changes externally
  useEffect(() => {
    if (editorRef.current && !isSource && !isUpdatingRef.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || ''
      }
    }
  }, [value, isSource])

  // Switch between source and visual modes
  const toggleSource = useCallback(() => {
    if (isSource) {
      // Switching to visual → apply source
      onChange(sourceCode)
    } else {
      // Switching to source → get current HTML
      setSourceCode(editorRef.current?.innerHTML || value)
    }
    setIsSource(!isSource)
  }, [isSource, sourceCode, value, onChange])

  const handleEditorInput = useCallback(() => {
    if (editorRef.current) {
      isUpdatingRef.current = true
      onChange(editorRef.current.innerHTML)
      requestAnimationFrame(() => { isUpdatingRef.current = false })
    }
  }, [onChange])

  const execCmd = useCallback((cmd: string, val?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
    handleEditorInput()
  }, [handleEditorInput])

  const insertVariable = useCallback((varKey: string) => {
    editorRef.current?.focus()
    const tag = `{{ ${varKey} }}`
    document.execCommand('insertText', false, tag)
    handleEditorInput()
  }, [handleEditorInput])

  const insertLink = useCallback(async () => {
    const url = await promptInput({ title: 'Insérer un lien', placeholder: 'https://...' })
    if (url) execCmd('createLink', url)
  }, [execCmd, promptInput])

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/50 flex-wrap">
        <ToolbarBtn onClick={() => execCmd('bold')} title="Gras" disabled={isSource}>
          <Bold size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('italic')} title="Italique" disabled={isSource}>
          <Italic size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('underline')} title={t('settings.pdf_templates_editor.rich_editor.underline')} disabled={isSource}>
          <Underline size={13} />
        </ToolbarBtn>
        <ToolbarSep />
        <ToolbarBtn onClick={() => execCmd('formatBlock', 'h2')} title="Titre" disabled={isSource}>
          <Heading2 size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('formatBlock', 'p')} title="Paragraphe" disabled={isSource}>
          <Type size={13} />
        </ToolbarBtn>
        <ToolbarSep />
        <ToolbarBtn onClick={() => execCmd('insertUnorderedList')} title={t('settings.liste_a_puces')} disabled={isSource}>
          <List size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('insertOrderedList')} title={t('settings.pdf_templates_editor.rich_editor.numbered_list')} disabled={isSource}>
          <ListOrdered size={13} />
        </ToolbarBtn>
        <ToolbarSep />
        <ToolbarBtn onClick={insertLink} title={t('settings.pdf_templates_editor.rich_editor.insert_link_title')} disabled={isSource}>
          <Link size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('justifyLeft')} title={t('settings.pdf_templates_editor.rich_editor.align_left')} disabled={isSource}>
          <AlignLeft size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('justifyCenter')} title="Centrer" disabled={isSource}>
          <AlignCenter size={13} />
        </ToolbarBtn>
        <ToolbarSep />
        <ToolbarBtn onClick={() => execCmd('undo')} title="Annuler" disabled={isSource}>
          <Undo2 size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => execCmd('redo')} title={t('settings.pdf_templates_editor.rich_editor.redo')} disabled={isSource}>
          <Redo2 size={13} />
        </ToolbarBtn>

        <div className="flex-1" />

        {/* Source toggle */}
        <ToolbarBtn onClick={toggleSource} title={isSource ? 'Éditeur visuel' : 'Code source HTML'} active={isSource}>
          <Code2 size={13} />
        </ToolbarBtn>
      </div>

      {/* Variable chips */}
      {variables && Object.keys(variables).length > 0 && !isSource && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50 bg-muted/30 flex-wrap">
          <Variable size={11} className="text-muted-foreground mr-0.5 shrink-0" />
          {Object.entries(variables).map(([key, desc]) => (
            <button
              key={key}
              onClick={() => insertVariable(key)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
              title={String(desc)}
            >
              {key}
            </button>
          ))}
        </div>
      )}

      {/* Editor area */}
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
  children: React.ReactNode
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
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
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

// ═══════════════════════════════════════════════════════════════
// Create Panel
// ═══════════════════════════════════════════════════════════════

function CreatePanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const createMutation = useCreateEmailTemplate()

  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [objectType, setObjectType] = useState('system')

  const canSubmit = slug.trim().length > 0 && name.trim().length > 0 && !createMutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await createMutation.mutateAsync({
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        object_type: objectType,
      })
      toast({ title: t('settings.toast.email_templates.created'), variant: 'success' })
      openDynamicPanel({
        module: 'settings-email-template',
        type: 'edit',
        id: result.id,
        data: { templateId: result.id },
      })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('settings.toast.email_templates.create_error')
      toast({ title: t('settings.toast.error'), description: message, variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouveau modèle d'email"
      icon={<Mail size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={!canSubmit}
            onClick={() => (document.getElementById('create-template-form') as HTMLFormElement | null)?.requestSubmit()}
          >
            {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-template-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <FormSection title={t('common.information')}>
          <DynamicPanelField label="Slug (identifiant technique)" required>
            <input
              type="text"
              className={`${panelInputClass} font-mono`}
              placeholder="ex: user_invitation"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Identifiant unique, lettres minuscules et underscores uniquement.
            </p>
          </DynamicPanelField>

          <DynamicPanelField label={t('common.name_field')} required>
            <input
              type="text"
              className={panelInputClass}
              placeholder={t('settings.ex_invitation_utilisateur')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </DynamicPanelField>

          <DynamicPanelField label={t('common.description')}>
            <textarea
              className={`${panelInputClass} min-h-[60px]`}
              placeholder={t('settings.description_du_modele')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </DynamicPanelField>

          <DynamicPanelField label={t('common.object_type')}>
            <select className="gl-form-select" value={objectType} onChange={(e) => setObjectType(e.target.value)}>
              {OBJECT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </DynamicPanelField>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}

// ═══════════════════════════════════════════════════════════════
// Edit Panel
// ═══════════════════════════════════════════════════════════════

function EditPanel({ templateId }: { templateId: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: template, isLoading } = useEmailTemplate(templateId)
  const updateTemplateMutation = useUpdateEmailTemplate()
  const deleteMutation = useDeleteEmailTemplate()
  const createVersionMutation = useCreateTemplateVersion()
  const updateVersionMutation = useUpdateTemplateVersion()
  const activateVersionMutation = useActivateTemplateVersion()
  const deleteVersionMutation = useDeleteTemplateVersion()
  const previewMutation = usePreviewTemplate()

  // Active tab: which version is being edited
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [showNewVersion, setShowNewVersion] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<{ subject: string; body: string } | null>(null)
  const [showMetadataEdit, setShowMetadataEdit] = useState(false)

  // Metadata editing state
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editObjectType, setEditObjectType] = useState('')

  // New version form state
  const [newLang, setNewLang] = useState('fr')
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newValidFrom, setNewValidFrom] = useState('')
  const [newValidUntil, setNewValidUntil] = useState('')

  // Auto-select first version when data loads
  useEffect(() => {
    if (template && template.versions.length > 0 && !activeVersionId) {
      const active = template.versions.find((v) => v.is_active)
      setActiveVersionId(active?.id ?? template.versions[0].id)
    }
  }, [template, activeVersionId])

  const startMetadataEdit = useCallback(() => {
    if (!template) return
    setEditName(template.name)
    setEditDescription(template.description ?? '')
    setEditObjectType(template.object_type)
    setShowMetadataEdit(true)
  }, [template])

  const saveMetadata = useCallback(async () => {
    if (!template) return
    try {
      await updateTemplateMutation.mutateAsync({
        id: templateId,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        object_type: editObjectType,
      })
      toast({ title: t('settings.toast.email_templates.updated'), variant: 'success' })
      setShowMetadataEdit(false)
    } catch {
      toast({ title: t('settings.toast.error'), variant: 'error' })
    }
  }, [templateId, editName, editDescription, editObjectType, updateTemplateMutation, template, toast])

  const handleDelete = useCallback(async () => {
    const ok = await confirm({
      title: 'Supprimer le modèle',
      message: 'Supprimer ce modèle et toutes ses versions ? Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMutation.mutateAsync(templateId)
      toast({ title: t('settings.toast.email_templates.deleted'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('settings.toast.error'), variant: 'error' })
    }
  }, [templateId, deleteMutation, toast, closeDynamicPanel, confirm])

  const handleCreateVersion = useCallback(async () => {
    if (!newSubject.trim() || !newBody.trim()) return
    try {
      const created = await createVersionMutation.mutateAsync({
        templateId,
        language: newLang,
        subject: newSubject.trim(),
        body_html: newBody.trim(),
        is_active: true,
        valid_from: newValidFrom || null,
        valid_until: newValidUntil || null,
      })
      toast({ title: t('settings.toast.email_templates.version_created'), variant: 'success' })
      setShowNewVersion(false)
      setNewSubject('')
      setNewBody('')
      setNewValidFrom('')
      setNewValidUntil('')
      setActiveVersionId(created.id)
    } catch {
      toast({ title: t('settings.toast.error'), variant: 'error' })
    }
  }, [templateId, newLang, newSubject, newBody, createVersionMutation, toast])

  const handleActivate = useCallback(async (versionId: string) => {
    try {
      await activateVersionMutation.mutateAsync({ templateId, versionId })
      toast({ title: t('settings.toast.email_templates.version_activated'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), variant: 'error' })
    }
  }, [templateId, activateVersionMutation, toast])

  const handleDeleteVersion = useCallback(async (versionId: string) => {
    const ok = await confirm({
      title: 'Supprimer la version',
      message: 'Supprimer cette version de l\'email ? L\'historique sera perdu.',
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteVersionMutation.mutateAsync({ templateId, versionId })
      toast({ title: t('settings.toast.email_templates.version_deleted'), variant: 'success' })
      if (activeVersionId === versionId) setActiveVersionId(null)
    } catch {
      toast({ title: t('settings.toast.error'), variant: 'error' })
    }
  }, [templateId, deleteVersionMutation, toast, activeVersionId, confirm])

  const handleDuplicate = useCallback(async (version: EmailTemplateVersion) => {
    const targetLang = version.language === 'fr' ? 'en' : 'fr'
    try {
      const created = await createVersionMutation.mutateAsync({
        templateId,
        language: targetLang,
        subject: version.subject,
        body_html: version.body_html,
        is_active: false,
      })
      toast({
        title: t('settings.toast.email_templates.version_duplicated'),
        description: t('settings.toast.email_templates.version_duplicated_desc', { lang: LANG_OPTIONS.find((l) => l.value === targetLang)?.label ?? targetLang }),
        variant: 'success',
      })
      setActiveVersionId(created.id)
    } catch {
      toast({ title: t('settings.toast.error'), variant: 'error' })
    }
  }, [templateId, createVersionMutation, toast, t])

  const handlePreview = useCallback(async (version: EmailTemplateVersion) => {
    try {
      const result = await previewMutation.mutateAsync({
        templateId,
        versionId: version.id,
        variables: SAMPLE_VARIABLES,
      })
      setPreviewHtml({ subject: result.subject, body: result.body_html })
    } catch {
      toast({ title: t('settings.toast.email_templates.preview_error'), variant: 'error' })
    }
  }, [templateId, previewMutation, toast])

  if (isLoading || !template) {
    return (
      <DynamicPanelShell
        title="Modèle d'email"
        icon={<Mail size={14} className="text-primary" />}
        actions={<PanelActionButton onClick={closeDynamicPanel}>Fermer</PanelActionButton>}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  // Group versions by language
  const versionsByLang: Record<string, EmailTemplateVersion[]> = {}
  for (const v of template.versions) {
    if (!versionsByLang[v.language]) versionsByLang[v.language] = []
    versionsByLang[v.language].push(v)
  }
  for (const lang of Object.keys(versionsByLang)) {
    versionsByLang[lang].sort((a, b) => b.version - a.version)
  }

  const activeVersion = template.versions.find((v) => v.id === activeVersionId)

  return (
    <DynamicPanelShell
      title={template.name}
      subtitle={template.slug}
      icon={<Mail size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton variant="danger" onClick={handleDelete}>
            <Trash2 size={12} />
          </PanelActionButton>
          <PanelActionButton onClick={closeDynamicPanel}>Fermer</PanelActionButton>
        </>
      }
    >
      <div className="p-4 space-y-4">
        {/* ══ Template metadata ══ */}
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => showMetadataEdit ? setShowMetadataEdit(false) : startMetadataEdit()}
            className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Informations
            </span>
            <Pencil size={11} className="text-muted-foreground" />
          </button>

          {!showMetadataEdit ? (
            <div className="px-3 py-2 space-y-1.5 text-sm">
              <MetadataRow label="Slug" value={<code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">{template.slug}</code>} />
              <MetadataRow label="Type" value={OBJECT_TYPES.find((t) => t.value === template.object_type)?.label ?? template.object_type} />
              <MetadataRow
                label="Statut"
                value={
                  <span className={cn('text-xs font-semibold', template.enabled ? 'text-green-600' : 'text-red-500')}>
                    {template.enabled ? '● Activé' : '○ Désactivé'}
                  </span>
                }
              />
              {template.description && <MetadataRow label="Description" value={template.description} />}
            </div>
          ) : (
            <div className="px-3 py-3 space-y-3">
              <DynamicPanelField label={t('common.name_field')}>
                <input type="text" className={panelInputClass} value={editName} onChange={(e) => setEditName(e.target.value)} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.description')}>
                <textarea className={`${panelInputClass} min-h-[50px]`} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.object_type')}>
                <select className="gl-form-select" value={editObjectType} onChange={(e) => setEditObjectType(e.target.value)}>
                  {OBJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </DynamicPanelField>
              <div className="flex gap-2">
                <button onClick={saveMetadata} disabled={updateTemplateMutation.isPending} className="gl-button-sm gl-button-confirm">
                  {updateTemplateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Enregistrer
                </button>
                <button onClick={() => setShowMetadataEdit(false)} className="gl-button-sm gl-button-default">{t('common.cancel')}</button>
              </div>
            </div>
          )}
        </div>

        {/* ══ Version tabs (by language) ══ */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Versions ({template.versions.length})
            </span>
            <button
              onClick={() => { setShowNewVersion(true); setActiveVersionId(null) }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Plus size={11} /> Nouvelle
            </button>
          </div>

          {Object.entries(versionsByLang).map(([lang, versions]) => (
            <div key={lang}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/20 border-b border-border/50">
                <Languages size={11} className="text-muted-foreground" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {LANG_OPTIONS.find((l) => l.value === lang)?.label ?? lang}
                </span>
              </div>
              {versions.map((v) => (
                <div
                  key={v.id}
                  onClick={() => { setActiveVersionId(v.id); setShowNewVersion(false); setPreviewHtml(null) }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-b border-border/30 last:border-b-0',
                    activeVersionId === v.id
                      ? 'bg-primary/5 border-l-2 border-l-primary'
                      : 'hover:bg-accent/50',
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">v{v.version}</span>
                    {v.is_active ? (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                        ACTIF
                      </span>
                    ) : (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                        INACTIF
                      </span>
                    )}
                    <span className="text-xs text-foreground truncate">{v.subject}</span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <MiniBtn onClick={(e) => { e.stopPropagation(); handlePreview(v) }} title={t('settings.previsualiser')}>
                      <Eye size={11} />
                    </MiniBtn>
                    <MiniBtn onClick={(e) => { e.stopPropagation(); handleDuplicate(v) }} title="Dupliquer vers autre langue">
                      <Copy size={11} />
                    </MiniBtn>
                    {!v.is_active && (
                      <MiniBtn onClick={(e) => { e.stopPropagation(); handleActivate(v.id) }} title="Activer" className="text-green-600">
                        <Play size={11} />
                      </MiniBtn>
                    )}
                    <MiniBtn onClick={(e) => { e.stopPropagation(); handleDeleteVersion(v.id) }} title="Supprimer" className="text-destructive">
                      <Trash2 size={11} />
                    </MiniBtn>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {template.versions.length === 0 && !showNewVersion && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground mb-2">{t('settings.aucune_version_creez_en_une_pour_commenc')}</p>
              <button onClick={() => setShowNewVersion(true)} className="gl-button-sm gl-button-confirm">
                <Plus size={12} /> Créer une version
              </button>
            </div>
          )}
        </div>

        {/* ══ Version editor (active version) ══ */}
        {activeVersion && !showNewVersion && (
          <VersionEditor
            key={activeVersion.id}
            templateId={templateId}
            version={activeVersion}
            template={template}
            onSave={async (subject, bodyHtml, validFrom, validUntil) => {
              try {
                await updateVersionMutation.mutateAsync({
                  templateId,
                  versionId: activeVersion.id,
                  subject,
                  body_html: bodyHtml,
                  valid_from: validFrom,
                  valid_until: validUntil,
                })
                toast({ title: t('settings.toast.email_templates.version_updated'), variant: 'success' })
              } catch {
                toast({ title: t('settings.toast.error'), variant: 'error' })
              }
            }}
            isSaving={updateVersionMutation.isPending}
          />
        )}

        {/* ══ New version form ══ */}
        {showNewVersion && (
          <div className="rounded-lg border border-primary/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-primary/20">
              <span className="text-xs font-semibold text-primary">{t('settings.pdf_templates_editor.actions.new_version')}</span>
              <button onClick={() => setShowNewVersion(false)} className="p-0.5 rounded hover:bg-accent">
                <X size={12} className="text-muted-foreground" />
              </button>
            </div>
            <div className="p-3 space-y-3">
              <DynamicPanelField label={t('common.language')}>
                <select className="gl-form-select" value={newLang} onChange={(e) => setNewLang(e.target.value)}>
                  {LANG_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </DynamicPanelField>

              <DynamicPanelField label="Sujet" required>
                <input
                  type="text"
                  className={`${panelInputClass} text-sm`}
                  placeholder="Sujet de l'email (supporte {{ variables }})"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                />
              </DynamicPanelField>

              <DynamicPanelField label="Corps de l'email" required>
                <RichEditor
                  value={newBody}
                  onChange={setNewBody}
                  variables={template.variables_schema ?? undefined}
                  placeholder="Rédigez le contenu de l'email..."
                  minHeight={180}
                />
              </DynamicPanelField>

              {/* Scheduling */}
              <div className="rounded-lg border border-border/50 p-3 space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Calendar size={11} className="text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Programmation (optionnel)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <DynamicPanelField label={t('settings.active_a_partir_du')}>
                    <input
                      type="datetime-local"
                      className={`${panelInputClass} text-xs`}
                      value={newValidFrom}
                      onChange={(e) => setNewValidFrom(e.target.value)}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.active_until')}>
                    <input
                      type="datetime-local"
                      className={`${panelInputClass} text-xs`}
                      value={newValidUntil}
                      onChange={(e) => setNewValidUntil(e.target.value)}
                    />
                  </DynamicPanelField>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Laissez vide pour une version active en permanence.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleCreateVersion}
                  disabled={!newSubject.trim() || !newBody.trim() || createVersionMutation.isPending}
                  className="gl-button-sm gl-button-confirm"
                >
                  {createVersionMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Créer la version
                </button>
                <button onClick={() => setShowNewVersion(false)} className="gl-button-sm gl-button-default">{t('common.cancel')}</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ Preview panel ══ */}
        {previewHtml && (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-1.5">
                <Eye size={12} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Prévisualisation
                </span>
              </div>
              <button onClick={() => setPreviewHtml(null)} className="p-0.5 rounded hover:bg-accent">
                <X size={12} className="text-muted-foreground" />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-border/50 bg-muted/20">
              <span className="text-[10px] text-muted-foreground">Sujet : </span>
              <span className="text-xs font-medium text-foreground">{previewHtml.subject}</span>
            </div>
            <div
              className="p-4 text-sm bg-white dark:bg-zinc-950 prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: previewHtml.body }}
            />
          </div>
        )}
      </div>
    </DynamicPanelShell>
  )
}

// ═══════════════════════════════════════════════════════════════
// Version Editor (inline edit existing version)
// ═══════════════════════════════════════════════════════════════

function VersionEditor({
  version,
  template,
  onSave,
  isSaving,
}: {
  templateId: string
  version: EmailTemplateVersion
  template: EmailTemplateFull
  onSave: (subject: string, bodyHtml: string, validFrom: string | null, validUntil: string | null) => Promise<void>
  isSaving: boolean
}) {
  const { t } = useTranslation()
  const [subject, setSubject] = useState(version.subject)
  const [bodyHtml, setBodyHtml] = useState(version.body_html)
  const [validFrom, setValidFrom] = useState(version.valid_from?.slice(0, 16) ?? '')
  const [validUntil, setValidUntil] = useState(version.valid_until?.slice(0, 16) ?? '')

  const hasChanges =
    subject !== version.subject ||
    bodyHtml !== version.body_html ||
    (validFrom || null) !== (version.valid_from?.slice(0, 16) ?? null) ||
    (validUntil || null) !== (version.valid_until?.slice(0, 16) ?? null)

  useEffect(() => {
    setSubject(version.subject)
    setBodyHtml(version.body_html)
    setValidFrom(version.valid_from?.slice(0, 16) ?? '')
    setValidUntil(version.valid_until?.slice(0, 16) ?? '')
  }, [version.id, version.subject, version.body_html, version.valid_from, version.valid_until])

  const handleSave = () => onSave(subject, bodyHtml, validFrom || null, validUntil || null)
  const handleReset = () => {
    setSubject(version.subject)
    setBodyHtml(version.body_html)
    setValidFrom(version.valid_from?.slice(0, 16) ?? '')
    setValidUntil(version.valid_until?.slice(0, 16) ?? '')
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Pencil size={11} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Éditeur — v{version.version} ({LANG_OPTIONS.find((l) => l.value === version.language)?.label ?? version.language})
          </span>
          {version.is_active && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              ACTIF
            </span>
          )}
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
          >
            {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Enregistrer
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Subject */}
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
            Sujet
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={`${panelInputClass} text-sm`}
            placeholder="Sujet de l'email..."
          />
        </div>

        {/* Body editor */}
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
            Corps de l'email
          </label>
          <RichEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            variables={template.variables_schema ?? undefined}
            placeholder="Rédigez le contenu de l'email..."
            minHeight={200}
          />
        </div>

        {/* Scheduling section */}
        <div className="rounded-lg border border-border/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar size={11} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Programmation
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DynamicPanelField label={t('settings.active_a_partir_du')}>
              <input
                type="datetime-local"
                className={`${panelInputClass} text-xs`}
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.active_until')}>
              <input
                type="datetime-local"
                className={`${panelInputClass} text-xs`}
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </DynamicPanelField>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Laissez vide pour une version active en permanence. La version ne sera utilisée que pendant la période définie.
          </p>
        </div>

        {/* Save/cancel buttons */}
        {hasChanges && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="gl-button-sm gl-button-confirm"
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Enregistrer les modifications
            </button>
            <button onClick={handleReset} className="gl-button-sm gl-button-default">
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Small components
// ═══════════════════════════════════════════════════════════════

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-muted-foreground w-20 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  )
}

function MiniBtn({
  children,
  onClick,
  title,
  className,
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title: string
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn('p-1 rounded hover:bg-accent/80 transition-colors text-muted-foreground', className)}
    >
      {children}
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════

export function EditEmailTemplatePanel() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const templateId = dynamicPanel?.data?.templateId as string | undefined

  if (dynamicPanel?.type === 'create') {
    return <CreatePanel />
  }

  if (templateId) {
    return <EditPanel templateId={templateId} />
  }

  return null
}
