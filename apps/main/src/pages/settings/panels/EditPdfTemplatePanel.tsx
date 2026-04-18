import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  Columns2,
  Code2,
  Copy,
  Eye,
  FileOutput,
  Languages,
  Loader2,
  Pencil,
  Play,
  Plus,
  Save,
  Trash2,
  X,
  Variable,
} from 'lucide-react'
import MonacoEditor from '@monaco-editor/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
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
import { useDebounce } from '@/hooks/useDebounce'

const LANG_OPTIONS = ['fr', 'en'] as const
const OBJECT_TYPES = ['system', 'document', 'ads', 'project', 'travelwiz', 'voyage'] as const
const PAGE_SIZE_OPTIONS = ['A4', 'A5', 'A6', 'Letter'] as const
const ORIENTATION_OPTIONS = ['portrait', 'landscape'] as const

type PdfVariableKind = 'text' | 'image' | 'link' | 'qr' | 'group'

type PdfVariableDescriptor = {
  key: string
  kind: PdfVariableKind
  label: string
  description?: string
  example?: string
}

type PdfVariableSchemaRow = {
  id: string
  key: string
  type: PdfVariableKind
  label: string
  description: string
  example: string
}

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
    reference_url: 'https://opsflux.local/documents/OPS-2026-001',
    support_url: 'https://opsflux.local/support',
    support_email: 'support@example.com',
    logo_image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="64"><rect width="220" height="64" rx="10" fill="%230f172a"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" fill="%23ffffff">OPSFLUX</text></svg>',
    signature_image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="48"><path d="M8 34 C38 6, 62 52, 92 24 S142 38, 172 14" stroke="%23111827" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
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
        { tracking_code: 'CGO-001', request_code: 'LTR-001', designation: 'Pompe', destination_name: 'Site Bravo', receiver_name: 'Log Base', weight_kg: 220, package_count: 2, status_label: 'Enregistré' },
        { tracking_code: 'CGO-002', request_code: 'LTR-001', designation: 'Caisse outillage', destination_name: 'Site Bravo', receiver_name: 'Log Base', weight_kg: 205.5, package_count: 5, status_label: 'Chargé' },
      ],
    }
  }
  if (slug === 'cargo.lt') {
    return {
      ...base,
      request_code: 'LTR-2026-0012',
      request_title: 'Demande expédition matériel forage',
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
        { tracking_code: 'CGO-001', designation: 'Pompe', cargo_type: 'unit', weight_kg: 220, package_count: 2, status_label: 'Enregistré' },
        { tracking_code: 'CGO-002', designation: 'Caisse outillage', cargo_type: 'consumable', weight_kg: 205.5, package_count: 5, status_label: 'Chargé' },
      ],
    }
  }
  if (slug === 'project.report') {
    return {
      ...base,
      project: {
        code: 'PRJ-2026-0042',
        name: 'Extension ligne process',
        status: 'in_progress',
        priority: 'high',
        progress: 68,
        project_type: 'brownfield',
        weather: 'clear',
        start_date: '01/04/2026',
        end_date: '28/04/2026',
        budget: '125 000 000 XAF',
        description: 'Projet d’extension et de remise en conformité de la ligne process.',
        manager_name: 'Bastien Mukendi',
      },
      tasks: [
        { title: 'Preparation du chantier', status: 'done', priority: 'high', progress: 100, start: '01/04/2026', end: '03/04/2026' },
        { title: 'Installation des supports', status: 'in_progress', priority: 'high', progress: 70, start: '04/04/2026', end: '10/04/2026' },
      ],
      milestones: [
        { name: 'Demarrage chantier', due_date: '02/04/2026', status: 'done' },
        { name: 'Mise en service', due_date: '28/04/2026', status: 'planned' },
      ],
      wbs_nodes: [
        { code: '1.0', name: 'Preparation', budget: '25 000 000' },
        { code: '2.0', name: 'Execution', budget: '100 000 000' },
      ],
      task_count: 2,
      milestone_count: 2,
    }
  }
  if (slug === 'document.export') {
    return {
      ...base,
      document_number: 'DOC-2026-0007',
      document_title: "Rapport hebdomadaire d’activité",
      document_body: "<h2>Synthèse</h2><p>Activité soutenue cette semaine avec progression conforme au plan.</p><h3>Points clés</h3><ul><li>2 actions critiques clôturées</li><li>1 réserve en cours de traitement</li></ul>",
      author_name: 'A. User',
      revision: '03',
      status: 'approved',
    }
  }
  if (slug === 'avm.ticket') {
    return {
      ...base,
      reference: 'AVM-2026-004',
      title: 'Inspection offshore multipoints',
      description: 'Mission de cadrage et d inspection sur plusieurs sites avec coordination PAX et documents de preparation.',
      status: 'in_preparation',
      mission_type: 'standard',
      planned_start_date: '08/04/2026',
      planned_end_date: '14/04/2026',
      creator_name: 'A. User',
      pax_quota: 12,
      requires_badge: true,
      requires_epi: true,
      requires_visa: false,
      eligible_displacement_allowance: true,
      preparation_progress: 58,
      open_preparation_tasks: 4,
      generated_ads_references: ['ADS-2026-117', 'ADS-2026-118'],
      programs: [
        { activity_description: 'Inspection plateforme Nord', site_name: 'KLF3', planned_start_date: '08/04/2026', planned_end_date: '10/04/2026', pax_count: 6, generated_ads_reference: 'ADS-2026-117' },
        { activity_description: 'Revue de remise en service', site_name: 'BIPAGA', planned_start_date: '11/04/2026', planned_end_date: '14/04/2026', pax_count: 6, generated_ads_reference: 'ADS-2026-118' },
      ],
    }
  }
  if (slug === 'pid.export') {
    return {
      ...base,
      document_code: 'PID-OPS-014',
      document_title: 'Piping and Instrumentation Diagram',
      revision: 'B',
      status: 'approved',
      equipment_count: 12,
      line_count: 18,
      notes: "Aperçu de démonstration avec données d’exemple pour validation du template.",
    }
  }
  if (slug === 'ads.ticket' || slug === 'ads.manifest') {
    return {
      ...base,
      reference: 'ADS-2026-001',
      departure_date: '07/04/2026 06:30',
      return_date: '09/04/2026 17:00',
      departure_base: 'Base A',
      destination_site: 'Site Bravo',
      transport_mode: 'helicopter',
      visit_purpose: 'Inspection terrain',
      visit_category: 'routine',
      approval_status: 'approved',
      approver_name: 'Marie Kanku',
      approved_at: '06/04/2026 18:10',
      total_passengers: 3,
      passengers: [
        { name: 'Jean Dupont', company: 'Perenco', badge_number: 'BDG-001', compliance_status: 'boarded', seat_number: 'A1' },
        { name: 'Paul Ilunga', company: 'SPIE', badge_number: 'BDG-002', compliance_status: 'approved', seat_number: 'A2' },
        { name: 'Sarah Mbuyi', company: 'Perenco', badge_number: 'BDG-003', compliance_status: 'approved', seat_number: 'A3' },
      ],
      qr_data: 'https://app.opsflux.io/paxlog/ads-boarding/demo-ads-token',
      qr_url: 'https://app.opsflux.io/paxlog/ads-boarding/demo-ads-token',
    }
  }
  const schemaKeys = Object.keys(variablesSchema ?? {})
  for (const key of schemaKeys) {
    if (key.includes('.')) continue
    if (!(key in base)) base[key] = `Exemple ${key}`
  }
  return base
}

