/**
 * PID/PFD page — Process & Instrumentation Diagrams management.
 *
 * Tabs: Dashboard | Documents PID | Equipements | Lignes process | Tags DCS | Bibliotheque
 *
 * Architecture:
 *  - Dashboard: KPI cards, recent PIDs, status distribution
 *  - Documents PID: DataTable with filters, row click opens detail panel
 *  - Equipements: DataTable with search + type filter
 *  - Lignes process: DataTable with search
 *  - Tags DCS: DataTable with search, type, area filters + CSV import
 *  - Bibliotheque: Grid/list of process library items
 *  - PID Detail Panel: metadata, status badge, actions, revision history
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileText, Loader2, Search, Upload,
  LayoutDashboard, Layers, GitBranch, Tag, BookOpen,
  Lock, FilePlus2, ShieldCheck,
  FileDown, Cpu, History, PenTool,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  FormSection,
  ReadOnlyRow,
  PanelActionButton,
  PanelContentLayout,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useToast } from '@/components/ui/Toast'
import {
  usePIDDocuments,
  usePIDDocument,
  useEquipment,
  useProcessLines,
  useDCSTags,
  useImportTagsCsv,
  useProcessLibrary,
  usePIDRevisions,
  useValidateAfc,
  useAcquireLock,
  useCreatePIDRevision,
  useCreatePIDDocument,
  useSaveXml,
} from '@/hooks/usePidPfd'
import { DrawioEditor } from '@/components/pid-pfd/DrawioEditor'
import type {
  PIDDocument,
  Equipment,
  ProcessLine,
  DCSTag,
} from '@/services/pidPfdService'
import { pidPfdService } from '@/services/pidPfdService'

// -- Constants ----------------------------------------------------------------

const PID_TYPE_LABELS: Record<string, string> = {
  pid: 'P&ID',
  pfd: 'PFD',
  uid: 'UID',
  ufd: 'UFD',
  cause_effect: 'Cause & Effet',
  sld: 'SLD',
  layout: 'Layout',
  tie_in: 'Tie-in',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'gl-badge-neutral',
  in_review: 'gl-badge-warning',
  approved: 'gl-badge-success',
  issued: 'gl-badge-info',
  superseded: 'gl-badge-warning',
  cancelled: 'gl-badge-danger',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  in_review: 'En revue',
  approved: 'Approuve',
  issued: 'Emis',
  superseded: 'Remplace',
  cancelled: 'Annule',
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'in_review', label: 'En revue' },
  { value: 'approved', label: 'Approuve' },
  { value: 'issued', label: 'Emis' },
  { value: 'superseded', label: 'Remplace' },
  { value: 'cancelled', label: 'Annule' },
]

const PID_TYPE_OPTIONS = [
  { value: 'pid', label: 'P&ID' },
  { value: 'pfd', label: 'PFD' },
  { value: 'uid', label: 'UID' },
  { value: 'ufd', label: 'UFD' },
  { value: 'cause_effect', label: 'Cause & Effet' },
  { value: 'sld', label: 'SLD' },
  { value: 'layout', label: 'Layout' },
  { value: 'tie_in', label: 'Tie-in' },
]

const EQUIPMENT_TYPE_OPTIONS = [
  { value: 'vessel', label: 'Capacite' },
  { value: 'pump', label: 'Pompe' },
  { value: 'compressor', label: 'Compresseur' },
  { value: 'heat_exchanger', label: 'Echangeur' },
  { value: 'valve', label: 'Vanne' },
  { value: 'tank', label: 'Bac' },
  { value: 'filter', label: 'Filtre' },
  { value: 'instrument', label: 'Instrument' },
  { value: 'other', label: 'Autre' },
]

const TAG_TYPE_OPTIONS = [
  { value: 'TI', label: 'TI - Temperature' },
  { value: 'PI', label: 'PI - Pression' },
  { value: 'FI', label: 'FI - Debit' },
  { value: 'LI', label: 'LI - Niveau' },
  { value: 'AI', label: 'AI - Analyseur' },
  { value: 'XV', label: 'XV - Vanne TOR' },
  { value: 'FCV', label: 'FCV - Vanne reglante' },
  { value: 'PSV', label: 'PSV - Soupape' },
  { value: 'other', label: 'Autre' },
]

type PidPfdTab = 'dashboard' | 'documents' | 'equipements' | 'lignes' | 'tags' | 'bibliotheque'

const TABS: { id: PidPfdTab; label: string; icon: typeof FileText }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'documents', label: 'Documents PID', icon: FileText },
  { id: 'equipements', label: 'Equipements', icon: Cpu },
  { id: 'lignes', label: 'Lignes process', icon: GitBranch },
  { id: 'tags', label: 'Tags DCS', icon: Tag },
  { id: 'bibliotheque', label: 'Bibliotheque', icon: BookOpen },
]

// -- Helpers ------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('gl-badge', STATUS_COLORS[status] || 'gl-badge-neutral')}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function KpiCard({ label, value, icon: Icon, color }: {
  label: string
  value: number | string
  icon: typeof FileText
  color: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-4">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', color)}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// -- PID Detail Panel ---------------------------------------------------------

function PIDDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()

  const { data: doc, isLoading } = usePIDDocument(id)
  const { data: revisions, isLoading: revisionsLoading } = usePIDRevisions(id)
  const validateAfc = useValidateAfc()
  const acquireLock = useAcquireLock()
  const createRevision = useCreatePIDRevision()
  const saveXml = useSaveXml()

  // Draw.io editor state
  const [showEditor, setShowEditor] = useState(false)

  const handleSaveXml = useCallback(async (xml: string) => {
    try {
      await saveXml.mutateAsync({ id, xmlContent: xml })
      toast({ title: 'Diagramme sauvegarde', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de la sauvegarde du diagramme', variant: 'error' })
    }
  }, [id, saveXml, toast])

  const handleValidateAfc = useCallback(async () => {
    try {
      const result = await validateAfc.mutateAsync(id)
      if (result.is_valid) {
        toast({ title: 'Validation AFC reussie', variant: 'success' })
      } else {
        toast({
          title: `Validation AFC echouee — ${result.errors.length} erreur(s)`,
          variant: 'error',
        })
      }
    } catch {
      toast({ title: 'Erreur lors de la validation', variant: 'error' })
    }
  }, [id, validateAfc, toast])

  const handleCreateRevision = useCallback(async () => {
    try {
      await createRevision.mutateAsync({ pidId: id, payload: { change_type: 'minor' } })
      toast({ title: 'Nouvelle revision creee', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de la creation de revision', variant: 'error' })
    }
  }, [id, createRevision, toast])

  const handleExportSvg = useCallback(() => {
    window.open(pidPfdService.exportSvgUrl(id), '_blank')
  }, [id])

  const handleExportPdf = useCallback(() => {
    window.open(pidPfdService.exportPdfUrl(id), '_blank')
  }, [id])

  const handleAcquireLock = useCallback(async () => {
    try {
      await acquireLock.mutateAsync(id)
      toast({ title: 'Verrou acquis', variant: 'success' })
    } catch {
      toast({ title: 'Impossible d\'acquerir le verrou', variant: 'error' })
    }
  }, [id, acquireLock, toast])

  if (isLoading || !doc) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<FileText size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={doc.number}
      subtitle={doc.title}
      icon={<FileText size={14} className="text-primary" />}
      actions={
        <PanelActionButton onClick={closeDynamicPanel}>{t('common.close')}</PanelActionButton>
      }
    >
      <PanelContentLayout>
        {/* -- Document Metadata -- */}
        <FormSection title="Informations" collapsible defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label="Numero" value={doc.number} />
            <ReadOnlyRow label="Titre" value={doc.title} />
            <ReadOnlyRow
              label="Type"
              value={
                <span className="gl-badge gl-badge-info">
                  {PID_TYPE_LABELS[doc.pid_type] || doc.pid_type}
                </span>
              }
            />
            <ReadOnlyRow label="Revision" value={<span className="font-mono text-xs">{doc.revision}</span>} />
            <ReadOnlyRow label="Statut" value={<StatusBadge status={doc.status} />} />
            <ReadOnlyRow label="Format" value={doc.sheet_format || '--'} />
            <ReadOnlyRow label="Echelle" value={doc.scale || '--'} />
            <ReadOnlyRow label="Equipements" value={<span className="tabular-nums">{doc.equipment_count}</span>} />
            <ReadOnlyRow label="Projet" value={doc.project_name || '--'} />
            <ReadOnlyRow label="Cree par" value={doc.creator_name || '--'} />
            <ReadOnlyRow
              label="Cree le"
              value={new Date(doc.created_at).toLocaleDateString('fr-FR')}
            />
          </DetailFieldGrid>
        </FormSection>

        {/* -- Lock Status -- */}
        <FormSection title="Verrou" collapsible defaultExpanded={false}>
          <div className="flex items-center gap-2 text-sm">
            <Lock size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">Statut:</span>
            <span className="text-foreground">Non verrouille</span>
          </div>
          <button
            onClick={handleAcquireLock}
            disabled={acquireLock.isPending}
            className="gl-button-sm gl-button-default mt-2"
          >
            {acquireLock.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Lock size={12} />
            )}
            <span>Acquerir le verrou</span>
          </button>
        </FormSection>

        {/* -- SVG Preview / Draw.io Editor -- */}
        {showEditor ? (
          <FormSection title="Editeur Draw.io" collapsible={false}>
            <div className="h-[500px] -mx-3 -mb-1">
              <DrawioEditor
                xmlContent={doc.xml_content ?? undefined}
                onSave={handleSaveXml}
                onClose={() => setShowEditor(false)}
                drawioUrl="http://localhost:8080"
              />
            </div>
          </FormSection>
        ) : doc.xml_content ? (
          <FormSection title="Apercu du diagramme" collapsible defaultExpanded>
            <div
              className="w-full max-h-[200px] overflow-hidden rounded border border-border bg-muted/10 flex items-center justify-center cursor-pointer hover:bg-muted/20 transition-colors"
              onClick={() => setShowEditor(true)}
              title="Cliquer pour ouvrir l'editeur"
            >
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-8">
                <PenTool size={14} />
                <span>Cliquer pour editer le diagramme</span>
              </div>
            </div>
          </FormSection>
        ) : null}

        {/* -- Actions -- */}
        <FormSection title="Actions" collapsible defaultExpanded>
          <div className="flex flex-wrap gap-2">
            <button
              className="gl-button-sm gl-button-confirm"
              onClick={() => setShowEditor(true)}
            >
              <PenTool size={12} />
              <span>Ouvrir l&apos;editeur</span>
            </button>
            <button
              className="gl-button-sm gl-button-default"
              onClick={handleCreateRevision}
              disabled={createRevision.isPending}
            >
              {createRevision.isPending ? <Loader2 size={12} className="animate-spin" /> : <FilePlus2 size={12} />}
              <span>Creer revision</span>
            </button>
            <button
              className="gl-button-sm gl-button-default"
              onClick={handleValidateAfc}
              disabled={validateAfc.isPending}
            >
              {validateAfc.isPending ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
              <span>Valider AFC</span>
            </button>
            <button className="gl-button-sm gl-button-default" onClick={handleExportSvg}>
              <FileDown size={12} />
              <span>Exporter SVG</span>
            </button>
            <button className="gl-button-sm gl-button-default" onClick={handleExportPdf}>
              <FileDown size={12} />
              <span>Exporter PDF</span>
            </button>
          </div>
        </FormSection>

        {/* -- Revision History -- */}
        <FormSection title={`Historique des revisions${revisions ? ` (${revisions.length})` : ''}`} collapsible defaultExpanded>
          {revisionsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            </div>
          ) : revisions && revisions.length > 0 ? (
            <div className="space-y-1.5">
              {revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="flex items-start gap-2 rounded px-2 py-1.5 bg-muted/30 text-xs"
                >
                  <History size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-foreground">{rev.revision_code}</span>
                      <span className="gl-badge gl-badge-neutral">{rev.change_type}</span>
                    </div>
                    {rev.change_description && (
                      <p className="text-muted-foreground mt-0.5">{rev.change_description}</p>
                    )}
                    <p className="text-muted-foreground/60 mt-0.5">
                      {rev.creator_name || 'Systeme'} — {new Date(rev.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune revision enregistree.</p>
          )}
        </FormSection>

        {/* Tags, Notes & Attachments */}
        <FormSection title="Tags, notes & fichiers" collapsible defaultExpanded={false}>
          <div className="space-y-3">
            <TagManager ownerType="pid_document" ownerId={doc.id} compact />
            <AttachmentManager ownerType="pid_document" ownerId={doc.id} compact />
            <NoteManager ownerType="pid_document" ownerId={doc.id} compact />
          </div>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Dashboard Tab ------------------------------------------------------------

function DashboardTab() {
  // Fetch summary data from existing hooks
  const { data: docsData } = usePIDDocuments({ page: 1, page_size: 5 })
  const { data: equipData } = useEquipment({ page: 1, page_size: 1 })
  const { data: tagsData } = useDCSTags({ page: 1, page_size: 1 })
  const { data: linesData } = useProcessLines({ page: 1, page_size: 1 })

  const totalPids = docsData?.total ?? 0
  const totalEquipment = equipData?.total ?? 0
  const totalTags = tagsData?.total ?? 0
  const totalLines = linesData?.total ?? 0

  // Status distribution from documents
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    if (docsData?.items) {
      for (const doc of docsData.items) {
        counts[doc.status] = (counts[doc.status] || 0) + 1
      }
    }
    return counts
  }, [docsData?.items])

  return (
    <div className="p-4 space-y-6">
      {/* KPI Cards */}
      <CollapsibleSection id="pid-kpis" title="Indicateurs" defaultExpanded showSeparator={false}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          <KpiCard label="Documents PID" value={totalPids} icon={FileText} color="bg-blue-600" />
          <KpiCard label="Equipements" value={totalEquipment} icon={Cpu} color="bg-emerald-600" />
          <KpiCard label="Tags DCS" value={totalTags} icon={Tag} color="bg-amber-600" />
          <KpiCard label="Lignes process" value={totalLines} icon={GitBranch} color="bg-purple-600" />
        </div>
      </CollapsibleSection>

      {/* Status Distribution */}
      <CollapsibleSection id="pid-status-dist" title="Repartition par statut" defaultExpanded showSeparator={false}>
        <div className="mt-2 flex flex-wrap gap-3">
          {STATUS_OPTIONS.map((opt) => {
            const count = statusCounts[opt.value] ?? 0
            return (
              <div key={opt.value} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span className={cn('gl-badge', STATUS_COLORS[opt.value] || 'gl-badge-neutral')}>
                  {opt.label}
                </span>
                <span className="font-semibold tabular-nums text-foreground">{count}</span>
              </div>
            )
          })}
        </div>
      </CollapsibleSection>

      {/* Recent PIDs */}
      <CollapsibleSection id="pid-recent" title="Documents recents" defaultExpanded showSeparator={false}>
        {docsData?.items && docsData.items.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {docsData.items.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted/30 transition-colors"
              >
                <FileText size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{doc.number}</span>
                    <span className="gl-badge gl-badge-info text-[10px]">
                      {PID_TYPE_LABELS[doc.pid_type] || doc.pid_type}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{doc.title}</p>
                </div>
                <StatusBadge status={doc.status} />
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {new Date(doc.updated_at).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Aucun document PID.</p>
        )}
      </CollapsibleSection>
    </div>
  )
}

// -- Library Tab --------------------------------------------------------------

function LibraryTab() {
  const [libSearch, setLibSearch] = useState('')
  const [libCategory, setLibCategory] = useState('')
  const debouncedLibSearch = useDebounce(libSearch, 300)
  const { data: libraryItems, isLoading } = useProcessLibrary({
    category: libCategory || undefined,
    search: debouncedLibSearch || undefined,
  })

  // Collect unique categories from data
  const categories = useMemo(() => {
    if (!libraryItems) return []
    const set = new Set(libraryItems.map((i) => i.category))
    return Array.from(set).sort()
  }, [libraryItems])

  return (
    <div className="p-4 space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={libSearch}
            onChange={(e) => setLibSearch(e.target.value)}
            className="gl-form-input pl-8 w-full"
            placeholder="Rechercher un composant..."
          />
        </div>
        <select
          value={libCategory}
          onChange={(e) => setLibCategory(e.target.value)}
          className="gl-form-select"
        >
          <option value="">Toutes categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : libraryItems && libraryItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {libraryItems.map((item) => (
            <div
              key={item.id}
              className="group flex flex-col items-center gap-2 rounded-lg border border-border p-3 hover:border-primary/40 hover:bg-muted/20 transition-colors cursor-pointer"
            >
              {/* SVG preview placeholder */}
              <div className="w-full aspect-square flex items-center justify-center bg-muted/30 rounded border border-border overflow-hidden">
                {item.svg_template ? (
                  <div
                    className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full"
                    dangerouslySetInnerHTML={{ __html: item.svg_template }}
                  />
                ) : (
                  <Layers size={24} className="text-muted-foreground/40" />
                )}
              </div>
              <div className="text-center w-full">
                <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{item.category}{item.subcategory ? ` / ${item.subcategory}` : ''}</p>
              </div>
              {item.equipment_type_mapping && (
                <span className="gl-badge gl-badge-neutral text-[10px]">{item.equipment_type_mapping}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <BookOpen size={32} className="mb-2 opacity-40" />
          <p className="text-sm">Aucun element dans la bibliotheque.</p>
        </div>
      )}
    </div>
  )
}

// -- Main Page ----------------------------------------------------------------

export function PidPfdPage() {
  useTranslation() // loaded for future i18n
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<PidPfdTab>('dashboard')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})
  const csvInputRef = useRef<HTMLInputElement>(null)

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  // Reset pagination when filters/tab change
  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters, activeTab])

  const handleTabChange = useCallback((tab: PidPfdTab) => {
    setActiveTab(tab)
    setSearch('')
    setActiveFilters({})
    setPage(1)
  }, [])

  // -- Extract filter values --
  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const equipTypeFilter = typeof activeFilters.equipment_type === 'string' ? activeFilters.equipment_type : undefined
  const tagTypeFilter = typeof activeFilters.tag_type === 'string' ? activeFilters.tag_type : undefined
  const areaFilter = typeof activeFilters.area === 'string' ? activeFilters.area : undefined

  // -- Data fetching --

  const { data: docsData, isLoading: docsLoading } = usePIDDocuments({
    page: activeTab === 'documents' ? page : 1,
    page_size: activeTab === 'documents' ? pageSize : 1,
    status: activeTab === 'documents' ? statusFilter : undefined,
    search: activeTab === 'documents' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: equipData, isLoading: equipLoading } = useEquipment({
    page: activeTab === 'equipements' ? page : 1,
    page_size: activeTab === 'equipements' ? pageSize : 1,
    equipment_type: activeTab === 'equipements' ? equipTypeFilter : undefined,
    search: activeTab === 'equipements' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: linesData, isLoading: linesLoading } = useProcessLines({
    page: activeTab === 'lignes' ? page : 1,
    page_size: activeTab === 'lignes' ? pageSize : 1,
    search: activeTab === 'lignes' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: tagsData, isLoading: tagsLoading } = useDCSTags({
    page: activeTab === 'tags' ? page : 1,
    page_size: activeTab === 'tags' ? pageSize : 1,
    tag_type: activeTab === 'tags' ? tagTypeFilter : undefined,
    area: activeTab === 'tags' ? areaFilter : undefined,
    search: activeTab === 'tags' ? (debouncedSearch || undefined) : undefined,
  })

  const importCsv = useImportTagsCsv()

  // Nav items for panel navigation
  useEffect(() => {
    if (activeTab === 'documents' && docsData?.items) setNavItems(docsData.items.map((i) => i.id))
    return () => setNavItems([])
  }, [activeTab, docsData?.items, setNavItems])

  // -- Filter definitions --

  const docFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'select', options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
    { id: 'pid_type', label: 'Type', type: 'select', options: PID_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  ], [])

  const equipFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'equipment_type', label: 'Type', type: 'select', options: EQUIPMENT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  ], [])

  const tagFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'tag_type', label: 'Type', type: 'select', options: TAG_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
    { id: 'area', label: 'Zone', type: 'select', options: [] }, // populated dynamically if needed
  ], [])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  // -- Column definitions --

  const docColumns = useMemo<ColumnDef<PIDDocument, unknown>[]>(() => [
    {
      accessorKey: 'number',
      header: 'Numero',
      size: 130,
      cell: ({ row }) => <span className="font-medium font-mono text-foreground">{row.original.number}</span>,
    },
    {
      accessorKey: 'title',
      header: 'Titre',
      cell: ({ row }) => <span className="text-foreground">{row.original.title}</span>,
    },
    {
      accessorKey: 'pid_type',
      header: 'Type',
      size: 110,
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-info">
          {PID_TYPE_LABELS[row.original.pid_type] || row.original.pid_type}
        </span>
      ),
    },
    {
      accessorKey: 'revision',
      header: 'Revision',
      size: 80,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.revision}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 100,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'sheet_format',
      header: 'Format',
      size: 80,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.sheet_format || '--'}</span>,
    },
    {
      accessorKey: 'equipment_count',
      header: 'Equipements',
      size: 100,
      cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{row.original.equipment_count}</span>,
    },
    {
      accessorKey: 'updated_at',
      header: 'Date',
      size: 100,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs tabular-nums">
          {new Date(row.original.updated_at).toLocaleDateString('fr-FR')}
        </span>
      ),
    },
  ], [])

  const equipColumns = useMemo<ColumnDef<Equipment, unknown>[]>(() => [
    {
      accessorKey: 'tag',
      header: 'Tag',
      size: 120,
      cell: ({ row }) => <span className="font-medium font-mono text-foreground">{row.original.tag}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-foreground">{row.original.description || '--'}</span>,
    },
    {
      accessorKey: 'equipment_type',
      header: 'Type',
      size: 110,
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral">
          {EQUIPMENT_TYPE_OPTIONS.find((o) => o.value === row.original.equipment_type)?.label || row.original.equipment_type}
        </span>
      ),
    },
    {
      accessorKey: 'service',
      header: 'Service',
      size: 100,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.service || '--'}</span>,
    },
    {
      accessorKey: 'fluid',
      header: 'Fluide',
      size: 100,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.fluid || '--'}</span>,
    },
    {
      accessorKey: 'pid_number',
      header: 'PID#',
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground text-xs font-mono">{row.original.pid_number || '--'}</span>,
    },
  ], [])

  const lineColumns = useMemo<ColumnDef<ProcessLine, unknown>[]>(() => [
    {
      accessorKey: 'line_number',
      header: 'N° Ligne',
      size: 140,
      cell: ({ row }) => <span className="font-medium font-mono text-foreground">{row.original.line_number}</span>,
    },
    {
      accessorKey: 'nominal_diameter_inch',
      header: 'Diametre',
      size: 90,
      cell: ({ row }) => {
        const d = row.original
        if (d.nominal_diameter_inch) return <span className="text-muted-foreground text-xs tabular-nums">{d.nominal_diameter_inch}&quot;</span>
        if (d.nominal_diameter_mm) return <span className="text-muted-foreground text-xs tabular-nums">{d.nominal_diameter_mm} mm</span>
        return <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      accessorKey: 'pipe_schedule',
      header: 'Schedule',
      size: 90,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.pipe_schedule || '--'}</span>,
    },
    {
      accessorKey: 'spec_class',
      header: 'Classe spec',
      size: 100,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.spec_class || '--'}</span>,
    },
    {
      accessorKey: 'fluid',
      header: 'Fluide',
      size: 100,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.fluid || row.original.fluid_full_name || '--'}</span>,
    },
    {
      accessorKey: 'insulation_type',
      header: 'Isolation',
      size: 100,
      cell: ({ row }) => {
        const ins = row.original.insulation_type
        if (!ins || ins === 'none') return <span className="text-muted-foreground/40">--</span>
        return <span className="gl-badge gl-badge-neutral text-[10px]">{ins}{row.original.insulation_thickness_mm ? ` ${row.original.insulation_thickness_mm}mm` : ''}</span>
      },
    },
  ], [])

  const tagColumns = useMemo<ColumnDef<DCSTag, unknown>[]>(() => [
    {
      accessorKey: 'tag_name',
      header: 'Tag',
      size: 140,
      cell: ({ row }) => <span className="font-medium font-mono text-foreground">{row.original.tag_name}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-foreground">{row.original.description || '--'}</span>,
    },
    {
      accessorKey: 'tag_type',
      header: 'Type',
      size: 80,
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.tag_type}</span>,
    },
    {
      accessorKey: 'area',
      header: 'Zone',
      size: 90,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.area || '--'}</span>,
    },
    {
      accessorKey: 'equipment_tag',
      header: 'Equipement',
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground text-xs font-mono">{row.original.equipment_tag || '--'}</span>,
    },
    {
      accessorKey: 'dcs_address',
      header: 'Adresse DCS',
      size: 130,
      cell: ({ row }) => <span className="text-muted-foreground text-xs font-mono">{row.original.dcs_address || '--'}</span>,
    },
  ], [])

  // -- Pagination helpers --

  const docsPagination: DataTablePagination | undefined = docsData
    ? { page: docsData.page, pageSize, total: docsData.total, pages: docsData.pages }
    : undefined

  const equipPagination: DataTablePagination | undefined = equipData
    ? { page: equipData.page, pageSize, total: equipData.total, pages: equipData.pages }
    : undefined

  const linesPagination: DataTablePagination | undefined = linesData
    ? { page: linesData.page, pageSize, total: linesData.total, pages: linesData.pages }
    : undefined

  const tagsPagination: DataTablePagination | undefined = tagsData
    ? { page: tagsData.page, pageSize, total: tagsData.total, pages: tagsData.pages }
    : undefined

  // -- CSV import handler --

  const handleCsvImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Resolve project_id from active filters or from a loaded document
    const filteredProjectId = typeof activeFilters.project_id === 'string' ? activeFilters.project_id : undefined
    const fallbackProjectId = docsData?.items?.[0]?.project_id as string | undefined
    const projectId = filteredProjectId || fallbackProjectId

    if (!projectId) {
      toast({ title: 'Veuillez selectionner un projet avant d\'importer un CSV', variant: 'error' })
      if (csvInputRef.current) csvInputRef.current.value = ''
      return
    }

    try {
      await importCsv.mutateAsync({ projectId, file })
      toast({ title: 'Import CSV reussi', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de l\'import CSV', variant: 'error' })
    }
    // Reset input
    if (csvInputRef.current) csvInputRef.current.value = ''
  }, [importCsv, toast, activeFilters, docsData])

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'pid-pfd'

  // -- Toolbar actions per tab --

  const toolbarAction = useMemo(() => {
    if (activeTab === 'documents') {
      return (
        <ToolbarButton
          icon={FilePlus2}
          label="Nouveau PID"
          variant="primary"
          onClick={() => openDynamicPanel({ type: 'create', module: 'pid-pfd' })}
        />
      )
    }
    if (activeTab === 'tags') {
      return (
        <>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCsvImport}
          />
          <ToolbarButton
            icon={Upload}
            label="Importer CSV"
            onClick={() => csvInputRef.current?.click()}
            disabled={importCsv.isPending}
          />
        </>
      )
    }
    return null
  }, [activeTab, handleCsvImport, importCsv.isPending, openDynamicPanel])

  // -- Tab content renderer --

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab />

      case 'documents':
        return (
          <DataTable<PIDDocument>
            columns={docColumns}
            data={docsData?.items ?? []}
            isLoading={docsLoading}
            pagination={docsPagination}
            onPaginationChange={(p, size) => {
              if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p)
            }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par numero, titre..."
            filters={docFilters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'pid-pfd', id: row.id })}
            emptyIcon={FileText}
            emptyTitle="Aucun document PID"
            importExport={{
              exportFormats: ['csv', 'xlsx'],
              advancedExport: true,
              filenamePrefix: 'pid-pfd',
              exportHeaders: {
                number: 'Numero',
                title: 'Titre',
                pid_type: 'Type',
                revision: 'Revision',
                status: 'Statut',
                sheet_format: 'Format',
                equipment_count: 'Equipements',
                updated_at: 'Date',
              },
            }}
            columnResizing
            columnVisibility
            storageKey="pid-pfd-documents"
          />
        )

      case 'equipements':
        return (
          <DataTable<Equipment>
            columns={equipColumns}
            data={equipData?.items ?? []}
            isLoading={equipLoading}
            pagination={equipPagination}
            onPaginationChange={(p, size) => {
              if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p)
            }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par tag, description..."
            filters={equipFilters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            emptyIcon={Cpu}
            emptyTitle="Aucun equipement"
            columnResizing
            columnVisibility
            storageKey="pid-pfd-equipment"
          />
        )

      case 'lignes':
        return (
          <DataTable<ProcessLine>
            columns={lineColumns}
            data={linesData?.items ?? []}
            isLoading={linesLoading}
            pagination={linesPagination}
            onPaginationChange={(p, size) => {
              if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p)
            }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par numero de ligne..."
            emptyIcon={GitBranch}
            emptyTitle="Aucune ligne process"
            columnResizing
            columnVisibility
            storageKey="pid-pfd-lines"
          />
        )

      case 'tags':
        return (
          <DataTable<DCSTag>
            columns={tagColumns}
            data={tagsData?.items ?? []}
            isLoading={tagsLoading}
            pagination={tagsPagination}
            onPaginationChange={(p, size) => {
              if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p)
            }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par tag, description, adresse..."
            filters={tagFilters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            emptyIcon={Tag}
            emptyTitle="Aucun tag DCS"
            columnResizing
            columnVisibility
            storageKey="pid-pfd-tags"
          />
        )

      case 'bibliotheque':
        return <LibraryTab />
    }
  }

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader
            icon={FileText}
            title="PID / PFD"
            subtitle="Diagrammes process, equipements, lignes, instrumentation"
          >
            {toolbarAction}
          </PanelHeader>

          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 border-b border-border shrink-0 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          <PanelContent>
            {renderTabContent()}
          </PanelContent>
        </div>
      )}

      {/* Dynamic panel rendering */}
      {dynamicPanel?.module === 'pid-pfd' && dynamicPanel.type === 'detail' && (
        <PIDDetailPanel id={dynamicPanel.id} />
      )}
      {dynamicPanel?.module === 'pid-pfd' && dynamicPanel.type === 'create' && (
        <CreatePIDPanel />
      )}
    </div>
  )
}

