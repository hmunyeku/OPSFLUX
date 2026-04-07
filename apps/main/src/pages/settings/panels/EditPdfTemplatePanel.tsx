import { useEffect, useMemo, useState } from 'react'
import {
  FileOutput,
  Loader2,
  Eye,
  Save,
  Plus,
  Upload,
  Trash2,
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormSection,
  FormGrid,
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
  type PdfTemplateVersion,
} from '@/hooks/usePdfTemplates'

const LANG_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
] as const

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
        { tracking_code: 'CGO-001', request_code: 'LTR-001', designation: 'Pompe', description: 'Pompe', destination_name: 'Site Bravo', receiver_name: 'Log Base', weight_kg: 220, package_count: 2, status: 'registered', status_label: 'Enregistré' },
        { tracking_code: 'CGO-002', request_code: 'LTR-001', designation: 'Caisse outillage', description: 'Caisse outillage', destination_name: 'Site Bravo', receiver_name: 'Log Base', weight_kg: 205.5, package_count: 5, status: 'loaded', status_label: 'Chargé' },
      ],
    }
  }
  if (slug === 'cargo.lt') {
    return {
      ...base,
      request_code: 'LTR-2026-0012',
      request_title: 'Demande d’expédition matériel forage',
      request_status: 'approved',
      sender_name: 'Base logistique',
      receiver_name: 'Chef de site Bravo',
      destination_name: 'Site Bravo',
      requester_name: 'A. User',
      description: 'Acheminement de matériel critique pour intervention.',
      imputation_reference: 'IMP-001 Forage',
      total_cargo_items: 2,
      total_weight_kg: 425.5,
      total_packages: 7,
      cargo_items: [
        { tracking_code: 'CGO-001', designation: 'Pompe', description: 'Pompe', cargo_type: 'unit', weight_kg: 220, package_count: 2, status: 'registered', status_label: 'Enregistré' },
        { tracking_code: 'CGO-002', designation: 'Caisse outillage', description: 'Caisse outillage', cargo_type: 'consumable', weight_kg: 205.5, package_count: 5, status: 'loaded', status_label: 'Chargé' },
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

export function EditPdfTemplatePanel({
  templateId,
  mode = 'edit',
}: {
  templateId?: string | null
  mode?: 'create' | 'edit'
}) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const { data: template, isLoading } = usePdfTemplate(mode === 'edit' ? (templateId ?? null) : null)
  const createTemplate = useCreatePdfTemplate()
  const updateTemplate = useUpdatePdfTemplate()
  const deleteTemplate = useDeletePdfTemplate()
  const createVersion = useCreatePdfVersion()
  const publishVersion = usePublishPdfVersion()
  const deleteVersion = useDeletePdfVersion()
  const previewTemplate = usePreviewPdfTemplate()

  const versions = useMemo(() => (template?.versions ?? []).slice().sort((a, b) => {
    if (a.language !== b.language) return a.language.localeCompare(b.language)
    return b.version_number - a.version_number
  }), [template?.versions])

  const [metaForm, setMetaForm] = useState({
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
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [versionForm, setVersionForm] = useState({
    language: 'fr',
    body_html: '',
    header_html: '',
    footer_html: '',
    is_published: false,
  })
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!template) return
    setMetaForm({
      slug: template.slug,
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
    setPreviewHtml(null)
  }, [selectedVersionId, versions])

  const selectedVersion = versions.find((item) => item.id === selectedVersionId) ?? null
  const sampleVariables = useMemo(
    () => buildSampleVariables(template?.slug ?? metaForm.slug, template?.variables_schema),
    [metaForm.slug, template?.slug, template?.variables_schema],
  )

  const handleSaveMeta = async () => {
    try {
      if (mode === 'create') {
        const created = await createTemplate.mutateAsync({
          ...metaForm,
          description: metaForm.description || undefined,
        })
        toast({ title: 'Modèle PDF créé', variant: 'success' })
        closeDynamicPanel()
        useUIStore.getState().openDynamicPanel({
          module: 'settings-pdf-template',
          type: 'edit',
          id: created.id,
          data: { templateId: created.id },
        })
        return
      }
      await updateTemplate.mutateAsync({
        id: templateId!,
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
      toast({ title: 'Métadonnées PDF mises à jour', variant: 'success' })
    } catch {
      toast({ title: 'Erreur sur le modèle PDF', variant: 'error' })
    }
  }

  const handleCreateVersion = async () => {
    if (!templateId) return
    try {
      const created = await createVersion.mutateAsync({
        templateId,
        language: versionForm.language,
        body_html: versionForm.body_html,
        header_html: versionForm.header_html || undefined,
        footer_html: versionForm.footer_html || undefined,
        is_published: versionForm.is_published,
      })
      setSelectedVersionId(created.id)
      toast({ title: 'Version PDF créée', variant: 'success' })
    } catch {
      toast({ title: 'Impossible de créer la version', variant: 'error' })
    }
  }

  const handleDuplicateVersion = () => {
    if (!selectedVersion) return
    setSelectedVersionId(null)
    setVersionForm({
      language: selectedVersion.language === 'fr' ? 'en' : 'fr',
      body_html: selectedVersion.body_html,
      header_html: selectedVersion.header_html ?? '',
      footer_html: selectedVersion.footer_html ?? '',
      is_published: false,
    })
  }

  const handlePreviewHtml = async () => {
    if (!templateId) return
    try {
      const targetVersionId = selectedVersionId
      if (!targetVersionId) {
        toast({ title: 'Crée une version avant prévisualisation', variant: 'warning' })
        return
      }
      const result = await previewTemplate.mutateAsync({
        templateId,
        versionId: targetVersionId,
        variables: sampleVariables,
        output: 'html',
      })
      setPreviewHtml(result.rendered_html ?? null)
    } catch {
      toast({ title: 'Prévisualisation HTML impossible', variant: 'error' })
    }
  }

  const handlePreviewPdf = async () => {
    if (!templateId || !selectedVersionId) return
    try {
      const result = await previewTemplate.mutateAsync({
        templateId,
        versionId: selectedVersionId,
        variables: sampleVariables,
        output: 'pdf',
      })
      if (result.pdf) openBlob(result.pdf)
    } catch {
      toast({ title: 'Prévisualisation PDF impossible', variant: 'error' })
    }
  }

  const handlePublish = async (version: PdfTemplateVersion) => {
    if (!templateId) return
    try {
      await publishVersion.mutateAsync({ templateId, versionId: version.id })
      toast({ title: 'Version publiée', variant: 'success' })
    } catch {
      toast({ title: 'Impossible de publier', variant: 'error' })
    }
  }

  const handleDeleteVersion = async (version: PdfTemplateVersion) => {
    if (!templateId) return
    try {
      await deleteVersion.mutateAsync({ templateId, versionId: version.id })
      if (selectedVersionId === version.id) setSelectedVersionId(null)
      toast({ title: 'Version supprimée', variant: 'success' })
    } catch {
      toast({ title: 'Impossible de supprimer la version', variant: 'error' })
    }
  }

  const handleDeleteTemplate = async () => {
    if (!templateId) return
    try {
      await deleteTemplate.mutateAsync(templateId)
      toast({ title: 'Modèle PDF supprimé', variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Impossible de supprimer le modèle', variant: 'error' })
    }
  }

  if (mode === 'edit' && isLoading) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<FileOutput size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={mode === 'create' ? 'Nouveau modèle PDF' : (template?.name ?? 'Modèle PDF')}
      subtitle={mode === 'create' ? 'Création' : (template?.slug ?? '')}
      icon={<FileOutput size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={handleSaveMeta} disabled={createTemplate.isPending || updateTemplate.isPending} icon={<Save size={12} />}>
            Enregistrer
          </PanelActionButton>
          {mode === 'edit' && templateId && (
            <PanelActionButton onClick={handleDeleteTemplate} disabled={deleteTemplate.isPending} icon={<Trash2 size={12} />}>
              Supprimer
            </PanelActionButton>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <FormSection title="Métadonnées">
          <FormGrid>
            <DynamicPanelField label="Slug">
              <input
                type="text"
                value={metaForm.slug}
                disabled={mode === 'edit'}
                onChange={(e) => setMetaForm((current) => ({ ...current, slug: e.target.value }))}
                className={panelInputClass}
              />
            </DynamicPanelField>
            <DynamicPanelField label="Nom">
              <input type="text" value={metaForm.name} onChange={(e) => setMetaForm((current) => ({ ...current, name: e.target.value }))} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Type d'objet">
              <input type="text" value={metaForm.object_type} onChange={(e) => setMetaForm((current) => ({ ...current, object_type: e.target.value }))} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Page">
              <select value={metaForm.page_size} onChange={(e) => setMetaForm((current) => ({ ...current, page_size: e.target.value }))} className={panelInputClass}>
                {PAGE_SIZE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label="Orientation">
              <select value={metaForm.orientation} onChange={(e) => setMetaForm((current) => ({ ...current, orientation: e.target.value }))} className={panelInputClass}>
                {ORIENTATION_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label="Actif">
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" checked={metaForm.enabled} onChange={(e) => setMetaForm((current) => ({ ...current, enabled: e.target.checked }))} />
                Modèle activé
              </label>
            </DynamicPanelField>
            <DynamicPanelField label="Description" span="full">
              <textarea value={metaForm.description} onChange={(e) => setMetaForm((current) => ({ ...current, description: e.target.value }))} className={`${panelInputClass} min-h-[72px]`} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {mode === 'edit' && template && (
          <>
            <FormSection title={`Versions (${versions.length})`}>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      onClick={() => setSelectedVersionId(version.id)}
                      className={`rounded-md border px-3 py-2 text-left text-xs ${selectedVersionId === version.id ? 'border-primary bg-primary/5 text-foreground' : 'border-border/60 bg-card text-muted-foreground'}`}
                    >
                      {version.language.toUpperCase()} v{version.version_number}{version.is_published ? ' · publié' : ''}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setSelectedVersionId(null)
                      setVersionForm({ language: 'fr', body_html: '', header_html: '', footer_html: '', is_published: false })
                    }}
                    className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground"
                  >
                    Nouvelle version
                  </button>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Variables disponibles: {Object.keys(template.variables_schema ?? {}).join(', ') || 'aucune variable déclarée'}
                </div>
              </div>
            </FormSection>

            <FormSection title={selectedVersion ? `Édition ${selectedVersion.language.toUpperCase()} v${selectedVersion.version_number}` : 'Nouvelle version'}>
              <div className="space-y-3">
                <FormGrid>
                  <DynamicPanelField label="Langue">
                    <select value={versionForm.language} onChange={(e) => setVersionForm((current) => ({ ...current, language: e.target.value }))} className={panelInputClass}>
                      {LANG_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label="Publier immédiatement">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={versionForm.is_published} onChange={(e) => setVersionForm((current) => ({ ...current, is_published: e.target.checked }))} />
                      Activer cette version
                    </label>
                  </DynamicPanelField>
                </FormGrid>

                <DynamicPanelField label="Body HTML">
                  <textarea value={versionForm.body_html} onChange={(e) => setVersionForm((current) => ({ ...current, body_html: e.target.value }))} className={`${panelInputClass} min-h-[320px] font-mono text-[12px]`} />
                </DynamicPanelField>
                <DynamicPanelField label="Header HTML">
                  <textarea value={versionForm.header_html} onChange={(e) => setVersionForm((current) => ({ ...current, header_html: e.target.value }))} className={`${panelInputClass} min-h-[100px] font-mono text-[12px]`} />
                </DynamicPanelField>
                <DynamicPanelField label="Footer HTML">
                  <textarea value={versionForm.footer_html} onChange={(e) => setVersionForm((current) => ({ ...current, footer_html: e.target.value }))} className={`${panelInputClass} min-h-[100px] font-mono text-[12px]`} />
                </DynamicPanelField>

                <div className="flex flex-wrap gap-2">
                  <PanelActionButton onClick={handleCreateVersion} disabled={createVersion.isPending || !versionForm.body_html.trim()} icon={<Plus size={12} />}>
                    Créer version
                  </PanelActionButton>
                  {selectedVersion && (
                    <>
                      <PanelActionButton onClick={() => handlePublish(selectedVersion)} disabled={publishVersion.isPending} icon={<Upload size={12} />}>
                        Publier
                      </PanelActionButton>
                      <PanelActionButton onClick={handleDuplicateVersion} icon={<Plus size={12} />}>
                        Dupliquer
                      </PanelActionButton>
                      <PanelActionButton onClick={() => handleDeleteVersion(selectedVersion)} disabled={deleteVersion.isPending} icon={<Trash2 size={12} />}>
                        Supprimer version
                      </PanelActionButton>
                    </>
                  )}
                  <PanelActionButton onClick={handlePreviewHtml} disabled={previewTemplate.isPending || !selectedVersionId} icon={<Eye size={12} />}>
                    Aperçu HTML
                  </PanelActionButton>
                  <PanelActionButton onClick={handlePreviewPdf} disabled={previewTemplate.isPending || !selectedVersionId} icon={<FileOutput size={12} />}>
                    Aperçu PDF
                  </PanelActionButton>
                </div>
              </div>
            </FormSection>

            <FormSection title="Prévisualisation">
              {previewHtml ? (
                <div className="rounded-lg border border-border/60 bg-white overflow-hidden">
                  <iframe title="PDF template HTML preview" srcDoc={previewHtml} className="h-[420px] w-full bg-white" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-xs text-muted-foreground">
                  Lance un aperçu HTML ou PDF pour vérifier le modèle avec les variables d’exemple.
                </div>
              )}
            </FormSection>
          </>
        )}
      </div>
    </DynamicPanelShell>
  )
}