function inferVariableKind(key: string, value: unknown): PdfVariableKind {
  const normalized = key.toLowerCase()
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return 'group'
  if (normalized.includes('qr')) return 'qr'
  if (normalized.includes('image') || normalized.includes('logo') || normalized.includes('signature')) return 'image'
  if (normalized.includes('url') || normalized.includes('link') || normalized.includes('href')) return 'link'
  return 'text'
}

function humanizeVariableKey(key: string) {
  return key
    .replace(/\./g, ' / ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function buildVariableDescriptors(
  schema: Record<string, unknown> | null | undefined,
  sampleVariables: Record<string, unknown>,
): PdfVariableDescriptor[] {
  if (!schema) return []
  return Object.entries(schema).map(([key, rawValue]) => {
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      const meta = rawValue as Record<string, unknown>
      const declaredType = typeof meta.type === 'string' ? meta.type.toLowerCase() : null
      const kind = (declaredType === 'image' || declaredType === 'link' || declaredType === 'qr' || declaredType === 'group')
        ? declaredType
        : inferVariableKind(key, sampleVariables[key])
      return {
        key,
        kind,
        label: typeof meta.label === 'string' ? meta.label : humanizeVariableKey(key),
        description: typeof meta.description === 'string' ? meta.description : undefined,
        example: typeof meta.example === 'string' ? meta.example : undefined,
      }
    }
    return {
      key,
      kind: inferVariableKind(key, sampleVariables[key]),
      label: humanizeVariableKey(key),
      description: typeof rawValue === 'string' ? rawValue : undefined,
    }
  })
}

