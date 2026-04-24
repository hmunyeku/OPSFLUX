/**
 * Users / Comptes page — powered by DataTable universal component.
 *
 * Features:
 * - Table & Grid views via DataTable viewModes
 * - Sorting, filtering, pagination, column visibility
 * - Row selection with batch actions
 * - Avatar cells
 * - CSV export
 * - Rich create & detail panels
 */
import { useState, useMemo, useEffect } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { useTranslation } from 'react-i18next'
import {
  Users, Plus, UserCheck, UserX, Clock, CheckSquare, Square,
  Shield, ShieldCheck, KeyRound, Building2, Unlock, LayoutDashboard,
} from 'lucide-react'
import {
  DynamicPanelShell,
} from '@/components/layout/DynamicPanel'
import { cn } from '@/lib/utils'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { PanelHeader, ToolbarButton } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import {
  useUsers, useUpdateUser, useAssignUserToEntity, useSendPasswordReset,
} from '@/hooks/useUsers'
import { useAllEntities } from '@/hooks/useEntities'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { usePageSize } from '@/hooks/usePageSize'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { RolesTab, GroupsTab, GroupDetailPanel, RoleDetailPanel, CreateGroupForm } from '@/pages/settings/tabs/RbacAdminTab'
import { useGroups, useAddGroupMembers } from '@/hooks/useRbac'
import { useOpenDetailFromPath } from '@/hooks/useOpenDetailFromPath'
import { usePermission } from '@/hooks/usePermission'
import type { UserRead } from '@/types/api'
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
import { PageNavBar } from '@/components/ui/Tabs'
import { BatchAssignModal } from './BatchAssignModal'
import { CreateUserPanel } from './CreateUserPanel'
import { UserDetailPanel } from './UserDetailPanel'

// ── Auth type labels ─────────────────────────────────────
const AUTH_TYPE_LABELS: Record<string, string> = {
  email_password: 'Email / Mot de passe',
  sso: 'SSO',
  both: 'Email + SSO',
}

// ── Helper: display null-safe text ──────────────────────────
const TextCell = ({ value }: { value: string | null | undefined }) =>
  value ? <span className="text-foreground text-xs truncate block">{value}</span> : <span className="text-muted-foreground/40">—</span>

// ── Helper: display ISO country code with flag ──────────────
const FlagCell = ({ value }: { value: string | null | undefined }) => {
  if (!value) return <span className="text-muted-foreground/40">—</span>
  return <CountryFlag code={value} label={value.toUpperCase()} className="text-foreground text-xs" />
}

