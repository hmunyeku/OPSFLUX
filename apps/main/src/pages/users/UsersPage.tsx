/**
 * Users page — powered by DataTable universal component.
 *
 * Features:
 * - Table & Grid views via DataTable viewModes
 * - Sorting, filtering, pagination, column visibility
 * - Row selection with batch actions
 * - Avatar cells
 * - CSV export
 * - Rich create & detail panels
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users, Plus, Loader2,
  UserCheck, UserX, Calendar, Clock,
  CheckSquare, Square,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelHeader, ToolbarButton } from '@/components/layout/PanelHeader'
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
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useUsers, useUser, useCreateUser, useUpdateUser } from '@/hooks/useUsers'
import type { UserRead, UserCreate } from '@/types/api'
import type { ColumnDef } from '@tanstack/react-table'
import {
  DataTable,
  AvatarCell,
  BadgeCell,
  DateCell,
  type DataTableFilterDef,
  type DataTableBatchAction,
  type CardRendererProps,
} from '@/components/ui/DataTable'
import { relativeTime, getAvatarColor } from '@/components/ui/DataTable/utils'

const LANGUAGE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
]

// ── Column definitions ─────────────────────────────────────
const userColumns: ColumnDef<UserRead, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Nom',
    accessorFn: (row) => `${row.first_name} ${row.last_name}`,
    cell: ({ row }) => (
      <AvatarCell
        name={`${row.original.first_name} ${row.original.last_name}`}
        avatarUrl={row.original.avatar_url}
      />
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ getValue }) => (
      <span className="text-muted-foreground truncate max-w-[200px] block">
        {getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: 'language',
    header: 'Langue',
    cell: ({ getValue }) => (
      <span className="uppercase text-xs text-muted-foreground font-medium">
        {getValue() as string}
      </span>
    ),
    size: 80,
  },
  {
    accessorKey: 'active',
    header: 'Statut',
    cell: ({ getValue }) => {
      const active = getValue() as boolean
      return <BadgeCell value={active ? 'Actif' : 'Archivé'} variant={active ? 'success' : 'neutral'} />
    },
    size: 90,
  },
  {
    accessorKey: 'created_at',
    header: 'Créé le',
    cell: ({ getValue }) => <DateCell value={getValue() as string} />,
    size: 110,
  },
  {
    accessorKey: 'last_login_at',
    header: 'Dernière connexion',
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} relative />,
    size: 140,
  },
]

// ── User Card (for grid view) ──────────────────────────────
function UserCard({ row: user, selected, onSelect, onClick }: CardRendererProps<UserRead>) {
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`
  const color = getAvatarColor(`${user.first_name}${user.last_name}`)

  return (
    <div
      className={cn(
        'group relative border rounded-lg p-4 transition-all cursor-pointer hover:shadow-md',
        selected
          ? 'border-primary bg-primary/[0.04] shadow-sm'
          : 'border-border bg-card hover:border-border-hover',
      )}
      onClick={onClick}
    >
      <button
        type="button"
        className={cn(
          'absolute top-3 right-3 text-muted-foreground transition-opacity',
          selected ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-100',
        )}
        onClick={(e) => { e.stopPropagation(); onSelect() }}
      >
        {selected ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>

      <div className="flex flex-col items-center text-center">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className={cn('h-14 w-14 flex items-center justify-center rounded-full font-semibold text-white text-lg', color)}>
            {initials}
          </div>
        )}
        <h4 className="mt-3 text-sm font-semibold text-foreground truncate w-full">
          {user.first_name} {user.last_name}
        </h4>
        <p className="text-xs text-muted-foreground truncate w-full mt-0.5">{user.email}</p>
      </div>

      <div className="flex items-center justify-center gap-2 mt-3">
        <span className={cn('gl-badge', user.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
          {user.active ? 'Actif' : 'Archivé'}
        </span>
        <span className="text-xs text-muted-foreground uppercase font-medium">{user.language}</span>
      </div>

      <div className="mt-3 pt-3 border-t border-border/50 text-center">
        <span className="text-xs text-muted-foreground" title={user.last_login_at ? new Date(user.last_login_at).toLocaleString() : undefined}>
          <Clock size={10} className="inline mr-1" />
          {user.last_login_at ? relativeTime(user.last_login_at) : 'Jamais connecté'}
        </span>
      </div>
    </div>
  )
}

// ── Create User Panel ──────────────────────────────────────
function CreateUserPanel() {
  const { t } = useTranslation()
  const createUser = useCreateUser()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const [form, setForm] = useState<UserCreate>({
    email: '', first_name: '', last_name: '', password: '', language: 'fr',
  })
  const [sendInvite, setSendInvite] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createUser.mutateAsync(form)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('users.create')}
      subtitle={t('users.title')}
      icon={<Users size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createUser.isPending}
            onClick={() => (document.getElementById('create-user-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createUser.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-user-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <FormSection title={t('common.details')}>
          <FormGrid>
            <DynamicPanelField label={t('users.first_name')} required>
              <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} placeholder="Jean" />
            </DynamicPanelField>
            <DynamicPanelField label={t('users.last_name')} required>
              <input type="text" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} placeholder="Dupont" />
            </DynamicPanelField>
          </FormGrid>
          <DynamicPanelField label="Email" required>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={panelInputClass} placeholder="jean.dupont@perenco.com" />
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('settings.language')}>
          <TagSelector options={LANGUAGE_OPTIONS} value={form.language || 'fr'} onChange={(v) => setForm({ ...form, language: v })} />
        </FormSection>

        <FormSection title="Invitation" collapsible storageKey="panel.user.sections" id="user-invitation">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
            <div>
              <span className="text-sm text-foreground group-hover:text-primary transition-colors">Envoyer un email d'invitation</span>
              <p className="text-xs text-muted-foreground mt-0.5">L'utilisateur recevra un lien pour définir son mot de passe.</p>
            </div>
          </label>
        </FormSection>

        <FormSection title="Authentification" collapsible defaultExpanded={false} storageKey="panel.user.sections" id="user-auth">
          <DynamicPanelField label={t('auth.password')}>
            <input type="password" minLength={8} value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} className={panelInputClass} placeholder="Min. 8 caractères (auto-généré si vide)" />
            <p className="text-xs text-muted-foreground mt-1">Laissez vide pour générer automatiquement un mot de passe temporaire.</p>
          </DynamicPanelField>
        </FormSection>

        <FormSection title="Accès" collapsible defaultExpanded={false} storageKey="panel.user.sections" id="user-access">
          <p className="text-xs text-muted-foreground">Les rôles et groupes pourront être configurés après la création de l'utilisateur.</p>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}

// ── User Detail Panel (with inline editing) ────────────────
function UserDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data: user } = useUser(id)
  const updateUser = useUpdateUser()

  const handleInlineSave = useCallback((field: string, value: string) => {
    updateUser.mutate({ id, payload: { [field]: value } })
  }, [id, updateUser])

  const handleToggleActive = useCallback(() => {
    if (!user) return
    updateUser.mutate({ id, payload: { active: !user.active } })
  }, [id, user, updateUser])

  if (!user) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Users size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={`${user.first_name} ${user.last_name}`}
      subtitle={user.email}
      icon={
        user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <div className={cn('h-7 w-7 flex items-center justify-center rounded-full font-semibold text-white text-[10px]', getAvatarColor(`${user.first_name}${user.last_name}`))}>
            {`${user.first_name[0] || ''}${user.last_name[0] || ''}`}
          </div>
        )
      }
      actions={
        <>
          <PanelActionButton
            variant={user.active ? 'danger' : 'primary'}
            onClick={handleToggleActive}
            disabled={updateUser.isPending}
          >
            {user.active ? (
              <><UserX size={12} className="mr-1" /> Désactiver</>
            ) : (
              <><UserCheck size={12} className="mr-1" /> Activer</>
            )}
          </PanelActionButton>
        </>
      }
    >
      <div className="p-4 space-y-5">
        {/* Profile header */}
        <div className="flex items-center gap-4 pb-4 border-b border-border/50">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover shrink-0" />
          ) : (
            <div className={cn('h-14 w-14 flex items-center justify-center rounded-full font-semibold text-white text-lg shrink-0', getAvatarColor(`${user.first_name}${user.last_name}`))}>
              {`${user.first_name[0] || ''}${user.last_name[0] || ''}`}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground truncate">{user.first_name} {user.last_name}</h3>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={cn('gl-badge', user.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                {user.active ? 'Actif' : 'Archivé'}
              </span>
              <span className="text-xs text-muted-foreground uppercase font-medium">{user.language}</span>
            </div>
          </div>
        </div>

        {/* Editable fields */}
        <FormSection title={t('common.details')}>
          <InlineEditableRow label={t('users.first_name')} value={user.first_name} onSave={(v) => handleInlineSave('first_name', v)} />
          <InlineEditableRow label={t('users.last_name')} value={user.last_name} onSave={(v) => handleInlineSave('last_name', v)} />
          <InlineEditableRow label="Email" value={user.email} onSave={(v) => handleInlineSave('email', v)} type="email" />
          <InlineEditableTags label={t('settings.language')} value={user.language} options={LANGUAGE_OPTIONS} onSave={(v) => handleInlineSave('language', v)} />
        </FormSection>

        {/* Timestamps */}
        <SectionHeader>Activité</SectionHeader>
        <div className="space-y-0">
          <ReadOnlyRow
            label="Dernière connexion"
            value={
              <span className="flex items-center gap-1.5 text-sm">
                <Clock size={12} className="text-muted-foreground" />
                {user.last_login_at ? (
                  <span title={new Date(user.last_login_at).toLocaleString()}>{relativeTime(user.last_login_at)}</span>
                ) : '—'}
              </span>
            }
          />
          <ReadOnlyRow
            label="Créé le"
            value={
              <span className="flex items-center gap-1.5 text-sm">
                <Calendar size={12} className="text-muted-foreground" />
                {user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              </span>
            }
          />
        </div>
      </div>
    </DynamicPanelShell>
  )
}

