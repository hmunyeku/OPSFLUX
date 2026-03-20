/**
 * EntitiesTab — admin management of entities (create, edit, users, statistics).
 *
 * Full admin tab inside Settings with:
 * - DataTable listing all entities
 * - Create/Edit via DynamicPanel
 * - Users section: list/add/remove users per entity
 * - CSV/XLSX export support
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Globe, Plus, Loader2, Users,
  UserPlus, UserMinus, Check, X,
  Building2, Clock, Archive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
// PanelHeader/ToolbarButton not needed — this tab lives inside SettingsPage
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  InlineEditableRow,
  InlineEditableTags,
  ReadOnlyRow,
  PanelActionButton,
  SectionHeader,
  TagSelector,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import {
  useAllEntities,
  useEntity,
  useCreateEntity,
  useUpdateEntity,
  useEntityUsers,
  useAddEntityUser,
  useRemoveEntityUser,
} from '@/hooks/useEntities'
import { useUsers } from '@/hooks/useUsers'
import type { EntityRead, EntityCreate as EntityCreatePayload } from '@/services/entityService'
import type { ColumnDef } from '@tanstack/react-table'
import {
  DataTable,
  BadgeCell,
  DateCell,
  type DataTableFilterDef,
} from '@/components/ui/DataTable'

// ── Constants ──────────────────────────────────────────────────

const TIMEZONE_OPTIONS = [
  { value: 'Africa/Douala', label: 'Africa/Douala (WAT)' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (WAT)' },
  { value: 'Africa/Brazzaville', label: 'Africa/Brazzaville (WAT)' },
  { value: 'Africa/Libreville', label: 'Africa/Libreville (WAT)' },
  { value: 'Africa/Luanda', label: 'Africa/Luanda (WAT)' },
  { value: 'Africa/Kinshasa', label: 'Africa/Kinshasa (WAT)' },
  { value: 'Africa/Tunis', label: 'Africa/Tunis (CET)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'America/New_York', label: 'America/New_York (EST)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST)' },
  { value: 'America/Denver', label: 'America/Denver (MST)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
]

const COUNTRY_OPTIONS = [
  { value: 'CM', label: 'Cameroun' },
  { value: 'CG', label: 'Congo' },
  { value: 'CD', label: 'Congo (RDC)' },
  { value: 'GA', label: 'Gabon' },
  { value: 'GQ', label: 'Guin\u00e9e \u00c9quatoriale' },
  { value: 'TD', label: 'Tchad' },
  { value: 'TN', label: 'Tunisie' },
  { value: 'AO', label: 'Angola' },
  { value: 'GB', label: 'Royaume-Uni' },
  { value: 'FR', label: 'France' },
  { value: 'US', label: '\u00c9tats-Unis' },
  { value: 'PE', label: 'P\u00e9rou' },
  { value: 'CO', label: 'Colombie' },
  { value: 'GT', label: 'Guatemala' },
  { value: 'AU', label: 'Australie' },
]

// ── Column definitions ─────────────────────────────────────

const entityColumns: ColumnDef<EntityRead, unknown>[] = [
  {
    accessorKey: 'code',
    header: 'Code',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs font-semibold text-foreground">
        {getValue() as string}
      </span>
    ),
    size: 120,
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: 'Nom',
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground truncate max-w-[300px] block">
        {getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: 'country',
    header: 'Pays',
    cell: ({ getValue }) => {
      const v = getValue() as string | null
      if (!v) return <span className="text-muted-foreground">\u2014</span>
      const label = COUNTRY_OPTIONS.find((c) => c.value === v)?.label ?? v
      return <span className="text-sm text-muted-foreground">{label}</span>
    },
    size: 140,
  },
  {
    accessorKey: 'timezone',
    header: 'Fuseau horaire',
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground font-mono">
        {getValue() as string}
      </span>
    ),
    size: 180,
  },
  {
    accessorKey: 'user_count',
    header: 'Utilisateurs',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">
        {getValue() as number}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: 'active',
    header: 'Statut',
    cell: ({ getValue }) => {
      const active = getValue() as boolean
      return <BadgeCell value={active ? 'Active' : 'Archiv\u00e9e'} variant={active ? 'success' : 'neutral'} />
    },
    size: 100,
  },
  {
    accessorKey: 'created_at',
    header: 'Cr\u00e9\u00e9 le',
    cell: ({ getValue }) => <DateCell value={getValue() as string} />,
    size: 110,
  },
]


// ── Create Entity Panel ─────────────────────────────────────

function CreateEntityPanel() {
  const { t } = useTranslation()
  const createEntity = useCreateEntity()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const [form, setForm] = useState<EntityCreatePayload>({
    code: '',
    name: '',
    country: 'CM',
    timezone: 'Africa/Douala',
    active: true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createEntity.mutateAsync(form)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('entities.create')}
      subtitle={t('entities.title')}
      icon={<Globe size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createEntity.isPending}
            onClick={() => (document.getElementById('create-entity-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createEntity.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-entity-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <FormSection title={t('common.details')}>
          <FormGrid>
            <DynamicPanelField label={t('entities.code')} required>
              <input
                type="text"
                required
                maxLength={50}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className={panelInputClass}
                placeholder="PERENCO-CMR"
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('entities.name')} required>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={panelInputClass}
                placeholder="Perenco Cameroun"
              />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title="R\u00e9gion">
          <DynamicPanelField label={t('entities.country')}>
            <TagSelector
              options={COUNTRY_OPTIONS}
              value={form.country || 'CM'}
              onChange={(v) => setForm({ ...form, country: v })}
            />
          </DynamicPanelField>
          <DynamicPanelField label={t('entities.timezone')}>
            <TagSelector
              options={TIMEZONE_OPTIONS}
              value={form.timezone || 'Africa/Douala'}
              onChange={(v) => setForm({ ...form, timezone: v })}
            />
          </DynamicPanelField>
        </FormSection>

        <FormSection title="Statut">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={form.active !== false}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-foreground group-hover:text-primary transition-colors">
              {t('entities.active')}
            </span>
          </label>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}


// ── Entity Detail Panel ─────────────────────────────────────

function EntityDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data: entity } = useEntity(id)
  const updateEntity = useUpdateEntity()
  const { data: entityUsers, isLoading: usersLoading } = useEntityUsers(id)
  const addEntityUser = useAddEntityUser()
  const removeEntityUser = useRemoveEntityUser()

  // User picker state
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const { data: allUsersData } = useUsers({ page: 1, page_size: 50, search: userSearch || undefined })

  const handleInlineSave = useCallback((field: string, value: string) => {
    updateEntity.mutate({ id, payload: { [field]: value } })
  }, [id, updateEntity])

  const handleToggleActive = useCallback(() => {
    if (!entity) return
    updateEntity.mutate({ id, payload: { active: !entity.active } })
  }, [id, entity, updateEntity])

  const handleAddUser = useCallback((userId: string) => {
    addEntityUser.mutate({ entityId: id, userId })
    setShowUserPicker(false)
    setUserSearch('')
  }, [id, addEntityUser])

  const handleRemoveUser = useCallback((userId: string) => {
    removeEntityUser.mutate({ entityId: id, userId })
  }, [id, removeEntityUser])

  // Filter out users already in this entity from the picker
  const existingUserIds = useMemo(() => {
    return new Set((entityUsers ?? []).map((u) => u.user_id))
  }, [entityUsers])

  const availableUsers = useMemo(() => {
    if (!allUsersData?.items) return []
    return allUsersData.items.filter((u) => !existingUserIds.has(u.id) && u.active)
  }, [allUsersData, existingUserIds])

  if (!entity) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Globe size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={entity.name}
      subtitle={entity.code}
      icon={<Building2 size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton
            variant={entity.active ? 'danger' : 'primary'}
            onClick={handleToggleActive}
            disabled={updateEntity.isPending}
          >
            {entity.active ? (
              <><Archive size={12} className="mr-1" /> Archiver</>
            ) : (
              <><Check size={12} className="mr-1" /> Activer</>
            )}
          </PanelActionButton>
        </>
      }
    >
      <div className="p-4 space-y-5">
        {/* Entity header */}
        <div className="flex items-center gap-4 pb-4 border-b border-border/50">
          <div className="h-14 w-14 flex items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
            <Building2 size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground truncate">{entity.name}</h3>
            <p className="text-sm text-muted-foreground font-mono">{entity.code}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={cn('gl-badge', entity.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                {entity.active ? 'Active' : 'Archiv\u00e9e'}
              </span>
              {entity.country && (
                <span className="text-xs text-muted-foreground">
                  {COUNTRY_OPTIONS.find((c) => c.value === entity.country)?.label ?? entity.country}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Editable fields */}
        <FormSection title={t('common.details')}>
          <InlineEditableRow label={t('entities.code')} value={entity.code} onSave={(v) => handleInlineSave('code', v)} />
          <InlineEditableRow label={t('entities.name')} value={entity.name} onSave={(v) => handleInlineSave('name', v)} />
          <InlineEditableTags
            label={t('entities.country')}
            value={entity.country || ''}
            options={COUNTRY_OPTIONS}
            onSave={(v) => handleInlineSave('country', v)}
          />
          <InlineEditableTags
            label={t('entities.timezone')}
            value={entity.timezone}
            options={TIMEZONE_OPTIONS}
            onSave={(v) => handleInlineSave('timezone', v)}
          />
        </FormSection>

        {/* Users section */}
        <FormSection title={t('entities.users')} collapsible storageKey="panel.entity.sections" id="entity-users">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              {entityUsers ? `${entityUsers.length} utilisateur(s)` : '...'}
            </span>
            <button
              className="gl-button-sm gl-button-confirm"
              onClick={() => setShowUserPicker(!showUserPicker)}
            >
              <UserPlus size={12} />
              {t('entities.add_user')}
            </button>
          </div>

          {/* User picker */}
          {showUserPicker && (
            <div className="border border-border rounded-lg bg-card mb-3">
              <div className="p-2 border-b border-border/50">
                <input
                  type="text"
                  className={cn(panelInputClass, 'w-full')}
                  placeholder="Rechercher un utilisateur..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {availableUsers.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground text-center">Aucun utilisateur disponible</p>
                ) : (
                  availableUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                      onClick={() => handleAddUser(user.id)}
                    >
                      <UserPlus size={12} className="text-primary shrink-0" />
                      <span className="truncate flex-1">
                        {user.first_name} {user.last_name}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="p-1.5 border-t border-border/50 flex justify-end">
                <button
                  className="gl-button-sm gl-button-default"
                  onClick={() => { setShowUserPicker(false); setUserSearch('') }}
                >
                  <X size={12} /> Fermer
                </button>
              </div>
            </div>
          )}

          {/* Users list */}
          {usersLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            </div>
          ) : entityUsers && entityUsers.length > 0 ? (
            <div className="space-y-1">
              {entityUsers.map((user) => (
                <div
                  key={user.user_id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 group transition-colors"
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[9px] font-semibold shrink-0">
                      {user.first_name[0]}{user.last_name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground truncate block">
                      {user.first_name} {user.last_name}
                    </span>
                    {user.group_names.length > 0 && (
                      <span className="text-[10px] text-muted-foreground truncate block">
                        {user.group_names.join(', ')}
                      </span>
                    )}
                  </div>
                  <span className={cn('gl-badge text-[9px]', user.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                    {user.active ? 'Actif' : 'Inactif'}
                  </span>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                    title={t('entities.remove_user')}
                    onClick={() => handleRemoveUser(user.user_id)}
                  >
                    <UserMinus size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2">Aucun utilisateur dans cette entit\u00e9</p>
          )}
        </FormSection>

        {/* Timestamps */}
        <SectionHeader>Informations</SectionHeader>
        <div className="space-y-0">
          <ReadOnlyRow
            label="Utilisateurs"
            value={
              <span className="flex items-center gap-1.5 text-sm">
                <Users size={12} className="text-muted-foreground" />
                {entity.user_count}
              </span>
            }
          />
          <ReadOnlyRow
            label="Cr\u00e9\u00e9 le"
            value={
              <span className="flex items-center gap-1.5 text-sm">
                <Clock size={12} className="text-muted-foreground" />
                {entity.created_at
                  ? new Date(entity.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '\u2014'}
              </span>
            }
          />
        </div>
      </div>
    </DynamicPanelShell>
  )
}


// ── Main EntitiesTab ───────────────────────────────────────

export function EntitiesTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [statusFilterValue, setStatusFilterValue] = useState<string | undefined>(undefined)

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  // Build query params
  const active = statusFilterValue === 'active' ? true : statusFilterValue === 'archived' ? false : undefined
  const { data, isLoading } = useAllEntities({ page, page_size: pageSize, active })

  const filteredData = useMemo(() => data?.items ?? [], [data])

  // Set navigation items for panel prev/next
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  useEffect(() => {
    if (filteredData.length > 0) {
      setNavItems(filteredData.map((e) => e.id))
    }
    return () => setNavItems([])
  }, [filteredData, setNavItems])

  // Filters
  const filterDefs: DataTableFilterDef[] = useMemo(() => {
    const activeCount = data?.items?.filter((e) => e.active).length ?? 0
    const archivedCount = data?.items?.filter((e) => !e.active).length ?? 0
    return [{
      id: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Toutes', count: data?.total },
        { value: 'active', label: 'Actives', count: activeCount },
        { value: 'archived', label: 'Archiv\u00e9es', count: archivedCount },
      ],
    }]
  }, [data])

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'settings-entity'

  return (
    <>
      {!isFullPanel && (
        <>
          {/* Header with create button */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">{t('entities.title')}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                G\u00e9rez les entit\u00e9s de votre organisation et leurs utilisateurs.
              </p>
            </div>
            <button
              className="gl-button-sm gl-button-confirm"
              onClick={() => openDynamicPanel({ type: 'create', module: 'settings-entity' })}
            >
              <Plus size={12} />
              {t('entities.create')}
            </button>
          </div>

          <DataTable<EntityRead>
            columns={entityColumns}
            data={filteredData}
            isLoading={isLoading}
            getRowId={(row) => row.id}
            storageKey="settings-entities"

            pagination={data ? {
              page: data.page,
              pageSize: data.page_size,
              total: data.total,
              pages: data.pages,
            } : undefined}
            onPaginationChange={(p, size) => {
              setPage(p)
              setPageSize(size)
            }}

            sortable
            filters={filterDefs}
            activeFilters={{ status: statusFilterValue }}
            onFilterChange={(id, value) => {
              if (id === 'status') setStatusFilterValue(value as string | undefined)
            }}

            columnVisibility
            defaultHiddenColumns={['created_at']}

            selectable

            importExport={{
              exportFormats: ['csv', 'xlsx'],
              advancedExport: true,
              filenamePrefix: 'entites',
              exportHeaders: {
                code: 'Code',
                name: 'Nom',
                country: 'Pays',
                timezone: 'Fuseau horaire',
                user_count: 'Utilisateurs',
                active: 'Statut',
                created_at: 'Cr\u00e9\u00e9 le',
              },
            }}

            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'settings-entity', id: row.id })}

            columnResizing

            emptyIcon={Globe}
            emptyTitle={t('entities.no_entities')}
            emptyAction={{
              label: t('entities.create'),
              onClick: () => openDynamicPanel({ type: 'create', module: 'settings-entity' }),
            }}
          />
        </>
      )}

      {/* Dynamic panels */}
      {dynamicPanel?.module === 'settings-entity' && dynamicPanel.type === 'create' && <CreateEntityPanel />}
      {dynamicPanel?.module === 'settings-entity' && dynamicPanel.type === 'detail' && <EntityDetailPanel id={dynamicPanel.id} />}
    </>
  )
}
