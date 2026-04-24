/**
 * Papyrus create + detail panels for documents, doc types and templates.
 *
 * Extracted from PapyrusCorePage.tsx (which was 2675 lines) so the
 * main page file stays focused on the list/dashboard view.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  FileText, Loader2, FileCode2, FolderCog, Info, Paperclip,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormSection,
  FormGrid,
  ReadOnlyRow,
  PanelContentLayout,
  SectionColumns,
  panelInputClass,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import {
  useDocTypes,
  useUpdateDocType,
  useTemplates,
  useUpdateTemplate,
  useCreateDocument,
} from '@/hooks/usePapyrus'
import { papyrusService } from '@/services/papyrusService'
import { TabBar } from '@/components/ui/Tabs'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import type {
  DocType,
} from '@/services/papyrusService'

// -- Create Document Panel ---------------------------------------------------

export function CreateDocumentPanel() {
  const { closeDynamicPanel } = useUIStore()
  const { toast } = useToast()
  const { t } = useTranslation()
  const createDoc = useCreateDocument()
  const { data: docTypes } = useDocTypes()
  const [form, setForm] = useState({ title: '', doc_type_id: '', classification: 'INT', language: 'fr' })

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.doc_type_id) {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.title_and_type_required'), variant: 'error' })
      return
    }
    try {
      await createDoc.mutateAsync(form)
      toast({ title: t('papyrus.toast.document_created') })
      closeDynamicPanel()
    } catch {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.creation_failed'), variant: 'error' })
    }
  }, [form, createDoc, toast, closeDynamicPanel, t])

  const createDocumentActions = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: closeDynamicPanel },
    {
      id: 'submit',
      label: 'Creer',
      variant: 'primary',
      priority: 100,
      loading: createDoc.isPending,
      disabled: createDoc.isPending,
      onClick: () => (document.getElementById('create-document-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [closeDynamicPanel, createDoc.isPending])

  return (
    <DynamicPanelShell
      title="Nouveau document"
      subtitle="Papyrus"
      icon={<FileText size={14} className="text-primary" />}
      actionItems={createDocumentActions}
    >
      <form id="create-document-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SectionColumns>
            {/* Column 1: Identification */}
            <div className="@container space-y-5">
              <FormSection title={t('common.identification')}>
                <FormGrid>
                  <DynamicPanelField label={t('common.title_field')} required span="full">
                    <input
                      type="text"
                      required
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className={panelInputClass}
                      placeholder={t('papyrus.placeholders.document_title')}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.document_type')} required>
                    <select
                      required
                      value={form.doc_type_id}
                      onChange={(e) => setForm((f) => ({ ...f, doc_type_id: e.target.value }))}
                      className={panelInputClass}
                    >
                      <option value="">{t('common.select')}</option>
                      {docTypes?.map((dt: DocType) => (
                        <option key={dt.id} value={dt.id}>
                          {dt.code} — {dt.name.fr || dt.name.en || dt.code}
                        </option>
                      ))}
                    </select>
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            </div>

            {/* Column 2: Parametres */}
            <div className="@container space-y-5">
              <FormSection title={t('common.parameters')}>
                <FormGrid>
                  <DynamicPanelField label="Classification">
                    <select
                      value={form.classification}
                      onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))}
                      className={panelInputClass}
                    >
                      <option value="INT">{t('common.internal_sensitivity')}</option>
                      <option value="CONF">{t('common.confidential')}</option>
                      <option value="REST">{t('common.restricted')}</option>
                      <option value="PUB">{t('common.public')}</option>
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.language')}>
                    <select
                      value={form.language}
                      onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                      className={panelInputClass}
                    >
                      <option value="fr">Francais</option>
                      <option value="en">English</option>
                    </select>
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
              <p className="text-[10px] text-muted-foreground px-1">
                Tags, notes et fichiers joints seront gérés dans la fiche après création.
              </p>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Create DocType Panel -----------------------------------------------------

