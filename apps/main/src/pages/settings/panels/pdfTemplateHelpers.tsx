/**
 * Helpers, constants and small UI components used by the PDF template
 * editor. Extracted from EditPdfTemplatePanel.tsx (which was 1687
 * lines) so the main editor file focuses on the big form state
 * machine.
 */
import { useCallback, useRef, type ReactNode } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { cn } from '@/lib/utils'
import { Variable } from 'lucide-react'

export const LANG_OPTIONS = ['fr', 'en'] as const
export const OBJECT_TYPES = ['system', 'document', 'ads', 'project', 'travelwiz', 'voyage'] as const
export const PAGE_SIZE_OPTIONS = ['A4', 'A5', 'A6', 'Letter'] as const
export const ORIENTATION_OPTIONS = ['portrait', 'landscape'] as const

export type PdfVariableKind = 'text' | 'image' | 'link' | 'qr' | 'group'

export type PdfVariableDescriptor = {
  key: string
  kind: PdfVariableKind
  label: string
  description?: string
  example?: string
}

export type PdfVariableSchemaRow = {
  id: string
  key: string
  type: PdfVariableKind
  label: string
  description: string
  example: string
}

export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function buildSampleVariables(
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
        { name: 'Alice Dupont', company: 'ACME Energy', badge_number: 'BDG-001', compliance_status: 'boarded' },
        { name: 'Marc Laurent', company: 'ACME Energy', badge_number: 'BDG-002', compliance_status: 'pending' },
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
      approver_name: 'Marc Laurent',
      approved_at: '06/04/2026 18:10',
      total_passengers: 3,
      passengers: [
        { name: 'Alice Dupont', company: 'ACME Energy', badge_number: 'BDG-001', compliance_status: 'boarded', seat_number: 'A1' },
        { name: 'Paul Ilunga', company: 'SPIE', badge_number: 'BDG-002', compliance_status: 'approved', seat_number: 'A2' },
        { name: 'Sophie Martin', company: 'ACME Energy', badge_number: 'BDG-003', compliance_status: 'approved', seat_number: 'A3' },
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

export function inferVariableKind(key: string, value: unknown): PdfVariableKind {
  const normalized = key.toLowerCase()
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return 'group'
  if (normalized.includes('qr')) return 'qr'
  if (normalized.includes('image') || normalized.includes('logo') || normalized.includes('signature')) return 'image'
  if (normalized.includes('url') || normalized.includes('link') || normalized.includes('href')) return 'link'
  return 'text'
}

export function humanizeVariableKey(key: string) {
  return key
    .replace(/\./g, ' / ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

export function buildVariableDescriptors(
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

export function buildVariableSchemaRows(schema: Record<string, unknown> | null | undefined): PdfVariableSchemaRow[] {
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

export function buildVariablesSchemaPayload(rows: PdfVariableSchemaRow[]): Record<string, unknown> {
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

export function VariableKindBadge({ kind, t }: { kind: PdfVariableKind; t: (key: string) => string }) {
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

export function RichEditor({ value, onChange, variables, minHeight = 280 }: RichEditorProps) {
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
        onChange={(val: string | undefined) => onChange(val || '')}
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

export function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  )
}

export function MetadataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right text-foreground">{value}</div>
    </div>
  )
}

export function PreviewLayoutGuide({
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

export type PreviewMode = 'code' | 'render' | 'split'

export function EditorSectionCard({
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