// ── Main Page ──────────────────────────────────────────────
export function UsersPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [statusFilterValue, setStatusFilterValue] = useState<string | undefined>(undefined)

  const search = useUIStore((s) => s.globalSearch)
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  const { data, isLoading } = useUsers({ page, page_size: pageSize, search: search || undefined })

  // Deep link: /users#create
  useEffect(() => {
    if (window.location.hash === '#create') {
      openDynamicPanel({ type: 'create', module: 'users' })
    }
  }, [openDynamicPanel])

  // Client-side status filter
  const filteredData = useMemo(() => {
    if (!data) return []
    if (!statusFilterValue || statusFilterValue === 'all') return data.items
    if (statusFilterValue === 'active') return data.items.filter((u) => u.active)
    if (statusFilterValue === 'archived') return data.items.filter((u) => !u.active)
    return data.items
  }, [data, statusFilterValue])

  // Set navigation items for the dynamic panel
  useEffect(() => {
    if (filteredData.length > 0) {
      setNavItems(filteredData.map((u) => u.id))
    }
    return () => setNavItems([])
  }, [filteredData, setNavItems])

  // Batch actions
  const batchActions: DataTableBatchAction<UserRead>[] = useMemo(() => [
    {
      id: 'deactivate',
      label: 'Désactiver',
      icon: <UserX size={12} className="mr-1" />,
      variant: 'danger',
      onAction: (rows) => {
        console.log('Batch deactivate', rows.map((r) => r.id))
      },
    },
  ], [])

  // Update filter definitions with counts
  const filterDefs: DataTableFilterDef[] = useMemo(() => {
    const activeCount = data?.items.filter((u) => u.active).length ?? 0
    const archivedCount = data?.items.filter((u) => !u.active).length ?? 0
    return [{
      id: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Tous', count: data?.total },
        { value: 'active', label: 'Actifs', count: activeCount },
        { value: 'archived', label: 'Archivés', count: archivedCount },
      ],
    }]
  }, [data])

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'users'

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={Users} title={t('users.title')} subtitle={t('users.subtitle')}>
            <ToolbarButton
              icon={Plus}
              label={t('users.create')}
              variant="primary"
              onClick={() => openDynamicPanel({ type: 'create', module: 'users' })}
            />
          </PanelHeader>

          <DataTable<UserRead>
            columns={userColumns}
            data={filteredData}
            isLoading={isLoading}
            getRowId={(row) => row.id}
            storageKey="users"

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
            defaultHiddenColumns={['language']}

            selectable
            batchActions={batchActions}

            viewModes={['table', 'grid']}
            defaultViewMode="table"
            cardRenderer={(props) => <UserCard {...props} />}

            importExport={{
              exportFormats: ['csv', 'xlsx', 'pdf'],
              filenamePrefix: 'utilisateurs',
              exportHeaders: {
                name: 'Nom',
                email: 'Email',
                language: 'Langue',
                active: 'Statut',
                created_at: 'Créé le',
                last_login_at: 'Dernière connexion',
              },
            }}

            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'users', id: row.id })}

            columnResizing
            columnPinning
            defaultPinnedColumns={{ left: ['name'] }}

            emptyIcon={Users}
            emptyTitle={t('common.no_results')}
          />
        </div>
      )}

      {dynamicPanel?.module === 'users' && dynamicPanel.type === 'create' && <CreateUserPanel />}
      {dynamicPanel?.module === 'users' && dynamicPanel.type === 'detail' && <UserDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

// ── Module-level renderer registration ─────────────────────
registerPanelRenderer('users', (view) => {
  if (view.type === 'create') return <CreateUserPanel />
  if (view.type === 'detail' && 'id' in view) return <UserDetailPanel id={view.id} />
  return null
})