export function CreateDocTypePanel() {
  const { closeDynamicPanel } = useUIStore()
  const { toast } = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    code: '',
    name_fr: '',
    name_en: '',
    nomenclature_pattern: '{ENTITY}-{DOCTYPE}-{SEQ:4}',
    discipline: '',
    revision_scheme: 'alpha' as 'alpha' | 'numeric' | 'semver',
    default_language: 'fr',
  })

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name_fr.trim() || !form.nomenclature_pattern.trim()) {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.name_and_nomenclature_required'), variant: 'error' })
      return
    }
    try {
      await papyrusService.createDocType({
        code: form.code || '',  // Let backend auto-generate if empty
        name: { fr: form.name_fr, en: form.name_en || form.name_fr },
        nomenclature_pattern: form.nomenclature_pattern,
        discipline: form.discipline || undefined,
        revision_scheme: form.revision_scheme,
        default_language: form.default_language,
      })
      queryClient.invalidateQueries({ queryKey: ['papyrus', 'doc-types'] })
      toast({ title: t('papyrus.toast.doc_type_created') })
      closeDynamicPanel()
    } catch {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.creation_failed'), variant: 'error' })
    }
  }, [form, toast, closeDynamicPanel, queryClient, t])

  const createDocTypeActions = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: closeDynamicPanel },
    {
      id: 'submit',
      label: 'Creer',
      variant: 'primary',
      priority: 100,
      onClick: () => (document.getElementById('create-doctype-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [closeDynamicPanel])

  return (
    <DynamicPanelShell
      title="Nouveau type de document"
      subtitle="Papyrus"
      icon={<FolderCog size={14} className="text-primary" />}
      actionItems={createDocTypeActions}
    >
      <form id="create-doctype-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SectionColumns>
            <div className="@container space-y-5">
              <FormSection title={t('common.identification')}>
                <FormGrid>
                  <DynamicPanelField label={t('common.code_field')}>
                    <input type="text" value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className={cn(panelInputClass, 'font-mono')} placeholder={t('papyrus.placeholders.code_auto')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.name_fr')} required>
                    <input type="text" required value={form.name_fr} onChange={(e) => setForm(f => ({ ...f, name_fr: e.target.value }))} className={panelInputClass} placeholder={t('papyrus.placeholders.doctype_name_fr_example')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.name_en')}>
                    <input type="text" value={form.name_en} onChange={(e) => setForm(f => ({ ...f, name_en: e.target.value }))} className={panelInputClass} placeholder={t('papyrus.placeholders.doctype_name_en_example')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.discipline')}>
                    <input type="text" value={form.discipline} onChange={(e) => setForm(f => ({ ...f, discipline: e.target.value }))} className={panelInputClass} placeholder={t('papyrus.placeholders.discipline_example')} />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            </div>
            <div className="@container space-y-5">
              <FormSection title={t('common.nomenclature')}>
                <FormGrid>
                  <DynamicPanelField label="Pattern de nomenclature" required span="full">
                    <input type="text" required value={form.nomenclature_pattern} onChange={(e) => setForm(f => ({ ...f, nomenclature_pattern: e.target.value }))} className={panelInputClass} placeholder={t('papyrus.placeholders.nomenclature_example')} />
                  </DynamicPanelField>
                  <DynamicPanelField label="Schéma de révision">
                    <select value={form.revision_scheme} onChange={(e) => setForm(f => ({ ...f, revision_scheme: e.target.value as 'alpha' | 'numeric' | 'semver' }))} className={panelInputClass}>
                      <option value="alpha">Alphabetique (A, B, C...)</option>
                      <option value="numeric">Numerique (1, 2, 3...)</option>
                      <option value="semver">Semantique (1.0, 1.1...)</option>
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label="Langue par défaut">
                    <select value={form.default_language} onChange={(e) => setForm(f => ({ ...f, default_language: e.target.value }))} className={panelInputClass}>
                      <option value="fr">Français</option>
                      <option value="en">English</option>
                    </select>
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
              <p className="text-[10px] text-muted-foreground px-1">
                Tokens : {'{ENTITY}'}, {'{DOCTYPE}'}, {'{DISCIPLINE}'}, {'{PHASE}'}, {'{SEQ:N}'}, {'{YYYY}'}
              </p>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}


// -- Create Template Panel ----------------------------------------------------

export function CreateTemplatePanel() {
  const { closeDynamicPanel } = useUIStore()
  const { toast } = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: docTypes } = useDocTypes()
  const [form, setForm] = useState({
    name: '',
    description: '',
    doc_type_id: '',
  })

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.template_name_required'), variant: 'error' })
      return
    }
    try {
      await papyrusService.createTemplate({
        name: form.name,
        description: form.description || undefined,
        doc_type_id: form.doc_type_id || undefined,
        structure: {},
        styles: {},
      })
      queryClient.invalidateQueries({ queryKey: ['papyrus', 'templates'] })
      toast({ title: t('papyrus.toast.template_created') })
      closeDynamicPanel()
    } catch {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.creation_failed'), variant: 'error' })
    }
  }, [form, toast, closeDynamicPanel, queryClient, t])

  const createTemplateActions = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: closeDynamicPanel },
    {
      id: 'submit',
      label: 'Creer',
      variant: 'primary',
      priority: 100,
      onClick: () => (document.getElementById('create-template-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [closeDynamicPanel])

  return (
    <DynamicPanelShell
      title="Nouveau template"
      subtitle="Papyrus"
      icon={<FileCode2 size={14} className="text-primary" />}
      actionItems={createTemplateActions}
    >
      <form id="create-template-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title={t('common.information')}>
            <FormGrid>
              <DynamicPanelField label={t('common.name_field')} required span="full">
                <input type="text" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className={panelInputClass} placeholder={t('papyrus.placeholders.template_name')} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.document_type')}>
                <select value={form.doc_type_id} onChange={(e) => setForm(f => ({ ...f, doc_type_id: e.target.value }))} className={panelInputClass}>
                  <option value="">Tous types</option>
                  {docTypes?.map((dt: DocType) => (
                    <option key={dt.id} value={dt.id}>{dt.code} — {dt.name.fr || dt.name.en || dt.code}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.description')} span="full">
                <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className={panelInputClass + ' min-h-[60px]'} placeholder={t('papyrus.placeholders.template_description')} rows={3} />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <p className="text-[10px] text-muted-foreground px-3 pb-3">
            La structure et les styles seront édités dans le détail du template après création.
          </p>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- DocType Detail Panel ------------------------------------------------------

export function DocTypeDetailPanel({ id }: { id: string }) {
  const { toast } = useToast()
  const { t } = useTranslation()
  const { data: docTypes, isLoading } = useDocTypes()
  const updateDocType = useUpdateDocType()

  const docType = useMemo(() => docTypes?.find((dt) => dt.id === id), [docTypes, id])

  const [detailTab, setDetailTab] = useState<'informations' | 'documents'>('informations')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name_fr: '', name_en: '', discipline: '', nomenclature_pattern: '' })

  useEffect(() => {
    if (docType) {
      setForm({
        name_fr: docType.name?.fr || '',
        name_en: docType.name?.en || '',
        discipline: docType.discipline || '',
        nomenclature_pattern: docType.nomenclature_pattern || '',
      })
    }
  }, [docType])

  const handleSave = useCallback(async () => {
    if (!docType) return
    try {
      await updateDocType.mutateAsync({
        id: docType.id,
        payload: {
          name: { fr: form.name_fr, en: form.name_en || form.name_fr },
          discipline: form.discipline || undefined,
          nomenclature_pattern: form.nomenclature_pattern,
        },
      })
      toast({ title: t('papyrus.toast.doc_type_updated'), variant: 'success' })
      setEditing(false)
    } catch {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.update_failed'), variant: 'error' })
    }
  }, [docType, form, updateDocType, toast, t])

  // OpsFlux pattern: no "Modifier" button — inline edit via double-click.
  // When in edit mode we only expose Annuler/Enregistrer.
  const docTypeDetailActions = useMemo<ActionItem[]>(() => editing ? [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: () => setEditing(false) },
    { id: 'save', label: 'Enregistrer', variant: 'primary', priority: 100, loading: updateDocType.isPending, disabled: updateDocType.isPending, onClick: handleSave },
  ] : [], [editing, updateDocType.isPending, handleSave])

  if (isLoading) {
    return (
      <DynamicPanelShell title="Type de document" subtitle={t('common.loading_ellipsis')} icon={<FolderCog size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  if (!docType) {
    return (
      <DynamicPanelShell title="Type de document" subtitle={t('common.not_found')} icon={<FolderCog size={14} className="text-primary" />}>
        <div className="p-4 text-sm text-muted-foreground">Type de document introuvable.</div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={docType.code}
      subtitle="Type de document"
      icon={<FolderCog size={14} className="text-primary" />}
      actionItems={docTypeDetailActions}
    >
      <TabBar
        items={[
          { id: 'informations', label: 'Informations', icon: Info },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as 'informations' | 'documents')}
        variant="muted"
        className="px-3 pt-2"
      />
      {detailTab === 'informations' && (
      <PanelContentLayout>
        <FormSection title={t('common.identification')}>
          <FormGrid>
            <ReadOnlyRow label={t('common.code_field')} value={docType.code} />
            {editing ? (
              <>
                <DynamicPanelField label={t('common.name_fr')}>
                  <input type="text" value={form.name_fr} onChange={(e) => setForm(f => ({ ...f, name_fr: e.target.value }))} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.name_en')}>
                  <input type="text" value={form.name_en} onChange={(e) => setForm(f => ({ ...f, name_en: e.target.value }))} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.discipline')}>
                  <input type="text" value={form.discipline} onChange={(e) => setForm(f => ({ ...f, discipline: e.target.value }))} className={panelInputClass} />
                </DynamicPanelField>
              </>
            ) : (
              <>
                <ReadOnlyRow label="Nom (FR)" value={docType.name?.fr || '--'} />
                <ReadOnlyRow label="Nom (EN)" value={docType.name?.en || '--'} />
                <ReadOnlyRow label="Discipline" value={docType.discipline || '--'} />
              </>
            )}
          </FormGrid>
        </FormSection>
        <FormSection title={t('common.nomenclature')}>
          <FormGrid>
            {editing ? (
              <DynamicPanelField label="Pattern" span="full">
                <input type="text" value={form.nomenclature_pattern} onChange={(e) => setForm(f => ({ ...f, nomenclature_pattern: e.target.value }))} className={panelInputClass} />
              </DynamicPanelField>
            ) : (
              <ReadOnlyRow label="Pattern" value={docType.nomenclature_pattern} />
            )}
            <ReadOnlyRow label="Schema de revision" value={docType.revision_scheme} />
            <ReadOnlyRow label="Langue par defaut" value={docType.default_language} />
            <ReadOnlyRow label={t('common.active')} value={docType.is_active ? 'Oui' : 'Non'} />
          </FormGrid>
        </FormSection>
      </PanelContentLayout>
      )}
      {detailTab === 'documents' && (
      <PanelContentLayout>
        <FormSection title={t('common.attached_files')} collapsible defaultExpanded>
          <AttachmentManager ownerType="document_type" ownerId={id} compact />
        </FormSection>
      </PanelContentLayout>
      )}
    </DynamicPanelShell>
  )
}


// -- Template Detail Panel ----------------------------------------------------

export function TemplateDetailPanel({ id }: { id: string }) {
  const { toast } = useToast()
  const { t } = useTranslation()
  const { data: templates, isLoading } = useTemplates()
  const { data: docTypes } = useDocTypes()
  const updateTemplate = useUpdateTemplate()

  const template = useMemo(() => templates?.find((tmpl) => tmpl.id === id), [templates, id])
  const docTypeName = useMemo(() => {
    if (!template?.doc_type_id || !docTypes) return '--'
    const dt = docTypes.find((d) => d.id === template.doc_type_id)
    return dt ? `${dt.code} — ${dt.name?.fr || dt.code}` : '--'
  }, [template, docTypes])

  const [detailTab, setDetailTab] = useState<'informations' | 'documents'>('informations')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name || '',
        description: template.description || '',
      })
    }
  }, [template])

  const handleSave = useCallback(async () => {
    if (!template) return
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        payload: {
          name: form.name,
          description: form.description || undefined,
        },
      })
      toast({ title: t('papyrus.toast.template_updated'), variant: 'success' })
      setEditing(false)
    } catch {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.update_failed'), variant: 'error' })
    }
  }, [template, form, updateTemplate, toast, t])

  // OpsFlux pattern: no "Modifier" button — inline edit via double-click.
  const templateDetailActions = useMemo<ActionItem[]>(() => editing ? [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: () => setEditing(false) },
    { id: 'save', label: 'Enregistrer', variant: 'primary', priority: 100, loading: updateTemplate.isPending, disabled: updateTemplate.isPending, onClick: handleSave },
  ] : [], [editing, updateTemplate.isPending, handleSave])

  if (isLoading) {
    return (
      <DynamicPanelShell title="Template" subtitle={t('common.loading_ellipsis')} icon={<FileCode2 size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  if (!template) {
    return (
      <DynamicPanelShell title="Template" subtitle={t('common.not_found')} icon={<FileCode2 size={14} className="text-primary" />}>
        <div className="p-4 text-sm text-muted-foreground">Template introuvable.</div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={template.name}
      subtitle="Template"
      icon={<FileCode2 size={14} className="text-primary" />}
      actionItems={templateDetailActions}
    >
      <TabBar
        items={[
          { id: 'informations', label: 'Informations', icon: Info },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as 'informations' | 'documents')}
        variant="muted"
        className="px-3 pt-2"
      />
      {detailTab === 'informations' && (
      <PanelContentLayout>
        <FormSection title={t('common.information')}>
          <FormGrid>
            {editing ? (
              <>
                <DynamicPanelField label={t('common.name_field')} span="full">
                  <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.description')} span="full">
                  <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className={panelInputClass + ' min-h-[60px]'} rows={3} />
                </DynamicPanelField>
              </>
            ) : (
              <>
                <ReadOnlyRow label={t('common.name_field')} value={template.name} />
                <ReadOnlyRow label={t('common.description')} value={template.description || '--'} />
              </>
            )}
            <ReadOnlyRow label="Type de document" value={docTypeName} />
            <ReadOnlyRow label={t('common.version')} value={String(template.version)} />
            <ReadOnlyRow label="Nombre de champs" value={String(template.field_count)} />
            <ReadOnlyRow label={t('common.active')} value={template.is_active ? 'Oui' : 'Non'} />
          </FormGrid>
        </FormSection>
      </PanelContentLayout>
      )}
      {detailTab === 'documents' && (
      <PanelContentLayout>
        <FormSection title={t('common.attached_files')} collapsible defaultExpanded>
          <AttachmentManager ownerType="template" ownerId={id} compact />
        </FormSection>
      </PanelContentLayout>
      )}
    </DynamicPanelShell>
  )
}