// ── Column definitions ─────────────────────────────────────
const getUserColumns = (t: (key: string) => string): ColumnDef<UserRead, unknown>[] => [
  // ── Always visible ──
  {
    accessorKey: 'name',
    header: t('users.columns.name'),
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
    header: t('users.columns.email'),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground truncate max-w-[200px] block">
        {getValue() as string}
      </span>
    ),
    meta: { filterType: 'text' as const, filterLabel: 'Email' },
  },
  {
    accessorKey: 'intranet_id',
    header: t('users.columns.intranet_id'),
    cell: ({ getValue }) => {
      const v = getValue() as string | null
      return v ? <span className="font-mono text-[10px] text-muted-foreground">{v}</span> : <span className="text-muted-foreground/40">—</span>
    },
    size: 110,
  },
  {
    accessorKey: 'auth_type',
    header: t('users.columns.auth'),
    cell: ({ getValue }) => {
      const v = getValue() as string
      return <span className="gl-badge gl-badge-neutral text-[10px]">{AUTH_TYPE_LABELS[v] ?? v}</span>
    },
    size: 120,
    meta: { filterType: 'select' as const, filterOptions: [{ value: 'email_password', label: 'Email / Mot de passe' }, { value: 'sso', label: 'SSO' }, { value: 'both', label: 'Email + SSO' }] },
  },
  {
    id: 'mfa',
    header: t('users.columns.mfa'),
    accessorFn: (row) => row.mfa_enabled,
    cell: ({ row }) => (
      row.original.mfa_enabled
        ? <span className="gl-badge gl-badge-success text-[10px]"><ShieldCheck size={9} className="mr-0.5" />Actif</span>
        : <span className="gl-badge gl-badge-neutral text-[10px]">{t('common.inactive')}</span>
    ),
    size: 80,
  },
  {
    accessorKey: 'language',
    header: t('users.columns.language'),
    cell: ({ getValue }) => (
      <span className="uppercase text-xs text-muted-foreground font-medium">
        {getValue() as string}
      </span>
    ),
    size: 80,
    meta: { filterType: 'select' as const, filterOptions: [{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }] },
  },
  {
    accessorKey: 'active',
    header: t('users.columns.status'),
    cell: ({ row }) => {
      const u = row.original
      if (u.locked_until && new Date(u.locked_until) > new Date()) {
        return <BadgeCell value="Verrouillé" variant="warning" />
      }
      if (u.account_expires_at && new Date(u.account_expires_at) < new Date()) {
        return <BadgeCell value="Expiré" variant="neutral" />
      }
      return <BadgeCell value={u.active ? 'Actif' : 'Archivé'} variant={u.active ? 'success' : 'neutral'} />
    },
    size: 100,
  },
  {
    accessorKey: 'user_type',
    header: t('users.columns.type'),
    cell: ({ getValue }) => {
      const v = getValue() as string
      return v === 'external'
        ? <BadgeCell value="Externe" variant="warning" />
        : <BadgeCell value="Interne" variant="info" />
    },
    size: 90,
  },
  {
    accessorKey: 'created_at',
    header: t('users.columns.created_at'),
    cell: ({ getValue }) => <DateCell value={getValue() as string} />,
    size: 110,
  },
  {
    accessorKey: 'last_login_at',
    header: t('users.columns.last_login'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} relative />,
    size: 140,
  },
  // ── HR Identity (hidden by default) ──
  {
    accessorKey: 'passport_name',
    header: t('users.columns.passport_name'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 150,
  },
  {
    accessorKey: 'gender',
    header: t('users.columns.gender'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 70,
    meta: { filterType: 'select' as const, filterOptions: [{ value: 'M', label: 'Masculin' }, { value: 'F', label: 'Féminin' }, { value: 'X', label: 'Autre' }] },
  },
  {
    accessorKey: 'nationality',
    header: t('users.columns.nationality'),
    cell: ({ getValue }) => <FlagCell value={getValue() as string | null} />,
    size: 120,
  },
  {
    accessorKey: 'birth_country',
    header: t('users.columns.birth_country'),
    cell: ({ getValue }) => <FlagCell value={getValue() as string | null} />,
    size: 140,
  },
  {
    accessorKey: 'birth_city',
    header: t('users.columns.birth_city'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 140,
  },
  {
    accessorKey: 'birth_date',
    header: t('users.columns.birth_date'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 130,
  },
  // ── Travel (hidden by default) ──
  {
    accessorKey: 'contractual_airport',
    header: t('users.columns.contractual_airport'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 150,
  },
  {
    accessorKey: 'nearest_airport',
    header: t('users.columns.nearest_airport'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 140,
  },
  {
    accessorKey: 'nearest_station',
    header: t('users.columns.nearest_station'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 140,
  },
  {
    accessorKey: 'loyalty_program',
    header: t('users.columns.loyalty_program'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 140,
  },
  // ── Health / Medical (hidden by default) ──
  {
    accessorKey: 'last_medical_check',
    header: t('users.columns.last_medical_check'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 130,
  },
  {
    accessorKey: 'last_international_medical_check',
    header: t('users.columns.last_international_medical_check'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 160,
  },
  {
    accessorKey: 'last_subsidiary_medical_check',
    header: t('users.columns.last_subsidiary_medical_check'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 140,
  },
  // ── Mensurations (hidden by default) ──
  {
    accessorKey: 'height',
    header: t('users.columns.height'),
    cell: ({ getValue }) => { const v = getValue() as number | null; return v ? <span className="text-xs tabular-nums">{v} cm</span> : <span className="text-muted-foreground/40">—</span> },
    size: 90,
  },
  {
    accessorKey: 'weight',
    header: t('users.columns.weight'),
    cell: ({ getValue }) => { const v = getValue() as number | null; return v ? <span className="text-xs tabular-nums">{v} kg</span> : <span className="text-muted-foreground/40">—</span> },
    size: 90,
  },
  {
    accessorKey: 'ppe_clothing_size',
    header: t('users.columns.clothing_size'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 120,
  },
  {
    accessorKey: 'ppe_shoe_size',
    header: t('users.columns.shoe_size'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 90,
  },
  // ── Misc / HR (hidden by default) ──
  {
    accessorKey: 'retirement_date',
    header: t('users.columns.retirement_date'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 120,
  },
  {
    accessorKey: 'vantage_number',
    header: t('users.columns.vantage_number'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 110,
  },
  {
    accessorKey: 'extension_number',
    header: t('users.columns.extension_number'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 100,
  },
  // ── Security (hidden by default) ──
  {
    accessorKey: 'last_login_ip',
    header: t('users.columns.last_ip'),
    cell: ({ getValue }) => { const v = getValue() as string | null; return v ? <span className="font-mono text-[10px] text-muted-foreground">{v}</span> : <span className="text-muted-foreground/40">—</span> },
    size: 120,
  },
  {
    accessorKey: 'failed_login_count',
    header: t('users.columns.failed_login_count'),
    cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-xs text-amber-500 font-semibold tabular-nums">{v}</span> : <span className="text-muted-foreground/40">0</span> },
    size: 120,
  },
  {
    accessorKey: 'password_changed_at',
    header: t('users.columns.password_changed'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} relative />,
    size: 150,
  },
  {
    accessorKey: 'account_expires_at',
    header: t('users.columns.account_expires'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 130,
  },
  {
    accessorKey: 'updated_at',
    header: t('users.columns.updated_at'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} relative />,
    size: 120,
  },
]

// Default hidden columns — all the extended HR/travel/health/security fields
const defaultHiddenUserColumns = [
  'passport_name', 'gender', 'nationality', 'birth_country', 'birth_city', 'birth_date',
  'contractual_airport', 'nearest_airport', 'nearest_station', 'loyalty_program',
  'last_medical_check', 'last_international_medical_check', 'last_subsidiary_medical_check',
  'height', 'weight', 'ppe_clothing_size', 'ppe_clothing_size_bottom', 'ppe_shoe_size',
  'retirement_date', 'vantage_number', 'extension_number',
  'last_login_ip', 'failed_login_count', 'password_changed_at', 'account_expires_at', 'updated_at',
]

// ── User Card (for grid view) ──────────────────────────────
function UserCard({ row: user, selected, onSelect, onClick }: CardRendererProps<UserRead>) {
  const initials = `${user.first_name?.charAt(0) ?? ''}${user.last_name?.charAt(0) ?? ''}`
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

      <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
        <span className={cn('gl-badge', user.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
          {user.active ? 'Actif' : 'Archivé'}
        </span>
        {user.mfa_enabled && (
          <span className="gl-badge gl-badge-info text-[10px]"><ShieldCheck size={9} className="mr-0.5" />MFA</span>
        )}
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

type AccountsTab = 'overview' | 'users' | 'groups' | 'roles'

export function UsersPage() {
  useOpenDetailFromPath({ matchers: [{ prefix: '/users/', module: 'users' }] })
  const { t } = useTranslation()
  const userColumns = useMemo(() => getUserColumns(t), [t])
  const [activeTab, setActiveTab] = useState<AccountsTab>('overview')
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [statusFilterValue, setStatusFilterValue] = useState<string | undefined>(undefined)
  const [userTypeFilter, setUserTypeFilter] = useState<string | undefined>(undefined)
  const [mfaFilter, setMfaFilter] = useState<string | undefined>(undefined)
  // Counter to trigger create in child Roles/Groups tabs
  const [createTrigger, setCreateTrigger] = useState(0)

  const search = useUIStore((s) => s.globalSearch)
  const setGlobalSearch = useUIStore((s) => s.setGlobalSearch)
  const debouncedSearch = useDebounce(search, 300)
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  // Reset pagination when search changes
  useEffect(() => { setPage(1) }, [debouncedSearch])

  // Server-side filters
  const activeFilter = statusFilterValue === 'active' ? true : statusFilterValue === 'archived' ? false : undefined
  const userTypeParam = userTypeFilter && userTypeFilter !== 'all' ? userTypeFilter : undefined
  const mfaParam = mfaFilter === 'enabled' ? true : mfaFilter === 'disabled' ? false : undefined
  const { data, isLoading } = useUsers({ page, page_size: pageSize, search: debouncedSearch || undefined, active: activeFilter, user_type: userTypeParam, mfa_enabled: mfaParam })

  // Deep link: /users#create
  useEffect(() => {
    if (window.location.hash === '#create') {
      openDynamicPanel({ type: 'create', module: 'users' })
    }
  }, [openDynamicPanel])

  const items = data?.items ?? []

  // Set navigation items for the dynamic panel
  useEffect(() => {
    if (items.length > 0) {
      setNavItems(items.map((u) => u.id))
    }
    return () => setNavItems([])
  }, [items, setNavItems])

  // Batch actions
  const updateUser = useUpdateUser()
  const batchPasswordReset = useSendPasswordReset()
  const confirm = useConfirm()
  const { hasPermission } = usePermission()
  const canManageUsers = hasPermission('core.users.manage')
  const canCreateUser = hasPermission('user.create') || canManageUsers
  const canManageRbac = hasPermission('core.rbac.manage')
  const canManageEntities = hasPermission('core.entity.update')
  const [batchGroupUserIds, setBatchGroupUserIds] = useState<string[] | null>(null)
  const [batchEntityUserIds, setBatchEntityUserIds] = useState<string[] | null>(null)
  const addGroupMembers = useAddGroupMembers()
  const assignToEntity = useAssignUserToEntity()
  const { data: allGroupsForPicker } = useGroups({ page: 1, page_size: 200 })
  const { data: allEntitiesForPicker } = useAllEntities({ page: 1, page_size: 200 })
  const batchActions: DataTableBatchAction<UserRead>[] = useMemo(() => {
    const actions: DataTableBatchAction<UserRead>[] = []
    if (canManageUsers) {
      actions.push(
        {
          id: 'reset-password',
          label: 'Réinitialiser le mot de passe',
          icon: KeyRound,
          onAction: async (rows) => {
            const ok = await confirm({
              title: `Réinitialiser le mot de passe de ${rows.length} utilisateur${rows.length > 1 ? 's' : ''} ?`,
              message: 'Un email de réinitialisation sera envoyé à chaque utilisateur sélectionné.',
              confirmLabel: 'Réinitialiser',
            })
            if (!ok) return
            await Promise.all(rows.map((r) => batchPasswordReset.mutateAsync(r.email)))
          },
        },
        {
          id: 'activate',
          label: 'Activer',
          icon: UserCheck,
          onAction: async (rows) => {
            const inactiveRows = rows.filter((r) => !r.active)
            if (inactiveRows.length === 0) return
            await Promise.all(
              inactiveRows.map((r) => updateUser.mutateAsync({ id: r.id, payload: { active: true } }))
            )
          },
        },
        {
          id: 'deactivate',
          label: 'Désactiver',
          icon: UserX,
          variant: 'danger' as const,
          onAction: async (rows) => {
            const activeRows = rows.filter((r) => r.active)
            if (activeRows.length === 0) return
            const ok = await confirm({
              title: `Désactiver ${activeRows.length} utilisateur${activeRows.length > 1 ? 's' : ''} ?`,
              message: 'Les utilisateurs sélectionnés seront archivés et ne pourront plus se connecter.',
              confirmLabel: 'Désactiver',
              variant: 'danger',
            })
            if (!ok) return
            await Promise.all(
              activeRows.map((r) => updateUser.mutateAsync({ id: r.id, payload: { active: false } }))
            )
          },
        },
        {
          id: 'unlock',
          label: 'Déverrouiller',
          icon: Unlock,
          onAction: async (rows) => {
            const locked = rows.filter((r) => r.failed_login_count > 0 || (r.locked_until && new Date(r.locked_until) > new Date()))
            if (locked.length === 0) return
            await Promise.all(
              locked.map((r) => updateUser.mutateAsync({ id: r.id, payload: { failed_login_count: 0, locked_until: null } }))
            )
          },
        },
        {
          id: 'set-user-type',
          label: 'Changer le type',
          icon: Shield,
          onAction: async (rows) => {
            const ok = await confirm({
              title: `Changer le type de ${rows.length} utilisateur${rows.length > 1 ? 's' : ''} ?`,
              message: 'Interne = accès entité, Externe = accès limité aux entreprises liées.',
              confirmLabel: 'Interne',
              cancelLabel: 'Externe',
            })
            const newType = ok ? 'internal' : 'external'
            await Promise.all(rows.map((r) => updateUser.mutateAsync({ id: r.id, payload: { user_type: newType } })))
          },
        },
      )
    }
    if (canManageRbac) {
      actions.push({
        id: 'assign-group',
        label: 'Affecter à un groupe',
        icon: Users,
        onAction: (rows) => {
          setBatchGroupUserIds(rows.map((r) => r.id))
        },
      })
    }
    if (canManageEntities) {
      actions.push({
        id: 'assign-entity',
        label: 'Affecter à une entité',
        icon: Building2,
        onAction: (rows) => {
          setBatchEntityUserIds(rows.map((r) => r.id))
        },
      })
    }
    return actions
  }, [updateUser, batchPasswordReset, confirm, canManageUsers, canManageRbac, canManageEntities])

  const filterDefs: DataTableFilterDef[] = useMemo(() => [
    {
      id: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Tous', count: data?.total },
        { value: 'active', label: 'Actifs' },
        { value: 'archived', label: 'Archivés' },
      ],
    },
    {
      id: 'user_type',
      label: 'Type',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Tous' },
        { value: 'internal', label: 'Interne' },
        { value: 'external', label: 'Externe' },
      ],
    },
    {
      id: 'mfa',
      label: 'MFA',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Tous' },
        { value: 'enabled', label: 'Activé' },
        { value: 'disabled', label: 'Désactivé' },
      ],
    },
  ], [data])

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && (dynamicPanel.module === 'users' || dynamicPanel.module === 'groups' || dynamicPanel.module === 'roles')

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader
            icon={Users}
            title={t('nav.accounts', 'Comptes')}
            subtitle={
              activeTab === 'overview' ? t('users.overview_subtitle')
              : activeTab === 'users' ? t('users.subtitle')
              : activeTab === 'groups' ? t('users.groups_subtitle')
              : t('users.roles_subtitle')
            }
          >
            {activeTab === 'users' && canCreateUser && (
              <ToolbarButton
                icon={Plus}
                label={t('users.create')}
                variant="primary"
                onClick={() => openDynamicPanel({ type: 'create', module: 'users' })}
              />
            )}
            {activeTab === 'groups' && (
              <ToolbarButton
                icon={Plus}
                label={t('users.new_group')}
                variant="primary"
                onClick={() => setCreateTrigger((c) => c + 1)}
              />
            )}
            {activeTab === 'roles' && (
              <ToolbarButton
                icon={Plus}
                label={t('users.new_role')}
                variant="primary"
                onClick={() => setCreateTrigger((c) => c + 1)}
              />
            )}
          </PanelHeader>

          {/* Tab bar */}
          <PageNavBar
            items={[
              { id: 'overview' as const, label: t('common.tab_overview'), icon: LayoutDashboard },
              { id: 'users' as const, label: t('users.title'), icon: Users },
              { id: 'groups' as const, label: t('users.groups'), icon: KeyRound },
              { id: 'roles' as const, label: t('users.roles'), icon: Shield },
            ]}
            activeId={activeTab}
            onTabChange={setActiveTab}
          />

          <div className="flex-1 min-h-0">
          {activeTab === 'overview' ? (
              <ModuleDashboard module="users" />
          ) : activeTab === 'groups' ? (
              <GroupsTab
                externalSearch={search || ''}
                createTrigger={createTrigger}
                onOpenPanel={openDynamicPanel as (view: { type: string; module: string; id?: string }) => void}
              />
          ) : activeTab === 'roles' ? (
              <RolesTab
                externalSearch={search || ''}
                createTrigger={createTrigger}
                onOpenPanel={openDynamicPanel as (view: { type: string; module: string; id?: string }) => void}
              />
          ) : (
          <>

          <DataTable<UserRead>
            columns={userColumns}
            data={items}
            isLoading={isLoading}
            getRowId={(row) => row.id}
            storageKey="users"

            searchValue={search || ''}
            onSearchChange={(v) => { setGlobalSearch(v); setPage(1) }}

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
            activeFilters={{ status: statusFilterValue, user_type: userTypeFilter, mfa: mfaFilter }}
            onFilterChange={(id, value) => {
              if (id === 'status') { setStatusFilterValue(value as string | undefined); setPage(1) }
              if (id === 'user_type') { setUserTypeFilter(value as string | undefined); setPage(1) }
              if (id === 'mfa') { setMfaFilter(value as string | undefined); setPage(1) }
            }}
            autoColumnFilters

            columnVisibility
            defaultHiddenColumns={defaultHiddenUserColumns}

            selectable
            batchActions={batchActions}

            viewModes={['table', 'grid']}
            defaultViewMode="table"
            cardRenderer={(props) => <UserCard {...props} />}

            importExport={{
              exportFormats: ['csv', 'xlsx', 'pdf'],
              advancedExport: true,
              filenamePrefix: 'utilisateurs',
              importWizardTarget: 'user',
              exportHeaders: {
                name: 'Nom',
                email: 'Email',
                intranet_id: 'ID Intranet',
                auth_type: 'Authentification',
                mfa: 'MFA',
                language: 'Langue',
                active: 'Statut',
                user_type: 'Type (Interne/Externe)',
                created_at: 'Créé le',
                last_login_at: 'Dernière connexion',
                passport_name: 'Nom passeport',
                gender: 'Genre',
                nationality: 'Nationalité',
                birth_country: 'Pays de naissance',
                birth_city: 'Ville de naissance',
                birth_date: 'Date de naissance',
                contractual_airport: 'Aéroport contractuel',
                nearest_airport: 'Aéroport proche',
                nearest_station: 'Gare la plus proche',
                loyalty_program: 'Programme fidélité',
                last_medical_check: 'Visite médicale',
                last_international_medical_check: 'Visite méd. internationale',
                last_subsidiary_medical_check: 'Visite méd. filiale',
                height: 'Taille (cm)',
                weight: 'Poids (kg)',
                ppe_clothing_size: 'Taille vêtement haut',
                ppe_clothing_size_bottom: 'Taille vêtement bas',
                ppe_shoe_size: 'Pointure',
                retirement_date: 'Date retraite',
                vantage_number: 'N° Vantage',
                extension_number: 'N° Poste',
                last_login_ip: 'Dernière IP',
                failed_login_count: 'Échecs connexion',
                password_changed_at: 'Mot de passe modifié',
                account_expires_at: 'Expiration compte',
                updated_at: 'Modifié le',
              },
              importTemplate: {
                filename: 'modele_utilisateurs',
                includeExamples: true,
                columns: [
                  { key: 'email', label: 'Email', required: true, example: 'john.doe@company.com' },
                  { key: 'first_name', label: 'Prénom', required: true, example: 'John' },
                  { key: 'last_name', label: 'Nom', required: true, example: 'DOE' },
                  { key: 'password', label: 'Mot de passe', example: 'MotDePasse@2026!' },
                  { key: 'intranet_id', label: 'ID Intranet', example: 'JD1234' },
                  { key: 'language', label: 'Langue (fr/en)', example: 'fr' },
                  { key: 'passport_name', label: 'Nom passeport', example: 'DOE John' },
                  { key: 'gender', label: 'Genre (M/F/X)', example: 'M' },
                  { key: 'nationality', label: 'Nationalité', example: 'Française' },
                  { key: 'birth_country', label: 'Pays de naissance', example: 'France' },
                  { key: 'birth_city', label: 'Ville de naissance', example: 'Paris' },
                  { key: 'birth_date', label: 'Date de naissance (YYYY-MM-DD)', example: '1985-06-15' },
                  { key: 'contractual_airport', label: 'Aéroport contractuel', example: 'DLA' },
                  { key: 'nearest_airport', label: 'Aéroport proche', example: 'CDG' },
                  { key: 'nearest_station', label: 'Gare la plus proche', example: 'Gare du Nord' },
                  { key: 'loyalty_program', label: 'Programme fidélité', example: 'AF-123456' },
                  { key: 'height', label: 'Taille (cm)', example: '178' },
                  { key: 'weight', label: 'Poids (kg)', example: '75' },
                  { key: 'ppe_clothing_size', label: 'Taille vêtement haut', example: 'L' },
                  { key: 'ppe_clothing_size_bottom', label: 'Taille vêtement bas', example: 'M' },
                  { key: 'ppe_shoe_size', label: 'Pointure', example: '43' },
                  { key: 'retirement_date', label: 'Date retraite (YYYY-MM-DD)', example: '2045-12-31' },
                  { key: 'vantage_number', label: 'N° Vantage', example: 'V-12345' },
                  { key: 'extension_number', label: 'N° Poste', example: '4567' },
                ],
              },
            }}

            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'users', id: row.id })}

            columnResizing
            columnPinning
            defaultPinnedColumns={{ left: ['name'] }}

            emptyIcon={Users}
            emptyTitle={t('common.no_results')}
          />
          </>
          )}
          </div>
        </div>
      )}

      {dynamicPanel?.module === 'users' && dynamicPanel.type === 'create' && <CreateUserPanel />}
      {dynamicPanel?.module === 'users' && dynamicPanel.type === 'detail' && <UserDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'groups' && dynamicPanel.type === 'create' && <GroupCreatePanelWrapper />}
      {dynamicPanel?.module === 'groups' && dynamicPanel.type === 'detail' && <GroupDetailPanelWrapper id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'roles' && dynamicPanel.type === 'detail' && <RoleDetailPanelWrapper code={dynamicPanel.id} />}

      {/* Batch group assignment modal */}
      {batchGroupUserIds && (
        <BatchAssignModal
          title="Affecter à un groupe"
          subtitle={`${batchGroupUserIds.length} utilisateur${batchGroupUserIds.length > 1 ? 's' : ''} sélectionné${batchGroupUserIds.length > 1 ? 's' : ''}`}
          searchPlaceholder="Rechercher un groupe..."
          items={(allGroupsForPicker?.items ?? []).map((g) => ({
            id: g.id,
            label: g.name,
            sublabel: g.role_names.join(', ') || g.role_codes.join(', ') || 'Aucun rôle',
            meta: `${g.member_count} membre${g.member_count !== 1 ? 's' : ''}`,
            badge: g.entity_name || undefined,
            icon: Users,
            iconClassName: 'text-violet-500',
          }))}
          isPending={addGroupMembers.isPending}
          onSelect={(groupId: string) => {
            addGroupMembers.mutate(
              { groupId, userIds: batchGroupUserIds },
              { onSuccess: () => setBatchGroupUserIds(null) },
            )
          }}
          onClose={() => setBatchGroupUserIds(null)}
        />
      )}

      {/* Batch entity assignment modal */}
      {batchEntityUserIds && (
        <BatchAssignModal
          title="Affecter à une entité"
          subtitle={`${batchEntityUserIds.length} utilisateur${batchEntityUserIds.length > 1 ? 's' : ''} sélectionné${batchEntityUserIds.length > 1 ? 's' : ''}`}
          searchPlaceholder="Rechercher une entité..."
          items={(allEntitiesForPicker?.items ?? []).filter((e) => e.active).map((e) => ({
            id: e.id,
            label: e.name,
            sublabel: e.code,
            meta: `${e.user_count} utilisateur${e.user_count !== 1 ? 's' : ''}`,
            badge: e.country || undefined,
            icon: Building2,
            iconClassName: 'text-blue-500',
          }))}
          isPending={assignToEntity.isPending}
          onSelect={async (entityId: string) => {
            await Promise.all(batchEntityUserIds.map((uid) => assignToEntity.mutateAsync({ userId: uid, entityId })))
            setBatchEntityUserIds(null)
          }}
          onClose={() => setBatchEntityUserIds(null)}
        />
      )}
    </div>
  )
}

// ── Group DynamicPanel wrappers ───────────────────────────────
function GroupCreatePanelWrapper() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  return (
    <DynamicPanelShell title="Nouveau groupe" onClose={closeDynamicPanel}>
      <CreateGroupForm onClose={closeDynamicPanel} />
    </DynamicPanelShell>
  )
}

function GroupDetailPanelWrapper({ id }: { id: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  return <GroupDetailPanel groupId={id} onClose={closeDynamicPanel} inline={false} />
}

function RoleDetailPanelWrapper({ code }: { code: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  return <RoleDetailPanel code={code} onClose={closeDynamicPanel} inline={false} />
}

// ── Module-level renderer registration ─────────────────────
registerPanelRenderer('users', (view) => {
  if (view.type === 'create') return <CreateUserPanel />
  if (view.type === 'detail' && 'id' in view) return <UserDetailPanel id={view.id} />
  return null
})

registerPanelRenderer('groups', (view) => {
  if (view.type === 'create') return <GroupCreatePanelWrapper />
  if (view.type === 'detail' && 'id' in view) return <GroupDetailPanelWrapper id={view.id} />
  return null
})

registerPanelRenderer('roles', (view) => {
  if (view.type === 'detail' && 'id' in view) return <RoleDetailPanelWrapper code={view.id} />
  return null
})