function buildVariableSchemaRows(schema: Record<string, unknown> | null | undefined): PdfVariableSchemaRow[] {
  if (!schema) return []
  return Object.entries(schema).map(([key, rawValue], index) => {
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      const meta = rawValue as Record<string, unknown>
      const declaredType = typeof meta.type === 'string' ? meta.type.toLowerCase() : 'text'
      return {
        id: `${key}-${index}`,
        key,
        type: (declaredType === 'image' || declaredType === 'link' || declaredType === 'qr' || declaredType === 'group' ? declaredType : 'text') as PdfVariableKind,
        label: typeof meta.label === 'string' ? meta.label : '',
        description: typeof meta.description === 'string' ? meta.description : '',
        example: typeof meta.example === 'string' ? meta.example : '',
      }
    }
    return {
      id: `${key}-${index}`,
      key,
      type: inferVariableKind(key, rawValue),
      label: '',
      description: typeof rawValue === 'string' ? rawValue : '',
      example: '',
    }
  })
}

function buildVariablesSchemaPayload(rows: PdfVariableSchemaRow[]): Record<string, unknown> {
  return rows.reduce<Record<string, unknown>>((acc, row) => {
    const key = row.key.trim()
    if (!key) return acc
    acc[key] = {
      type: row.type,
      ...(row.label.trim() ? { label: row.label.trim() } : {}),
      ...(row.description.trim() ? { description: row.description.trim() } : {}),
      ...(row.example.trim() ? { example: row.example.trim() } : {}),
    }
    return acc
  }, {})
}

function VariableKindBadge({ kind, t }: { kind: PdfVariableKind; t: (key: string) => string }) {
  const tone = {
    text: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
    image: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
    link: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    qr: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    group: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  } satisfies Record<PdfVariableKind, string>

  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', tone[kind])}>
      {t(`settings.pdf_templates_editor.variable_kinds.${kind}`)}
    </span>
  )
}

interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  variables?: Record<string, unknown> | null
  placeholder?: string
  minHeight?: number
}

function RichEditor({ value, onChange, variables, minHeight = 280 }: RichEditorProps) {
  const editorRef = useRef<any>(null)

  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor
  }, [])

  const insertVariable = useCallback((varKey: string) => {
    const editor = editorRef.current
    if (!editor) return
    const position = editor.getPosition()
    if (!position) return
    const text = `{{ ${varKey} }}`
    editor.executeEdits('insert-variable', [{
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
      text,
    }])
    editor.focus()
  }, [])

  const variableEntries = Object.entries(variables ?? {})

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      {/* Variable insertion toolbar */}
      {variableEntries.length > 0 && (
        <div className="flex items-center gap-1 px-2.5 py-2 border-b border-border/50 bg-muted/30 flex-wrap">
          <Variable size={11} className="text-muted-foreground mr-0.5 shrink-0" />
          <span className="text-[10px] text-muted-foreground mr-1">Variables :</span>
          {variableEntries.map(([key, desc]) => (
            <button
              key={key}
              type="button"
              onClick={() => insertVariable(key)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
              title={typeof desc === 'string' ? desc : key}
            >
              <span className="opacity-50">{'{{ '}</span>{key}<span className="opacity-50">{' }}'}</span>
            </button>
          ))}
        </div>
      )}

      {/* Monaco Editor */}
      <MonacoEditor
        height={minHeight}
        language="html"
        theme="vs-dark"
        value={value || ''}
        onChange={(val) => onChange(val || '')}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          wordWrap: 'on',
          lineNumbers: 'on',
          fontSize: 12,
          tabSize: 2,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 8 },
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          folding: true,
          bracketPairColorization: { enabled: true },
          renderWhitespace: 'selection',
        }}
      />
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  )
}

function MetadataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right text-foreground">{value}</div>
    </div>
  )
}

function PreviewLayoutGuide({
  headerEnabled,
  footerEnabled,
  marginsLabel,
  t,
}: {
  headerEnabled: boolean
  footerEnabled: boolean
  marginsLabel: string
  t: (key: string) => string
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('settings.pdf_templates_editor.preview_layout.title')}
      </div>
      <div className="mt-3 rounded-xl border border-border/60 bg-background p-3">
        <div className="mx-auto w-full max-w-[220px] rounded-[20px] border border-border bg-white shadow-sm overflow-hidden">
          <div className={cn(
            'px-3 py-2 text-[10px] border-b border-border/60',
            headerEnabled ? 'bg-sky-50 text-sky-700' : 'bg-muted/40 text-muted-foreground',
          )}>
            {headerEnabled
              ? t('settings.pdf_templates_editor.preview_layout.header_enabled')
              : t('settings.pdf_templates_editor.preview_layout.header_disabled')}
          </div>
          <div className="px-3 py-4 bg-[linear-gradient(to_bottom,rgba(15,23,42,0.03),rgba(15,23,42,0.01))]">
            <div className="rounded-md border border-dashed border-border/70 px-2 py-6 text-center text-[10px] text-muted-foreground">
              {t('settings.pdf_templates_editor.preview_layout.body_area')}
            </div>
          </div>
          <div className={cn(
            'px-3 py-2 text-[10px] border-t border-border/60',
            footerEnabled ? 'bg-amber-50 text-amber-700' : 'bg-muted/40 text-muted-foreground',
          )}>
            {footerEnabled
              ? t('settings.pdf_templates_editor.preview_layout.footer_enabled')
              : t('settings.pdf_templates_editor.preview_layout.footer_disabled')}
          </div>
        </div>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {t('settings.pdf_templates_editor.preview_layout.margins')}: {marginsLabel}
      </div>
    </div>
  )
}