// -- Create PID Panel ---------------------------------------------------------

function CreatePIDPanel() {
  const { closeDynamicPanel } = useUIStore()
  const { toast } = useToast()
  const createPID = useCreatePIDDocument()
  const [form, setForm] = useState({ title: '', pid_type: 'pid', sheet_format: 'A1', scale: '1:50', drawing_number: '' })

  const handleSubmit = useCallback(async () => {
    if (!form.title.trim()) {
      toast({ title: 'Erreur', description: 'Le titre est requis', variant: 'error' })
      return
    }
    try {
      await createPID.mutateAsync(form)
      toast({ title: 'Succès', description: 'PID créé' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Erreur', description: 'Échec de la création', variant: 'error' })
    }
  }, [form, createPID, toast, closeDynamicPanel])

  return (
    <DynamicPanelShell title="Nouveau PID" icon={<FilePlus2 size={14} />} onClose={closeDynamicPanel}>
      <PanelContentLayout>
        <FormSection title="Informations">
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Titre *</label>
              <input className="gl-form-input text-sm w-full" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Titre du document PID" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <select className="gl-form-select text-sm w-full" value={form.pid_type} onChange={(e) => setForm((f) => ({ ...f, pid_type: e.target.value }))}>
                {Object.entries(PID_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Format feuille</label>
              <select className="gl-form-select text-sm w-full" value={form.sheet_format} onChange={(e) => setForm((f) => ({ ...f, sheet_format: e.target.value }))}>
                <option value="A0">A0</option>
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="A3">A3</option>
                <option value="A4">A4</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Échelle</label>
              <input className="gl-form-input text-sm w-full" value={form.scale} onChange={(e) => setForm((f) => ({ ...f, scale: e.target.value }))} placeholder="1:50" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Numéro de dessin</label>
              <input className="gl-form-input text-sm w-full" value={form.drawing_number} onChange={(e) => setForm((f) => ({ ...f, drawing_number: e.target.value }))} placeholder="DWG-001" />
            </div>
          </div>
        </FormSection>
        <div className="p-3 border-t border-border">
          <button className="gl-button gl-button-confirm w-full" onClick={handleSubmit} disabled={createPID.isPending}>
            {createPID.isPending ? <Loader2 size={12} className="animate-spin mr-2" /> : <FilePlus2 size={12} className="mr-2" />}
            Créer le PID
          </button>
        </div>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Register panel renderer for detached panels ------------------------------

registerPanelRenderer('pid-pfd', (view) => {
  if (view.type === 'detail' && 'id' in view) return <PIDDetailPanel id={view.id} />
  if (view.type === 'create') return <CreatePIDPanel />
  return null
})
