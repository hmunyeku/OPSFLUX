/**
 * Conformite (Compliance) page — referentiel + enregistrements.
 *
 * Onglets: Referentiel | Enregistrements
 * - Referentiel: DataTable des ComplianceType (formations, certifications, etc.)
 * - Enregistrements: DataTable des ComplianceRecord (instances liees aux employes/tiers/assets)
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ShieldCheck, Plus, Loader2, Trash2, FileCheck, ClipboardList,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  InlineEditableRow,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useToast } from '@/components/ui/Toast'
import {
  useComplianceTypes, useCreateComplianceType, useUpdateComplianceType, useDeleteComplianceType,
  useComplianceRecords,
} from '@/hooks/useConformite'
import type {
  ComplianceType, ComplianceTypeCreate,
  ComplianceRecord,
} from '@/types/api'

// -- Constants ----------------------------------------------------------------

const CATEGORY_OPTIONS = [
  { value: 'formation', label: 'Formation' },
  { value: 'certification', label: 'Certification' },
  { value: 'habilitation', label: 'Habilitation' },
  { value: 'audit', label: 'Audit' },
  { value: 'medical', label: 'Medical' },
]

const STATUS_OPTIONS = [
  { value: 'valid', label: 'Valide' },
  { value: 'expired', label: 'Expire' },
  { value: 'pending', label: 'En attente' },
  { value: 'rejected', label: 'Rejete' },
]

type ConformiteTab = 'referentiel' | 'enregistrements'

const TABS: { id: ConformiteTab; label: string; icon: typeof ShieldCheck }[] = [
  { id: 'referentiel', label: 'Referentiel', icon: ClipboardList },
  { id: 'enregistrements', label: 'Enregistrements', icon: FileCheck },
]

// -- Create Type Panel --------------------------------------------------------

function CreateTypePanel() {
  const { t } = useTranslation()
  const createType = useCreateComplianceType()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const [form, setForm] = useState<ComplianceTypeCreate>({
    category: 'formation',
    code: '',
    name: '',
    description: null,
    validity_days: null,
    is_mandatory: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createType.mutateAsync(form)
      closeDynamicPanel()
      toast({ title: 'Type de conformite cree', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouveau type"
      subtitle="Conformite"
      icon={<ShieldCheck size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createType.isPending}
            onClick={() => (document.getElementById('create-ct-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createType.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-ct-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Categorie">
            <TagSelector
              options={CATEGORY_OPTIONS}
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
            />
          </FormSection>

          <FormSection title="Informations">
            <FormGrid>
              <DynamicPanelField label="Code" required>
                <input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={panelInputClass} placeholder="FORM-001" />
              </DynamicPanelField>
              <DynamicPanelField label="Nom" required>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Formation HSE Niveau 1" />
              </DynamicPanelField>
              <DynamicPanelField label="Validite (jours)">
                <input type="number" value={form.validity_days ?? ''} onChange={(e) => setForm({ ...form, validity_days: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="365 (vide = permanent)" />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>

          <FormSection title="Description">
            <textarea
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value || null })}
              className={`${panelInputClass} min-h-[60px] resize-y`}
              placeholder="Description du type de conformite..."
              rows={3}
            />
          </FormSection>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_mandatory} onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })} className="rounded border-border" />
            Obligatoire par defaut
          </label>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Type Detail Panel --------------------------------------------------------

function TypeDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data } = useComplianceTypes({ page: 1, page_size: 100 })
  const ct = data?.items.find((c) => c.id === id)
  const updateType = useUpdateComplianceType()
  const deleteType = useDeleteComplianceType()
  const { toast } = useToast()

  const handleSave = useCallback((field: string, value: string) => {
    updateType.mutate({ id, payload: { [field]: value } })
  }, [id, updateType])

  const handleDelete = useCallback(async () => {
    await deleteType.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: 'Type archive', variant: 'success' })
  }, [id, deleteType, closeDynamicPanel, toast])

  if (!ct) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<ShieldCheck size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={ct.code}
      subtitle={ct.name}
      icon={<ShieldCheck size={14} className="text-primary" />}
      actions={
        <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleDelete} confirmLabel="Supprimer ?">
          {t('common.delete')}
        </DangerConfirmButton>
      }
    >
      <PanelContentLayout>
        <FormSection title="Informations" collapsible defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label="Categorie" value={<span className="gl-badge gl-badge-info">{CATEGORY_OPTIONS.find(o => o.value === ct.category)?.label ?? ct.category}</span>} />
            <InlineEditableRow label="Code" value={ct.code} onSave={(v) => handleSave('code', v)} />
            <InlineEditableRow label="Nom" value={ct.name} onSave={(v) => handleSave('name', v)} />
            <ReadOnlyRow label="Validite" value={ct.validity_days ? `${ct.validity_days} jours` : 'Permanent'} />
            <ReadOnlyRow label="Obligatoire" value={ct.is_mandatory ? 'Oui' : 'Non'} />
          </DetailFieldGrid>
        </FormSection>

        <FormSection title="Description" collapsible defaultExpanded={false}>
          <InlineEditableRow label="Description" value={ct.description || ''} onSave={(v) => handleSave('description', v)} />
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Main Page ----------------------------------------------------------------

export function ConformitePage() {
  useTranslation() // loaded for future i18n
  const [activeTab, setActiveTab] = useState<ConformiteTab>('referentiel')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters, activeTab])

  const handleTabChange = useCallback((tab: ConformiteTab) => {
    setActiveTab(tab)
    setSearch('')
    setActiveFilters({})
    setPage(1)
  }, [])

  // Data
  const categoryFilter = typeof activeFilters.category === 'string' ? activeFilters.category : undefined
  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined

  const { data: typesData, isLoading: typesLoading } = useComplianceTypes({
    page: activeTab === 'referentiel' ? page : 1,
    page_size: activeTab === 'referentiel' ? pageSize : 1,
    category: activeTab === 'referentiel' ? categoryFilter : undefined,
    search: activeTab === 'referentiel' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: recordsData, isLoading: recordsLoading } = useComplianceRecords({
    page: activeTab === 'enregistrements' ? page : 1,
    page_size: activeTab === 'enregistrements' ? pageSize : 1,
    status: activeTab === 'enregistrements' ? statusFilter : undefined,
    category: activeTab === 'enregistrements' ? categoryFilter : undefined,
    search: activeTab === 'enregistrements' ? (debouncedSearch || undefined) : undefined,
  })

  useEffect(() => {
    if (activeTab === 'referentiel' && typesData?.items) setNavItems(typesData.items.map(i => i.id))
    else if (activeTab === 'enregistrements' && recordsData?.items) setNavItems(recordsData.items.map(i => i.id))
    return () => setNavItems([])
  }, [activeTab, typesData?.items, recordsData?.items, setNavItems])

  // Filters
  const typeFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'category', label: 'Categorie', type: 'select', options: CATEGORY_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
  ], [])

  const recordFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'category', label: 'Categorie', type: 'select', options: CATEGORY_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
    { id: 'status', label: 'Statut', type: 'select', options: STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
  ], [])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  // Columns
  const typeColumns = useMemo<ColumnDef<ComplianceType, unknown>[]>(() => [
    { accessorKey: 'code', header: 'Code', size: 100, cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
    { accessorKey: 'name', header: 'Nom', cell: ({ row }) => <span className="text-foreground">{row.original.name}</span> },
    { accessorKey: 'category', header: 'Categorie', size: 120, cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{CATEGORY_OPTIONS.find(o => o.value === row.original.category)?.label ?? row.original.category}</span> },
    { accessorKey: 'validity_days', header: 'Validite', size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.validity_days ? `${row.original.validity_days}j` : 'Permanent'}</span> },
    { accessorKey: 'is_mandatory', header: 'Obligatoire', size: 90, cell: ({ row }) => row.original.is_mandatory ? <span className="gl-badge gl-badge-warning">Oui</span> : <span className="text-muted-foreground/40">--</span> },
  ], [])

  const recordColumns = useMemo<ColumnDef<ComplianceRecord, unknown>[]>(() => [
    { accessorKey: 'type_name', header: 'Type', cell: ({ row }) => <span className="text-foreground font-medium">{row.original.type_name || '--'}</span> },
    { accessorKey: 'type_category', header: 'Categorie', size: 110, cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.type_category || '--'}</span> },
    { accessorKey: 'owner_type', header: 'Objet', size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.owner_type}</span> },
    { accessorKey: 'status', header: 'Statut', size: 90, cell: ({ row }) => {
      const s = row.original.status
      const cls = s === 'valid' ? 'gl-badge-success' : s === 'expired' ? 'gl-badge-danger' : s === 'pending' ? 'gl-badge-warning' : 'gl-badge-neutral'
      return <span className={cn('gl-badge', cls)}>{STATUS_OPTIONS.find(o => o.value === s)?.label ?? s}</span>
    }},
    { accessorKey: 'expires_at', header: 'Expiration', size: 110, cell: ({ row }) => row.original.expires_at ? <span className="text-muted-foreground text-xs">{new Date(row.original.expires_at).toLocaleDateString('fr-FR')}</span> : <span className="text-muted-foreground/40">--</span> },
    { accessorKey: 'issuer', header: 'Emetteur', size: 120, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.issuer || '--'}</span> },
  ], [])

  const typesPagination: DataTablePagination | undefined = typesData ? { page: typesData.page, pageSize, total: typesData.total, pages: typesData.pages } : undefined
  const recordsPagination: DataTablePagination | undefined = recordsData ? { page: recordsData.page, pageSize, total: recordsData.total, pages: recordsData.pages } : undefined

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'conformite'

  return (
    <div className="flex h-full">
      {!isFullPanel && <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader icon={ShieldCheck} title="Conformite" subtitle="Formations, certifications, habilitations, audits">
          {activeTab === 'referentiel' && (
            <ToolbarButton icon={Plus} label="Nouveau type" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite' })} />
          )}
        </PanelHeader>

        <div className="flex items-center gap-1 px-4 border-b border-border shrink-0">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)} className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}>
                <Icon size={13} />
                {tab.label}
              </button>
            )
          })}
        </div>

        <PanelContent>
          {activeTab === 'referentiel' ? (
            <DataTable<ComplianceType>
              columns={typeColumns}
              data={typesData?.items ?? []}
              isLoading={typesLoading}
              pagination={typesPagination}
              onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Rechercher par code ou nom..."
              filters={typeFilters}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'conformite', id: row.id })}
              emptyIcon={ShieldCheck}
              emptyTitle="Aucun type de conformite"
              columnResizing
              columnVisibility
              storageKey="conformite-types"
            />
          ) : (
            <DataTable<ComplianceRecord>
              columns={recordColumns}
              data={recordsData?.items ?? []}
              isLoading={recordsLoading}
              pagination={recordsPagination}
              onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Rechercher par type, emetteur..."
              filters={recordFilters}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              emptyIcon={FileCheck}
              emptyTitle="Aucun enregistrement"
              columnResizing
              columnVisibility
              storageKey="conformite-records"
            />
          )}
        </PanelContent>
      </div>}

      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'create' && <CreateTypePanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'detail' && <TypeDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

registerPanelRenderer('conformite', (view) => {
  if (view.type === 'create') return <CreateTypePanel />
  if (view.type === 'detail' && 'id' in view) return <TypeDetailPanel id={view.id} />
  return null
})