type PreviewMode = 'code' | 'render' | 'split'

function EditorSectionCard({
  label,
  description,
  active,
  enabled,
  statusLabel,
  onClick,
}: {
  label: string
  description: string
  active: boolean
  enabled: boolean
  statusLabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-3 py-3 text-left transition-colors',
        active
          ? 'border-primary bg-primary/5 text-foreground shadow-sm'
          : 'border-border/60 bg-card text-muted-foreground hover:border-border hover:bg-accent/30',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold">{label}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</div>
        </div>
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
          enabled
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground',
        )}>
          {statusLabel}
        </span>
      </div>
    </button>
  )
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
  const confirm = useConfirm()
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
  const versionsByLanguage = useMemo(() => {
    const groups: Record<string, PdfTemplateVersion[]> = {}
    for (const version of versions) {
      if (!groups[version.language]) groups[version.language] = []
      groups[version.language].push(version)
    }
    return groups
  }, [versions])

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
  const [previewMode, setPreviewMode] = useState<PreviewMode>('split')
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<PdfTemplateValidationResult | null>(null)
  const [showMetadataEdit, setShowMetadataEdit] = useState(false)
  const [variableSchemaRows, setVariableSchemaRows] = useState<PdfVariableSchemaRow[]>([])
  const debouncedPreviewDraft = useDebounce({
    body_html: versionForm.body_html,
    header_html: versionForm.header_html,
    footer_html: versionForm.footer_html,
    marginsLabel: `${metaForm.margin_top}/${metaForm.margin_right}/${metaForm.margin_bottom}/${metaForm.margin_left}`,
  }, 500)

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
    setVariableSchemaRows(buildVariableSchemaRows(template.variables_schema))
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
    setPreviewState('idle')
    setPreviewError(null)
    setValidationResult(null)
  }, [selectedVersionId, versions])

  // Auto-select first version if none selected yet
  const effectiveVersionId = selectedVersionId ?? (versions.find(v => v.is_published)?.id ?? versions[0]?.id ?? null)
  if (!selectedVersionId && effectiveVersionId) setSelectedVersionId(effectiveVersionId)
  const selectedVersion = versions.find((item) => item.id === effectiveVersionId) ?? null
  const sampleVariables = useMemo(
    () => buildSampleVariables(template?.slug, template?.variables_schema),
    [template?.slug, template?.variables_schema],
  )
  const variableDescriptors = useMemo(
    () => buildVariableDescriptors(template?.variables_schema, sampleVariables),
    [template?.variables_schema, sampleVariables],
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
  const pageFormatLabel = `${metaForm.page_size} · ${t(`settings.pdf_templates_editor.orientation.${metaForm.orientation}`)}`
  const marginsLabel = `${metaForm.margin_top}/${metaForm.margin_right}/${metaForm.margin_bottom}/${metaForm.margin_left} mm`
  const selectedVersionLabel = selectedVersion
    ? `${selectedVersion.language.toUpperCase()} v${selectedVersion.version_number}`
    : t('settings.pdf_templates_editor.no_version_selected')
  const hasHeader = versionForm.header_html.trim().length > 0
  const hasFooter = versionForm.footer_html.trim().length > 0
  const previewEnabled = previewMode !== 'code'

  useEffect(() => {
    if (!templateId || !previewEnabled) return
    if (!debouncedPreviewDraft.body_html.trim()) {
      setPreviewHtml(null)
      setPreviewState('idle')
      setPreviewError(null)
      return
    }

    let cancelled = false
    setPreviewState('loading')
    setPreviewError(null)

    previewTemplate.mutateAsync({
      templateId,
      body_html: debouncedPreviewDraft.body_html,
      header_html: debouncedPreviewDraft.header_html || undefined,
      footer_html: debouncedPreviewDraft.footer_html || undefined,
      variables: sampleVariables,
      output: 'html',
    })
      .then((result) => {
        if (cancelled) return
        setPreviewHtml(result.rendered_html ?? null)
        setPreviewState(result.rendered_html ? 'ready' : 'idle')
      })
      .catch(() => {
        if (cancelled) return
        setPreviewHtml(null)
        setPreviewState('error')
        setPreviewError(t('settings.pdf_templates_editor.preview_error'))
      })

    return () => {
      cancelled = true
    }
  }, [
    debouncedPreviewDraft,
    previewEnabled,
    previewTemplate,
    sampleVariables,
    t,
    templateId,
  ])

  const handleSaveMeta = async () => {
    try {
      await updateTemplate.mutateAsync({
        id: templateId,
        name: metaForm.name,
        description: metaForm.description || undefined,
        object_type: metaForm.object_type,
        enabled: metaForm.enabled,
        variables_schema: buildVariablesSchemaPayload(variableSchemaRows),
        page_size: metaForm.page_size,
        orientation: metaForm.orientation,
        margin_top: metaForm.margin_top,
        margin_right: metaForm.margin_right,
        margin_bottom: metaForm.margin_bottom,
        margin_left: metaForm.margin_left,
      })
      toast({ title: t('settings.pdf_templates_editor.toasts.metadata_updated'), variant: 'success' })
      setShowMetadataEdit(false)
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
    if (!versionForm.body_html.trim()) return
    try {
      const result = await previewTemplate.mutateAsync({
        templateId,
        versionId: selectedVersionId ?? undefined,
        body_html: versionForm.body_html,
        header_html: versionForm.header_html || undefined,
        footer_html: versionForm.footer_html || undefined,
        variables: sampleVariables,
        output: 'pdf',
      })
      if (result.pdf) openBlob(result.pdf)
      else toast({ title: t('settings.pdf_templates_editor.preview_empty'), variant: 'error' })
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
    const ok = await confirm({
      title: t('settings.pdf_templates_editor.confirm.delete_version_title'),
      message: t('settings.pdf_templates_editor.confirm.delete_version_message'),
      confirmLabel: t('common.delete'),
      variant: 'danger',
    })
    if (!ok) return
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
    const ok = await confirm({
      title: t('settings.pdf_templates_editor.confirm.delete_template_title'),
      message: t('settings.pdf_templates_editor.confirm.delete_template_message'),
      confirmLabel: t('common.delete'),
      variant: 'danger',
    })
    if (!ok) return
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
          <PanelActionButton onClick={() => setShowMetadataEdit((current) => !current)} icon={showMetadataEdit ? <X size={12} /> : <Pencil size={12} />}>
            {showMetadataEdit ? t('settings.pdf_templates_editor.actions.close_metadata') : t('settings.pdf_templates_editor.actions.edit_metadata')}
          </PanelActionButton>
          <PanelActionButton onClick={handleDeleteTemplate} disabled={deleteTemplate.isPending} icon={<Trash2 size={12} />}>
            {t('settings.pdf_templates_editor.actions.delete_template')}
          </PanelActionButton>
        </>
      }
    >
      <div className="p-4 space-y-4">
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMetadataEdit((current) => !current)}
            className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {showMetadataEdit
                ? t('settings.pdf_templates_editor.sections.template_metadata')
                : t('settings.pdf_templates_editor.sections.template_overview')}
            </span>
            {showMetadataEdit ? <X size={11} className="text-muted-foreground" /> : <Pencil size={11} className="text-muted-foreground" />}
          </button>

          {!showMetadataEdit ? (
            <div className="px-3 py-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <SummaryCard label={t('settings.pdf_templates_editor.fields.slug')} value={template.slug} />
                <SummaryCard label={t('settings.pdf_templates_editor.fields.object_type')} value={objectTypeOptions.find((option) => option.value === metaForm.object_type)?.label ?? metaForm.object_type} />
                <SummaryCard label={t('settings.pdf_templates_editor.fields.page_size')} value={pageFormatLabel} />
                <SummaryCard label={t('settings.pdf_templates_editor.fields.margins')} value={marginsLabel} />
              </div>
              <div className="space-y-1.5 text-sm">
                <MetadataRow
                  label={t('common.status')}
                  value={
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                      metaForm.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                    )}>
                      {metaForm.enabled ? <Check size={11} /> : <X size={11} />}
                      {metaForm.enabled ? t('common.active') : t('common.inactive')}
                    </span>
                  }
                />
                <MetadataRow label={t('settings.pdf_templates_editor.sections.version')} value={selectedVersionLabel} />
                {metaForm.description && <MetadataRow label={t('common.description')} value={metaForm.description} />}
              </div>
            </div>
          ) : (
            <div className="px-3 py-3 space-y-4">
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
                <DynamicPanelField label={t('settings.pdf_templates_editor.fields.margin_top')}>
                  <input type="number" value={metaForm.margin_top} onChange={(e) => setMetaForm((current) => ({ ...current, margin_top: Number(e.target.value) || 0 }))} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label={t('settings.pdf_templates_editor.fields.margin_right')}>
                  <input type="number" value={metaForm.margin_right} onChange={(e) => setMetaForm((current) => ({ ...current, margin_right: Number(e.target.value) || 0 }))} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label={t('settings.pdf_templates_editor.fields.margin_bottom')}>
                  <input type="number" value={metaForm.margin_bottom} onChange={(e) => setMetaForm((current) => ({ ...current, margin_bottom: Number(e.target.value) || 0 }))} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label={t('settings.pdf_templates_editor.fields.margin_left')}>
                  <input type="number" value={metaForm.margin_left} onChange={(e) => setMetaForm((current) => ({ ...current, margin_left: Number(e.target.value) || 0 }))} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.description')} span="full">
                  <textarea value={metaForm.description} onChange={(e) => setMetaForm((current) => ({ ...current, description: e.target.value }))} className={`${panelInputClass} min-h-[72px]`} />
                </DynamicPanelField>
              </FormGrid>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-foreground">
                    {t('settings.pdf_templates_editor.schema_editor.title')}
                  </div>
                  <button
                    type="button"
                    onClick={() => setVariableSchemaRows((current) => [
                      ...current,
                      {
                        id: `row-${Date.now()}-${current.length}`,
                        key: '',
                        type: 'text',
                        label: '',
                        description: '',
                        example: '',
                      },
                    ])}
                    className="rounded-md border border-dashed border-border/70 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Plus size={12} />
                      {t('settings.pdf_templates_editor.schema_editor.add')}
                    </span>
                  </button>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
                  {variableSchemaRows.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      {t('settings.pdf_templates_editor.schema_editor.empty')}
                    </div>
                  ) : (
                    variableSchemaRows.map((row) => (
                      <div key={row.id} className="rounded-lg border border-border/60 bg-card p-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                          <DynamicPanelField label={t('settings.pdf_templates_editor.schema_editor.key')}>
                            <input
                              type="text"
                              value={row.key}
                              onChange={(e) => setVariableSchemaRows((current) => current.map((item) => item.id === row.id ? { ...item, key: e.target.value } : item))}
                              className={`${panelInputClass} font-mono`}
                            />
                          </DynamicPanelField>
                          <DynamicPanelField label={t('settings.pdf_templates_editor.schema_editor.type')}>
                            <select
                              value={row.type}
                              onChange={(e) => setVariableSchemaRows((current) => current.map((item) => item.id === row.id ? { ...item, type: e.target.value as PdfVariableKind } : item))}
                              className="gl-form-select"
                            >
                              {(['text', 'image', 'link', 'qr', 'group'] as PdfVariableKind[]).map((kind) => (
                                <option key={kind} value={kind}>{t(`settings.pdf_templates_editor.variable_kinds.${kind}`)}</option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('settings.pdf_templates_editor.schema_editor.label')}>
                            <input
                              type="text"
                              value={row.label}
                              onChange={(e) => setVariableSchemaRows((current) => current.map((item) => item.id === row.id ? { ...item, label: e.target.value } : item))}
                              className={panelInputClass}
                            />
                          </DynamicPanelField>
                          <DynamicPanelField label={t('settings.pdf_templates_editor.schema_editor.example')}>
                            <input
                              type="text"
                              value={row.example}
                              onChange={(e) => setVariableSchemaRows((current) => current.map((item) => item.id === row.id ? { ...item, example: e.target.value } : item))}
                              className={panelInputClass}
                            />
                          </DynamicPanelField>
                          <DynamicPanelField label={t('common.delete')}>
                            <button
                              type="button"
                              onClick={() => setVariableSchemaRows((current) => current.filter((item) => item.id !== row.id))}
                              className="w-full rounded-md border border-border/70 px-3 py-2 text-xs text-destructive hover:bg-destructive/5"
                            >
                              {t('settings.pdf_templates_editor.schema_editor.remove')}
                            </button>
                          </DynamicPanelField>
                        </div>
                        <DynamicPanelField label={t('common.description')}>
                          <textarea
                            value={row.description}
                            onChange={(e) => setVariableSchemaRows((current) => current.map((item) => item.id === row.id ? { ...item, description: e.target.value } : item))}
                            className={`${panelInputClass} min-h-[60px]`}
                          />
                        </DynamicPanelField>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <PanelActionButton onClick={handleSaveMeta} disabled={updateTemplate.isPending} icon={<Save size={12} />}>
                  {t('settings.pdf_templates_editor.actions.save_metadata')}
                </PanelActionButton>
                <PanelActionButton onClick={() => setShowMetadataEdit(false)}>
                  {t('common.cancel')}
                </PanelActionButton>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {t('settings.pdf_templates_editor.editors.margins_help')}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/30">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('settings.pdf_templates_editor.sections.versions', { count: versions.length })}
            </span>
            <div className="flex flex-wrap items-center gap-2">
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
              {!!selectedVersion && (
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
                    <Copy size={12} />
                    {t('common.clone')}
                  </span>
                </button>
              )}
            </div>
          </div>
          <div className="px-3 py-3 space-y-3">
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {t('settings.pdf_templates_editor.available_variables', {
                variables: Object.keys(template.variables_schema ?? {}).join(', ') || t('settings.pdf_templates_editor.no_declared_variables'),
              })}
            </div>
            {variableDescriptors.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                <div className="px-3 py-2 border-b border-border/40 bg-muted/30">
                  <span className="text-xs font-semibold text-foreground">
                    {t('settings.pdf_templates_editor.variable_catalog.title')}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-2">({variableDescriptors.length})</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/10">
                      <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-[35%]">Variable</th>
                      <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-[15%]">Type</th>
                      <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variableDescriptors.map((descriptor) => (
                      <tr key={descriptor.key} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                        <td className="px-3 py-1.5">
                          <code className="font-mono text-[11px] text-primary bg-primary/5 px-1.5 py-0.5 rounded">{`{{ ${descriptor.key} }}`}</code>
                        </td>
                        <td className="px-2 py-1.5">
                          <VariableKindBadge kind={descriptor.kind} t={t} />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="text-xs text-foreground">{descriptor.label}</div>
                          {descriptor.description && descriptor.description !== descriptor.label && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{descriptor.description}</div>
                          )}
                          {descriptor.example && (
                            <div className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">ex: {descriptor.example}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-xs text-muted-foreground space-y-2">
              <div className="font-semibold text-foreground">{t('settings.pdf_templates_editor.helper_snippets.title')}</div>
              <code className="block whitespace-pre-wrap rounded bg-background px-2 py-1 font-mono text-[11px] text-foreground">
                {`<img src="{{ qr_code(reference) }}" alt="QR" />`}
              </code>
              <code className="block whitespace-pre-wrap rounded bg-background px-2 py-1 font-mono text-[11px] text-foreground">
                {`{{ image_tag(logo_image, 'Logo', 180) | safe }}`}
              </code>
              <code className="block whitespace-pre-wrap rounded bg-background px-2 py-1 font-mono text-[11px] text-foreground">
                {`{{ link_tag(reference_url, project.code) | safe }}`}
              </code>
            </div>
            <div className="space-y-3">
              {Object.entries(versionsByLanguage).map(([language, languageVersions]) => (
                <div key={language} className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {languageOptions.find((option) => option.value === language)?.label ?? language.toUpperCase()}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {languageVersions.map((version) => (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => {
                          setSelectedVersionId(version.id)
                          setIsCreatingVersion(false)
                          setPreviewHtml(null)
                          setValidationResult(null)
                        }}
                        className={cn(
                          'rounded-lg border px-3 py-3 text-left text-xs transition-colors',
                          selectedVersionId === version.id && !isCreatingVersion
                            ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                            : 'border-border/60 bg-card text-muted-foreground hover:border-border',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Languages size={12} />
                              <span className="font-medium">{language.toUpperCase()} v{version.version_number}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {version.is_published
                                ? t('settings.pdf_templates_editor.version_badges.published')
                                : t('settings.pdf_templates_editor.version_badges.draft')}
                            </div>
                          </div>
                          {version.is_published && (
                            <span className="gl-badge gl-badge-success">
                              {t('common.publish')}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {versions.length === 0 && !isCreatingVersion && (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                {t('settings.pdf_templates_editor.no_versions_yet')}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-foreground">
                {t('settings.pdf_templates_editor.editor_structure_title')}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t('settings.pdf_templates_editor.editor_structure_help')}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode('code')}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs',
                  previewMode === 'code'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:bg-accent/40',
                )}
              >
                <span className="inline-flex items-center gap-1.5"><Code2 size={12} /> {t('settings.pdf_templates_editor.preview_modes.code')}</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('render')}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs',
                  previewMode === 'render'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:bg-accent/40',
                )}
              >
                <span className="inline-flex items-center gap-1.5"><Eye size={12} /> {t('settings.pdf_templates_editor.preview_modes.render')}</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('split')}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs',
                  previewMode === 'split'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:bg-accent/40',
                )}
              >
                <span className="inline-flex items-center gap-1.5"><Columns2 size={12} /> {t('settings.pdf_templates_editor.preview_modes.split')}</span>
              </button>
            </div>
          </div>
        </div>

        <div className={cn(
          'grid grid-cols-1 gap-5',
          previewMode === 'split' && 'xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]',
        )}>
          {previewMode !== 'render' && (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-1.5">
                <Pencil size={11} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {isCreatingVersion
                    ? t('settings.pdf_templates_editor.sections.new_multilingual_version')
                    : selectedVersion
                      ? t('settings.pdf_templates_editor.sections.edit_version', { language: selectedVersion.language.toUpperCase(), version: selectedVersion.version_number })
                      : t('settings.pdf_templates_editor.sections.version')}
                </span>
              </div>
              {!isCreatingVersion && selectedVersion?.is_published && (
                <span className="gl-badge gl-badge-success">
                  {t('common.publish')}
                </span>
              )}
            </div>
            <div className="p-3 space-y-4">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <EditorSectionCard
                  label={t('settings.pdf_templates_editor.editors.body_tab')}
                  description={t('settings.pdf_templates_editor.editors.body_help')}
                  active={activeEditor === 'body'}
                  enabled={versionForm.body_html.trim().length > 0}
                  statusLabel={versionForm.body_html.trim().length > 0 ? t('common.enabled') : t('common.disabled')}
                  onClick={() => setActiveEditor('body')}
                />
                <EditorSectionCard
                  label={t('settings.pdf_templates_editor.editors.header_tab')}
                  description={t('settings.pdf_templates_editor.editors.header_help')}
                  active={activeEditor === 'header'}
                  enabled={hasHeader}
                  statusLabel={hasHeader ? t('common.enabled') : t('common.disabled')}
                  onClick={() => setActiveEditor('header')}
                />
                <EditorSectionCard
                  label={t('settings.pdf_templates_editor.editors.footer_tab')}
                  description={t('settings.pdf_templates_editor.editors.footer_help')}
                  active={activeEditor === 'footer'}
                  enabled={hasFooter}
                  statusLabel={hasFooter ? t('common.enabled') : t('common.disabled')}
                  onClick={() => setActiveEditor('footer')}
                />
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
                    <PanelActionButton onClick={() => handlePublish(selectedVersion)} disabled={publishVersion.isPending} icon={<Play size={12} />}>
                      {t('common.publish')}
                    </PanelActionButton>
                    <PanelActionButton onClick={() => handleDeleteVersion(selectedVersion)} disabled={deleteVersion.isPending} icon={<Trash2 size={12} />}>
                      {t('settings.pdf_templates_editor.actions.delete_version')}
                    </PanelActionButton>
                  </>
                )}
                <PanelActionButton onClick={handlePreviewPdf} disabled={previewTemplate.isPending || !versionForm.body_html.trim()} icon={<FileOutput size={12} />}>
                  {t('settings.pdf_templates_editor.actions.preview_pdf')}
                </PanelActionButton>
              </div>
            </div>
          </div>
          )}

          {previewMode !== 'code' && (
          <div className="space-y-5">
            <FormSection title={t('settings.pdf_templates_editor.sections.preview')}>
              <div className="mb-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <div>{t('settings.pdf_templates_editor.preview_uses_sample_data')}</div>
                <div>{t('settings.pdf_templates_editor.preview_live')}</div>
              </div>
              <div className="mb-3">
                <PreviewLayoutGuide
                  headerEnabled={hasHeader}
                  footerEnabled={hasFooter}
                  marginsLabel={marginsLabel}
                  t={t}
                />
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
                  previewState === 'ready' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                  previewState === 'loading' && 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
                  previewState === 'error' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                  previewState === 'idle' && 'bg-muted text-muted-foreground',
                )}>
                  {previewState === 'ready' && t('settings.pdf_templates_editor.preview_status.ready')}
                  {previewState === 'loading' && t('settings.pdf_templates_editor.preview_status.loading')}
                  {previewState === 'error' && t('settings.pdf_templates_editor.preview_status.error')}
                  {previewState === 'idle' && t('settings.pdf_templates_editor.preview_status.idle')}
                </span>
                {previewError && <span className="text-xs text-red-600 dark:text-red-400">{previewError}</span>}
              </div>
              {previewHtml ? (
                <div className="rounded-lg border border-border/60 bg-white overflow-hidden">
                  <iframe title="PDF template HTML preview" srcDoc={previewHtml} className="h-[520px] w-full bg-white" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-xs text-muted-foreground">
                  {previewState === 'error'
                    ? t('settings.pdf_templates_editor.preview_unavailable')
                    : t('settings.pdf_templates_editor.preview_empty')}
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
            <FormSection title={t('settings.pdf_templates_editor.sections.runtime_notes')}>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-xs text-muted-foreground space-y-2">
                <p>{t('settings.pdf_templates_editor.runtime_notes.sandbox')}</p>
                <p>{t('settings.pdf_templates_editor.runtime_notes.preview')}</p>
                <p>{t('settings.pdf_templates_editor.runtime_notes.publish')}</p>
              </div>
            </FormSection>
          </div>
          )}
        </div>
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
