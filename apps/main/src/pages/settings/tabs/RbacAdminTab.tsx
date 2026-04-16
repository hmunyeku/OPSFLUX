/**
 * RBAC Admin tab — professional role/group/permission management.
 *
 * Three sub-tabs:
 * 1. Rôles — DataTable with module filter + InlineDetailPanel detail
 * 2. Groupes — paginated table with InlineDetailPanel detail
 * 3. Permissions — read-only matrix with rich tooltips
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ShieldCheck, Users, Lock, Loader2, Search,
  ChevronRight, ChevronDown, Check, X, UserPlus, Trash2,
  FolderTree, User as UserIcon, Shield, UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable, BadgeCell } from '@/components/ui/DataTable'
import type { ExportFormat } from '@/components/ui/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useToast } from '@/components/ui/Toast'
import { Tooltip } from '@/components/ui/Tooltip'
import { DynamicPanelShell, FormSection, InlineEditableRow, DetailFieldGrid, ReadOnlyRow, DangerConfirmButton } from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import {
  useRoles,
  useRole,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useSetRolePermissions,
  usePermissions,
  useModules,
  useGroups,
  useGroup,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useAddGroupMembers,
  useRemoveGroupMember,
  useSetGroupPermissionOverrides,
  usePermissionMode,
  useSetPermissionMode,
} from '@/hooks/useRbac'
import { useUsers } from '@/hooks/useUsers'
import { usePageSize } from '@/hooks/usePageSize'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import type { RoleRead, PermissionRead, GroupRead, PermissionOverride } from '@/services/rbacService'

// ══════════════════════════════════════════════════════════════════════════════
// MAIN TAB — 3 sub-tabs
// ══════════════════════════════════════════════════════════════════════════════

type RbacSubTab = 'roles' | 'groups' | 'permissions'

const SUB_TABS: { key: RbacSubTab; label: string; icon: React.ElementType }[] = [
  { key: 'roles', label: 'Rôles', icon: ShieldCheck },
  { key: 'groups', label: 'Groupes', icon: Users },
  { key: 'permissions', label: 'Permissions', icon: Lock },
]

/**
 * InlineDetailPanel — alias to DynamicPanelShell in inline mode.
 * Provides backwards-compatible interface for existing usages in this file.
 */
function InlineDetailPanel({
  title,
  subtitle,
  icon,
  actions,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <DynamicPanelShell
      inline
      title={title}
      subtitle={subtitle}
      icon={icon}
      actions={actions}
      onClose={onClose}
    >
      <div className="px-4 py-3 space-y-1">
        {children}
      </div>
    </DynamicPanelShell>
  )
}

export function RbacAdminTab() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<RbacSubTab>('roles')
  const { data: permMode } = usePermissionMode()
  const setModeMut = useSetPermissionMode()
  const { toast } = useToast()

  const currentMode = permMode?.mode ?? 'restrictive'

  const toggleMode = () => {
    const newMode = currentMode === 'additive' ? 'restrictive' : 'additive'
    setModeMut.mutate(newMode, {
      onSuccess: () => toast({
        title: newMode === 'additive' ? t('settings.toast.rbac.mode_additive') : t('settings.toast.rbac.mode_restrictive'),
        variant: 'success',
      }),
    })
  }

  return (
    <div className="space-y-0">
      {/* Sub-tab bar + permission mode toggle */}
      <div className="flex items-center gap-0 border-b border-border mb-4">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors -mb-px',
              activeTab === key
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}

        {/* Permission mode toggle */}
        <div className="ml-auto flex items-center gap-2 pb-1">
          <Tooltip content={
            currentMode === 'additive'
              ? 'Mode additif : les permissions se cumulent, pas de révocation possible'
              : 'Mode restrictif : les couches supérieures peuvent révoquer les couches inférieures'
          }>
            <button
              onClick={toggleMode}
              disabled={setModeMut.isPending}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border',
                currentMode === 'additive'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30'
                  : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30',
              )}
            >
              {setModeMut.isPending ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Shield size={10} />
              )}
              {currentMode === 'additive' ? 'Additif' : 'Restrictif'}
            </button>
          </Tooltip>
        </div>
      </div>

      {activeTab === 'roles' && <RolesTab />}
      {activeTab === 'groups' && <GroupsTab />}
      {activeTab === 'permissions' && <PermissionsTab />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ROLES TAB — DataTable with module filter
// ══════════════════════════════════════════════════════════════════════════════

export function RolesTab({ externalSearch, createTrigger, onOpenPanel }: {
  externalSearch?: string
  createTrigger?: number
  onOpenPanel?: (view: { type: string; module: string; id?: string }) => void
} = {}) {
  const { t } = useTranslation()
  const [internalSearch, setInternalSearch] = useState('')
  const search = externalSearch ?? internalSearch
  const [filterModule, setFilterModule] = useState<string | undefined>(undefined)
  const { data: roles, isLoading } = useRoles({ search: search || undefined, module: filterModule })
  const { data: modules } = useModules()
  const { pageSize: rolePSize, setPageSize: setRolePSize } = usePageSize()
  const [rolePage, setRolePage] = useState(1)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const isControlled = externalSearch !== undefined

  // Reset page when search/filter changes
  useEffect(() => { setRolePage(1) }, [search, filterModule])

  // Client-side pagination for roles
  const allRoles = roles ?? []
  const totalRoles = allRoles.length
  const pagesRoles = Math.max(1, Math.ceil(totalRoles / rolePSize))
  const paginatedRoles = useMemo(() => {
    const start = (rolePage - 1) * rolePSize
    return allRoles.slice(start, start + rolePSize)
  }, [allRoles, rolePage, rolePSize])

  // Open create form when parent triggers it
  useEffect(() => {
    if (createTrigger && createTrigger > 0) {
      if (onOpenPanel) {
        onOpenPanel({ type: 'create', module: 'roles' })
      } else {
        setShowCreate(true)
      }
    }
  }, [createTrigger, onOpenPanel])

  // Set navigation items for DynamicPanel prev/next
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  useEffect(() => {
    if (isControlled && allRoles.length > 0) {
      setNavItems(allRoles.map((r) => r.code))
    }
    return () => { if (isControlled) setNavItems([]) }
  }, [roles, isControlled, setNavItems])

  const roleColumns = useMemo<ColumnDef<RoleRead, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: t('settings.columns.rbac_roles.name'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <ShieldCheck size={13} className="text-muted-foreground shrink-0" />
          <span className="font-medium text-foreground truncate">{row.original.name}</span>
        </div>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'code',
      header: t('settings.columns.rbac_roles.code'),
      cell: ({ row }) => (
        <span className="font-mono text-[10px] text-muted-foreground">{row.original.code}</span>
      ),
      size: 120,
    },
    {
      accessorKey: 'module',
      header: t('settings.columns.rbac_roles.module'),
      cell: ({ row }) => row.original.module ? (
        <span className="gl-badge gl-badge-neutral text-[10px]">{row.original.module}</span>
      ) : (
        <span className="text-[10px] text-muted-foreground italic">Global</span>
      ),
      size: 120,
    },
    {
      accessorKey: 'description',
      header: t('settings.columns.rbac_roles.description'),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs truncate">{row.original.description || '—'}</span>
      ),
    },
    {
      accessorKey: 'permission_count',
      header: t('settings.columns.rbac_roles.permissions'),
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral text-[10px]">
          <Lock size={9} className="mr-0.5" />{row.original.permission_count}
        </span>
      ),
      size: 100,
    },
    {
      accessorKey: 'group_count',
      header: t('settings.columns.rbac_roles.groups'),
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral text-[10px]">
          <Users size={9} className="mr-0.5" />{row.original.group_count}
        </span>
      ),
      size: 90,
    },
    {
      accessorKey: 'user_count',
      header: t('settings.columns.rbac_roles.users'),
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral text-[10px]">
          <Users size={9} className="mr-0.5" />{row.original.user_count ?? 0}
        </span>
      ),
      size: 100,
    },
    {
      accessorKey: 'created_at',
      header: t('settings.columns.rbac_roles.created_at'),
      cell: ({ row }) => row.original.created_at ? (
        <span className="text-muted-foreground text-xs">{new Date(row.original.created_at).toLocaleDateString('fr-FR')}</span>
      ) : <span className="text-muted-foreground/50">—</span>,
      size: 100,
    },
    {
      accessorKey: 'updated_at',
      header: t('settings.columns.rbac_roles.updated_at'),
      cell: ({ row }) => row.original.updated_at ? (
        <span className="text-muted-foreground text-xs">{new Date(row.original.updated_at).toLocaleDateString('fr-FR')}</span>
      ) : <span className="text-muted-foreground/50">—</span>,
      size: 100,
    },
  ], [t])

  const moduleFilterDefs = useMemo(() => {
    const moduleOptions = [
      { value: 'all', label: 'Tous' },
      ...(modules ?? []).map((m) => ({ value: m.module, label: m.module })),
    ]
    return [{
      id: 'module',
      label: 'Module',
      type: 'select' as const,
      options: moduleOptions,
    }]
  }, [modules])

  const handleFilterChange = useCallback((id: string, value: unknown) => {
    if (id === 'module') {
      setFilterModule(value === 'all' ? undefined : value as string)
      setRolePage(1)
    }
  }, [])

  const handleRowClick = useCallback((row: RoleRead) => {
    if (onOpenPanel) {
      onOpenPanel({ type: 'detail', module: 'roles', id: row.code })
    } else {
      setSelectedRole(selectedRole === row.code ? null : row.code)
    }
  }, [onOpenPanel, selectedRole])

  const dataTableProps = {
    columns: roleColumns,
    data: paginatedRoles,
    isLoading,
    getRowId: (row: RoleRead) => row.code,
    searchValue: search,
    searchPlaceholder: 'Filtrer les rôles...',
    onRowClick: handleRowClick,
    pagination: { page: rolePage, pageSize: rolePSize, total: totalRoles, pages: pagesRoles },
    onPaginationChange: (newPage: number, newSize: number) => { setRolePage(newPage); setRolePSize(newSize) },
    filters: moduleFilterDefs,
    activeFilters: { module: filterModule ?? 'all' },
    onFilterChange: handleFilterChange,
    sortable: true,
    columnVisibility: true,
    defaultHiddenColumns: ['description', 'created_at', 'updated_at'],
    selectable: true,
    columnResizing: true,
    columnPinning: true,
    defaultPinnedColumns: { left: ['name'] },
    importExport: {
      exportFormats: ['csv', 'xlsx'] as ExportFormat[],
      advancedExport: true,
      filenamePrefix: 'roles',
      exportHeaders: {
        name: 'Nom',
        code: 'Code',
        module: 'Module',
        description: 'Description',
        permission_count: 'Permissions',
        group_count: 'Groupes',
        user_count: 'Utilisateurs',
        created_at: 'Créé le',
        updated_at: 'Modifié le',
      },
    },
    emptyTitle: search ? 'Aucun rôle trouvé.' : 'Aucun rôle configuré.',
    emptyIcon: ShieldCheck,
    storageKey: 'rbac-roles',
  }

  // When controlled (inside UsersPage), render DataTable directly
  if (isControlled) {
    return (
      <>
        {showCreate && <CreateRoleForm onClose={() => setShowCreate(false)} />}
        <DataTable
          {...dataTableProps}
          onSearchChange={() => { /* search driven by topbar */ }}
        />
      </>
    )
  }

  return (
    <div className="flex gap-0 min-h-[500px]">
      <div className={cn('flex-1 min-w-0', selectedRole && 'max-w-[calc(100%-360px)]')}>
        {showCreate && <CreateRoleForm onClose={() => setShowCreate(false)} />}
        <DataTable
          {...dataTableProps}
          onSearchChange={(v) => setInternalSearch(v)}
        />
      </div>

      {/* Inline detail panel — only when NOT using DynamicPanel */}
      {!onOpenPanel && selectedRole && (
        <RoleDetailPanel code={selectedRole} onClose={() => setSelectedRole(null)} />
      )}
    </div>
  )
}

// ── Create Role Form ─────────────────────────────────────────

function CreateRoleForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createMut = useCreateRole()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [module, setModule] = useState('')

  const handleSubmit = () => {
    if (!code.trim() || !name.trim()) return
    createMut.mutate(
      {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || null,
        module: module.trim() || null,
      },
      {
        onSuccess: () => {
          toast({ title: t('settings.toast.rbac.role_created', { code }), variant: 'success' })
          onClose()
        },
        onError: (err: Error) => {
          toast({ title: t('settings.toast.error'), description: err.message, variant: 'error' })
        },
      },
    )
  }

  return (
    <div className="mb-4 p-3 border border-border rounded-lg bg-accent/20">
      <h4 className="text-xs font-semibold text-foreground mb-2">Nouveau rôle</h4>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Code</label>
          <input className="gl-form-input text-xs w-full font-mono" placeholder="CDS" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Nom</label>
          <input className="gl-form-input text-xs w-full" placeholder="Chef de Site" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Module</label>
          <input className="gl-form-input text-xs w-full" placeholder="paxlog" value={module} onChange={(e) => setModule(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Description</label>
          <input className="gl-form-input text-xs w-full" placeholder="Responsable opérationnel du site" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={handleSubmit} disabled={createMut.isPending || !code || !name} className="gl-button-sm gl-button-confirm text-[11px]">
          {createMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Créer
        </button>
        <button onClick={onClose} className="gl-button-sm gl-button-default text-[11px]">
          <X size={11} /> Annuler
        </button>
      </div>
    </div>
  )
}

// ── Role Detail Panel ────────────────────────────────────────

export function RoleDetailPanel({ code, onClose, inline = true }: { code: string; onClose: () => void; inline?: boolean }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: role, isLoading } = useRole(code)
  const { data: allPermissions } = usePermissions()
  const setPermsMut = useSetRolePermissions()
  const updateMut = useUpdateRole()
  const deleteRoleMut = useDeleteRole()
  const [permSearch, setPermSearch] = useState('')
  const [pendingPerms, setPendingPerms] = useState<Set<string> | null>(null)

  const currentPermCodes = useMemo(
    () => new Set((role?.permissions || []).map((p) => p.code)),
    [role?.permissions],
  )

  // Use pending perms if user is editing, otherwise use server state
  const activePerms = pendingPerms ?? currentPermCodes

  const togglePermission = useCallback((permCode: string) => {
    setPendingPerms((prev) => {
      const base = prev ?? new Set(currentPermCodes)
      const updated = new Set(base)
      if (updated.has(permCode)) updated.delete(permCode)
      else updated.add(permCode)
      return updated
    })
  }, [currentPermCodes])

  const toggleAllCodes = useCallback((codes: string[], granted: boolean) => {
    setPendingPerms((prev) => {
      const base = prev ?? new Set(currentPermCodes)
      const updated = new Set(base)
      for (const c of codes) {
        if (granted) updated.add(c)
        else updated.delete(c)
      }
      return updated
    })
  }, [currentPermCodes])

  const hasPendingChanges = pendingPerms !== null && (
    pendingPerms.size !== currentPermCodes.size ||
    [...pendingPerms].some((c) => !currentPermCodes.has(c))
  )

  const savePermissions = () => {
    if (!pendingPerms) return
    setPermsMut.mutate(
      { code, permissionCodes: Array.from(pendingPerms) },
      {
        onSuccess: () => {
          toast({ title: t('settings.toast.rbac.permissions_updated'), variant: 'success' })
          setPendingPerms(null)
        },
        onError: (err: Error) => {
          toast({ title: t('settings.toast.error'), description: err.message, variant: 'error' })
        },
      },
    )
  }

  // Group all permissions by module
  const groupedPerms = useMemo(() => {
    if (!allPermissions) return []
    const grouped: Record<string, PermissionRead[]> = {}
    for (const p of allPermissions) {
      const mod = p.module || 'core'
      if (!grouped[mod]) grouped[mod] = []
      grouped[mod].push(p)
    }
    return Object.entries(grouped)
      .filter(([mod, perms]) => {
        if (!permSearch) return true
        const q = permSearch.toLowerCase()
        return mod.toLowerCase().includes(q) || perms.some((p) => p.code.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q))
      })
      .sort(([a], [b]) => a.localeCompare(b))
  }, [allPermissions, permSearch])

  const [roleTab, setRoleTab] = useState<'fiche' | 'permissions'>('fiche')

  const permCount = activePerms.size

  if (isLoading) {
    return inline ? (
      <div className="w-[360px] shrink-0 border-l border-border flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    ) : (
      <DynamicPanelShell title="Chargement..." icon={<ShieldCheck size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  if (!role) return null

  const isProtected = role.code === 'SUPER_ADMIN'

  const handleDeleteRole = () => {
    deleteRoleMut.mutate(code, {
      onSuccess: () => {
        toast({ title: t('settings.toast.rbac.role_deleted'), variant: 'success' })
        onClose()
      },
      onError: (err: Error) => {
        toast({ title: t('settings.toast.error'), description: err.message, variant: 'error' })
      },
    })
  }

  const roleActions = !isProtected ? (
    <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleDeleteRole} confirmLabel="Supprimer ?">
      Supprimer
    </DangerConfirmButton>
  ) : undefined

  // ── Tab bar ──
  const tabBar = (
    <div className="flex items-center gap-0 border-b border-border mb-3 -mt-1">
      {([
        { key: 'fiche' as const, label: 'Fiche', icon: Users },
        { key: 'permissions' as const, label: 'Permissions', icon: Lock, badge: permCount },
      ]).map(({ key, label, icon: Icon, badge }) => (
        <button
          key={key}
          onClick={() => setRoleTab(key)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            roleTab === key
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon size={13} />
          {label}
          {badge !== undefined && (
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
              roleTab === key ? 'bg-primary/10 text-primary' : 'bg-accent text-muted-foreground',
            )}>
              {badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )

  // ── Fiche tab content ──
  const ficheContent = (
    <div className="grid grid-cols-1 @xl:grid-cols-[1fr_1fr] gap-4">
      {/* Left column: Info + Groups */}
      <div className="space-y-1 min-w-0">
        <FormSection title="Informations" defaultExpanded storageKey="rbac.role.info">
          <div className="space-y-1">
            {!isProtected ? (
              <>
                <InlineEditableRow label="Nom" value={role.name} onSave={(v) => updateMut.mutate({ code, payload: { name: v } })} />
                <InlineEditableRow label="Description" value={role.description || ''} onSave={(v) => updateMut.mutate({ code, payload: { description: v || null } })} />
              </>
            ) : (
              <DetailFieldGrid>
                <ReadOnlyRow label="Nom" value={role.name} />
                <ReadOnlyRow label="Description" value={role.description || '—'} />
              </DetailFieldGrid>
            )}
            <DetailFieldGrid>
              <ReadOnlyRow label="Code" value={<span className="font-mono text-foreground">{role.code}</span>} />
              <ReadOnlyRow label="Module" value={<span className="gl-badge gl-badge-neutral">{role.module || 'core'}</span>} />
              <ReadOnlyRow label="Permissions" value={`${permCount} permission(s)`} />
              <ReadOnlyRow label="Groupes" value={`${role.group_count ?? 0} groupe(s)`} />
              <ReadOnlyRow label="Utilisateurs" value={`${role.user_count ?? 0} utilisateur(s)`} />
            </DetailFieldGrid>
          </div>
        </FormSection>

        {/* Groups using this role */}
        {role.groups && role.groups.length > 0 && (
          <FormSection title={`Groupes (${role.groups.length})`} storageKey="rbac.role.groups">
            <div className="divide-y divide-border/50">
              {role.groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => useUIStore.getState().openDynamicPanel({ type: 'detail', module: 'groups', id: g.id })}
                  className="flex w-full items-center gap-2 py-2 text-xs text-left hover:bg-accent/50 rounded px-1.5 -mx-1.5 transition-colors cursor-pointer"
                >
                  <Users size={12} className="text-muted-foreground shrink-0" />
                  <span className="font-medium text-foreground truncate hover:text-primary transition-colors">{g.name}</span>
                  {g.asset_scope_name && (
                    <span className="gl-badge gl-badge-neutral text-[9px] shrink-0">{g.asset_scope_name}</span>
                  )}
                  <span className="text-muted-foreground ml-auto shrink-0">{g.member_count} mbr</span>
                  {!g.active && <span className="gl-badge gl-badge-neutral text-[9px]">Inactif</span>}
                  <ChevronRight size={10} className="text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </FormSection>
        )}
      </div>

      {/* Right column: Permission summary */}
      <div className="min-w-0">
        <FormSection title={`Permissions attribuées (${permCount})`} defaultExpanded storageKey="rbac.role.perm-summary">
          {isProtected && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1.5 rounded mb-2">
              <Lock size={11} />
              <span>SUPER_ADMIN dispose de toutes les permissions.</span>
            </div>
          )}
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {groupedPerms.filter(([, perms]) => perms.some((p) => activePerms.has(p.code))).map(([mod, perms]) => (
              <div key={mod}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{mod}</p>
                <div className="flex flex-wrap gap-1">
                  {perms.filter((p) => activePerms.has(p.code)).map((p) => (
                      <Tooltip key={p.code} content={`${p.name || p.code}\n${p.description || ''}`}>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent text-[10px] text-foreground font-mono">
                          {p.code}
                        </span>
                      </Tooltip>
                  ))}
                </div>
              </div>
            ))}
            {permCount === 0 && !isProtected && (
              <p className="text-xs text-muted-foreground italic">Aucune permission attribuée.</p>
            )}
          </div>
        </FormSection>
      </div>
    </div>
  )

  // ── Permissions tab content (matrix editor) ──
  const permissionsContent = (
    <div className="space-y-3">
      {isProtected && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
          <Lock size={12} />
          <span>SUPER_ADMIN dispose de toutes les permissions (non modifiable).</span>
        </div>
      )}
      {hasPendingChanges && (
        <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <span className="text-xs text-amber-600 dark:text-amber-400 flex-1">Modifications non sauvegardées</span>
          <button onClick={() => setPendingPerms(null)} className="gl-button-sm gl-button-default text-[11px]">Annuler</button>
          <button onClick={savePermissions} disabled={setPermsMut.isPending} className="gl-button-sm gl-button-confirm text-[11px]">
            {setPermsMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Sauvegarder
          </button>
        </div>
      )}
      {allPermissions && (
        <PermissionMatrix
          allPermissions={allPermissions}
          activePerms={activePerms}
          isProtected={isProtected}
          onToggle={togglePermission}
          onSetMany={toggleAllCodes}
          search={permSearch}
          onSearchChange={setPermSearch}
        />
      )}
    </div>
  )

  // ── Render ──
  const panelContent = (
    <>
      {tabBar}
      {roleTab === 'fiche' ? ficheContent : permissionsContent}
    </>
  )

  if (inline) {
    return (
      <InlineDetailPanel
        title={role.name}
        subtitle={role.code}
        icon={<ShieldCheck size={16} className="text-primary" />}
        onClose={onClose}
        actions={roleActions}
      >
        {panelContent}
      </InlineDetailPanel>
    )
  }

  return (
    <DynamicPanelShell
      title={role.name}
      subtitle={role.code}
      icon={<ShieldCheck size={14} className="text-primary" />}
      actions={roleActions}
    >
      <div className="px-4 py-3">
        {panelContent}
      </div>
    </DynamicPanelShell>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUPS TAB — Paginated table + InlineDetailPanel detail
// ══════════════════════════════════════════════════════════════════════════════

export function GroupsTab({ externalSearch, createTrigger, onOpenPanel }: {
  externalSearch?: string
  createTrigger?: number
  onOpenPanel?: (view: { type: string; module: string; id?: string }) => void
} = {}) {
  const { t } = useTranslation()
  const [internalSearch, setInternalSearch] = useState('')
  const search = externalSearch ?? internalSearch
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize: setPSize } = usePageSize()
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined)
  const [filterRoleCode, setFilterRoleCode] = useState<string | undefined>(undefined)
  const { data: rolesForFilter } = useRoles({})
  const { data: groupsData, isLoading } = useGroups({
    search: search || undefined,
    active: filterActive,
    role_code: filterRoleCode,
    page,
    page_size: pageSize,
  })
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const isControlled = externalSearch !== undefined

  // Open create form when parent triggers it
  useEffect(() => {
    if (createTrigger && createTrigger > 0) {
      if (onOpenPanel) {
        onOpenPanel({ type: 'create', module: 'groups' })
      } else {
        setShowCreate(true)
      }
    }
  }, [createTrigger, onOpenPanel])

  const groups = groupsData?.items ?? []
  const total = groupsData?.total ?? 0
  const pages = groupsData?.pages ?? 0

  // Set navigation items for DynamicPanel prev/next
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  useEffect(() => {
    if (isControlled && groups.length > 0) {
      setNavItems(groups.map((g) => g.id))
    }
    return () => { if (isControlled) setNavItems([]) }
  }, [groups, isControlled, setNavItems])

  const groupColumns = useMemo<ColumnDef<GroupRead, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: t('settings.columns.rbac_groups.name'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Users size={13} className="text-muted-foreground shrink-0" />
          <span className="font-medium text-foreground truncate">{row.original.name}</span>
        </div>
      ),
      enableHiding: false,
    },
    {
      id: 'role',
      header: t('settings.columns.rbac_groups.roles'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-0.5">
          {row.original.role_codes.map((code, i) => (
            <button
              key={code}
              onClick={(e) => {
                e.stopPropagation()
                useUIStore.getState().openDynamicPanel({ type: 'detail', module: 'roles', id: code })
              }}
              className="gl-badge gl-badge-info text-[10px] cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
            >
              {row.original.role_names[i] || code}
            </button>
          ))}
          {row.original.role_codes.length === 0 && <span className="text-muted-foreground/40">—</span>}
        </div>
      ),
    },
    {
      accessorKey: 'member_count',
      header: t('settings.columns.rbac_groups.members'),
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.member_count}</span>,
      size: 70,
    },
    {
      id: 'scope',
      header: t('settings.columns.rbac_groups.scope'),
      cell: ({ row }) => row.original.asset_scope_name ? (
        <span className="gl-badge gl-badge-neutral text-[10px]">{row.original.asset_scope_name}</span>
      ) : (
        <span className="text-[10px] text-muted-foreground italic">Global</span>
      ),
    },
    {
      accessorKey: 'entity_name',
      header: t('settings.columns.rbac_groups.entity'),
      cell: ({ row }) => row.original.entity_name ? (
        <CrossModuleLink module="entities" id={row.original.entity_id} label={row.original.entity_name} showIcon={false} className="text-xs" />
      ) : (
        <span className="text-muted-foreground/50 text-xs italic">—</span>
      ),
    },
    {
      accessorKey: 'active',
      header: t('settings.columns.rbac_groups.status'),
      cell: ({ getValue }) => {
        const active = getValue() as boolean
        return <BadgeCell value={active ? 'Actif' : 'Inactif'} variant={active ? 'success' : 'neutral'} />
      },
      size: 90,
    },
    {
      accessorKey: 'created_at',
      header: t('settings.columns.rbac_groups.created_at'),
      cell: ({ row }) => row.original.created_at ? (
        <span className="text-muted-foreground text-xs">{new Date(row.original.created_at).toLocaleDateString('fr-FR')}</span>
      ) : <span className="text-muted-foreground/50">—</span>,
      size: 100,
    },
    {
      accessorKey: 'updated_at',
      header: t('settings.columns.rbac_groups.updated_at'),
      cell: ({ row }) => row.original.updated_at ? (
        <span className="text-muted-foreground text-xs">{new Date(row.original.updated_at).toLocaleDateString('fr-FR')}</span>
      ) : <span className="text-muted-foreground/50">—</span>,
      size: 100,
    },
  ], [t])

  const groupFilterDefs = useMemo(() => [
    {
      id: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Tous', count: total },
        { value: 'active', label: 'Actifs' },
        { value: 'inactive', label: 'Inactifs' },
      ],
    },
    {
      id: 'role',
      label: 'Rôle',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Tous les rôles' },
        ...(rolesForFilter ?? []).map((r) => ({ value: r.code, label: r.name || r.code })),
      ],
    },
  ], [total, rolesForFilter])

  const handleFilterChange = useCallback((id: string, value: unknown) => {
    if (id === 'status') {
      if (value === 'active') setFilterActive(true)
      else if (value === 'inactive') setFilterActive(false)
      else setFilterActive(undefined)
      setPage(1)
    }
    if (id === 'role') {
      setFilterRoleCode(value === 'all' ? undefined : value as string)
      setPage(1)
    }
  }, [])

  const activeFilterValue = filterActive === true ? 'active' : filterActive === false ? 'inactive' : 'all'

  const handleRowClick = useCallback((row: GroupRead) => {
    if (onOpenPanel) {
      onOpenPanel({ type: 'detail', module: 'groups', id: row.id })
    } else {
      setSelectedGroup(selectedGroup === row.id ? null : row.id)
    }
  }, [onOpenPanel, selectedGroup])

  // When controlled (inside UsersPage), render DataTable directly without extra wrappers
  if (isControlled) {
    return (
      <>
        {showCreate && <CreateGroupForm onClose={() => setShowCreate(false)} />}
        <DataTable
          columns={groupColumns}
          data={groups}
          isLoading={isLoading}
          getRowId={(row) => row.id}
          searchValue={search}
          onSearchChange={() => { /* search driven by topbar */ }}
          searchPlaceholder="Filtrer les résultats..."
          onRowClick={handleRowClick}
          pagination={{ page, pageSize, total, pages }}
          onPaginationChange={(newPage, newSize) => { setPage(newPage); setPSize(newSize) }}
          filters={groupFilterDefs}
          activeFilters={{ status: activeFilterValue, role: filterRoleCode ?? 'all' }}
          onFilterChange={handleFilterChange}

          sortable
          columnVisibility
          defaultHiddenColumns={['entity_name', 'created_at', 'updated_at']}
          selectable
          columnResizing
          columnPinning
          defaultPinnedColumns={{ left: ['name'] }}

          importExport={{
            exportFormats: ['csv', 'xlsx'] as ExportFormat[],
            advancedExport: true,
            filenamePrefix: 'groupes',
            importWizardTarget: 'group',
            exportHeaders: {
              name: 'Nom',
              role: 'Rôle',
              member_count: 'Membres',
              scope: 'Scope',
              entity_name: 'Entité',
              active: 'Statut',
              created_at: 'Créé le',
              updated_at: 'Modifié le',
            },
          }}

          emptyTitle={search ? 'Aucun groupe trouvé.' : 'Aucun groupe configuré.'}
          emptyIcon={Users}
          storageKey="rbac-groups"
        />
      </>
    )
  }

  return (
    <div className="flex gap-0 min-h-[500px]">
      {/* Master list */}
      <div className={cn('flex-1 min-w-0', selectedGroup && 'max-w-[calc(100%-360px)]')}>

        {showCreate && <CreateGroupForm onClose={() => setShowCreate(false)} />}

        <DataTable
          columns={groupColumns}
          data={groups}
          isLoading={isLoading}
          getRowId={(row) => row.id}
          searchValue={search}
          onSearchChange={(v) => { if (isControlled) { /* search driven by topbar */ } else { setInternalSearch(v); setPage(1) } }}
          searchPlaceholder="Filtrer les résultats..."
          onRowClick={handleRowClick}
          pagination={{ page, pageSize, total, pages }}
          onPaginationChange={(newPage, newSize) => { setPage(newPage); setPSize(newSize) }}
          filters={groupFilterDefs}
          activeFilters={{ status: activeFilterValue, role: filterRoleCode ?? 'all' }}
          onFilterChange={handleFilterChange}

          sortable
          columnVisibility
          defaultHiddenColumns={['entity_name', 'created_at', 'updated_at']}
          selectable
          columnResizing
          columnPinning
          defaultPinnedColumns={{ left: ['name'] }}

          importExport={{
            exportFormats: ['csv', 'xlsx'] as ExportFormat[],
            advancedExport: true,
            filenamePrefix: 'groupes',
            exportHeaders: {
              name: 'Nom',
              role: 'Rôle',
              member_count: 'Membres',
              scope: 'Scope',
              entity_name: 'Entité',
              active: 'Statut',
              created_at: 'Créé le',
              updated_at: 'Modifié le',
            },
          }}

          emptyTitle={search ? 'Aucun groupe trouvé.' : 'Aucun groupe configuré.'}
          emptyIcon={Users}
          storageKey="rbac-groups"
        />
      </div>

      {/* Inline detail panel — only when NOT using DynamicPanel */}
      {!onOpenPanel && selectedGroup && (
        <GroupDetailPanel groupId={selectedGroup} onClose={() => setSelectedGroup(null)} />
      )}
    </div>
  )
}

// ── Create Group Form ────────────────────────────────────────

export function CreateGroupForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createMut = useCreateGroup()
  const { data: roles } = useRoles()
  const [name, setName] = useState('')
  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>([])

  const toggleRole = (code: string) => {
    setSelectedRoleCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  const handleSubmit = () => {
    if (!name.trim() || selectedRoleCodes.length === 0) return
    createMut.mutate(
      { name: name.trim(), role_codes: selectedRoleCodes },
      {
        onSuccess: () => {
          toast({ title: t('settings.toast.rbac.group_created', { name }), variant: 'success' })
          onClose()
        },
        onError: (err: Error) => {
          toast({ title: t('settings.toast.error'), description: err.message, variant: 'error' })
        },
      },
    )
  }

  return (
    <div className="mb-4 p-3 border border-border rounded-lg bg-accent/20">
      <h4 className="text-xs font-semibold text-foreground mb-2">Nouveau groupe</h4>
      <div className="space-y-2">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Nom</label>
          <input className="gl-form-input text-xs w-full" placeholder="Équipe CDS — ALEN" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Rôles</label>
          <div className="flex flex-wrap gap-1 p-2 border border-border rounded bg-background min-h-[32px]">
            {(roles || []).map((r) => {
              const isSelected = selectedRoleCodes.includes(r.code)
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => toggleRole(r.code)}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-all ${
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-accent text-muted-foreground hover:bg-accent/80'
                  }`}
                >
                  {r.name}
                </button>
              )
            })}
          </div>
          {selectedRoleCodes.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{selectedRoleCodes.length} rôle{selectedRoleCodes.length > 1 ? 's' : ''} sélectionné{selectedRoleCodes.length > 1 ? 's' : ''}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={handleSubmit} disabled={createMut.isPending || !name || selectedRoleCodes.length === 0} className="gl-button-sm gl-button-confirm text-[11px]">
          {createMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Créer
        </button>
        <button onClick={onClose} className="gl-button-sm gl-button-default text-[11px]">
          <X size={11} /> Annuler
        </button>
      </div>
    </div>
  )
}

// ── Permission Matrix helpers ─────────────────────────────────

/** Standard action columns for the matrix view */
const MATRIX_ACTIONS = [
  { key: 'read', label: 'Lire', short: 'L' },
  { key: 'create', label: 'Créer', short: 'C' },
  { key: 'update', label: 'Modifier', short: 'M' },
  { key: 'delete', label: 'Supprimer', short: 'S' },
  { key: 'import', label: 'Importer', short: 'I' },
  { key: 'export', label: 'Exporter', short: 'E' },
] as const

type MatrixAction = typeof MATRIX_ACTIONS[number]['key']

interface MatrixRow {
  /** Display label, e.g. "Tiers", "ADS", "Profils" */
  label: string
  /** Full entity path, e.g. "tier", "paxlog.ads" */
  entity: string
  /** Map action → permission code (only for standard actions) */
  actions: Partial<Record<MatrixAction, string>>
  /** Extra permissions that don't fit standard actions */
  extras: PermissionRead[]
}

interface MatrixModule {
  module: string
  rows: MatrixRow[]
  /** All permission codes in this module */
  allCodes: string[]
}

/** Parse permission codes into a matrix structure grouped by module */
function buildPermissionMatrix(permissions: PermissionRead[]): MatrixModule[] {
  const actionAliases: Record<string, MatrixAction> = {
    read: 'read', create: 'create', update: 'update', edit: 'update',
    delete: 'delete', import: 'import', export: 'export',
  }

  // Group by module
  const byModule: Record<string, PermissionRead[]> = {}
  for (const p of permissions) {
    const mod = p.module || 'core'
    if (!byModule[mod]) byModule[mod] = []
    byModule[mod].push(p)
  }

  return Object.entries(byModule)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mod, perms]) => {
      // Group permissions by entity prefix
      const entityMap: Record<string, { actions: Partial<Record<MatrixAction, string>>; extras: PermissionRead[] }> = {}

      for (const p of perms) {
        // Split code: "tier.contact.manage" → parts = ["tier", "contact", "manage"]
        const parts = p.code.split('.')
        const lastPart = parts[parts.length - 1]
        const action = actionAliases[lastPart]

        if (action) {
          // Standard action — entity is everything except the last part
          const entity = parts.slice(0, -1).join('.')
          if (!entityMap[entity]) entityMap[entity] = { actions: {}, extras: [] }
          entityMap[entity].actions[action] = p.code
        } else {
          // Non-standard — group under the entity prefix (all but last part)
          const entity = parts.length > 1 ? parts.slice(0, -1).join('.') : p.code
          if (!entityMap[entity]) entityMap[entity] = { actions: {}, extras: [] }
          entityMap[entity].extras.push(p)
        }
      }

      // Build rows
      const rows: MatrixRow[] = Object.entries(entityMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([entity, data]) => {
          // Derive label: "paxlog.ads" → "ADS", "tier" → "Tier", "tier.contact" → "Contact"
          const parts = entity.split('.')
          const lastPart = parts[parts.length - 1]
          const label = lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/_/g, ' ')
          return { label, entity, actions: data.actions, extras: data.extras }
        })

      return {
        module: mod,
        rows,
        allCodes: perms.map((p) => p.code),
      }
    })
}

type PermSource = 'user' | 'role' | 'group'

const SOURCE_BADGE: Record<PermSource, { icon: React.ElementType; color: string; label: string }> = {
  user:  { icon: UserIcon,   color: 'text-violet-500', label: 'Utilisateur' },
  role:  { icon: Shield,     color: 'text-blue-500',   label: 'Rôle' },
  group: { icon: UsersRound, color: 'text-emerald-500', label: 'Groupe' },
}

/** Reusable Permission Matrix component */
function PermissionMatrix({
  allPermissions,
  activePerms,
  isProtected,
  onToggle,
  onSetMany,
  search,
  onSearchChange,
  permSources,
}: {
  allPermissions: PermissionRead[]
  activePerms: Set<string>
  isProtected: boolean
  onToggle: (code: string) => void
  onSetMany: (codes: string[], granted: boolean) => void
  search: string
  onSearchChange: (v: string) => void
  /** Optional source tracking for badge display (code → source) */
  permSources?: Map<string, PermSource>
}) {
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set())

  const matrix = useMemo(() => {
    const m = buildPermissionMatrix(allPermissions)
    if (!search) return m
    const q = search.toLowerCase()
    return m
      .map((mod) => ({
        ...mod,
        rows: mod.rows.filter((r) =>
          r.label.toLowerCase().includes(q) ||
          r.entity.toLowerCase().includes(q) ||
          Object.values(r.actions).some((code) => code?.toLowerCase().includes(q)) ||
          r.extras.some((e) => e.code.toLowerCase().includes(q) || (e.name || '').toLowerCase().includes(q))
        ),
      }))
      .filter((mod) => mod.module.toLowerCase().includes(q) || mod.rows.length > 0)
  }, [allPermissions, search])

  const toggleModuleCollapse = (mod: string) => {
    setCollapsedModules((prev) => {
      const updated = new Set(prev)
      if (updated.has(mod)) updated.delete(mod)
      else updated.add(mod)
      return updated
    })
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="gl-form-input text-xs pl-7 w-full h-7"
            placeholder="Filtrer les permissions..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <button
          onClick={() => setCollapsedModules(new Set())}
          className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-1"
          title="Tout dérouler"
        >
          <ChevronDown size={12} />
        </button>
        <button
          onClick={() => setCollapsedModules(new Set(matrix.map((m) => m.module)))}
          className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-1"
          title="Tout replier"
        >
          <ChevronRight size={12} />
        </button>
        {!isProtected && (
          <>
            <button
              type="button"
              onClick={() => onSetMany(allPermissions.map((p) => p.code), true)}
              className="text-[10px] text-primary hover:text-primary/80 font-medium px-2 py-1"
            >
              Tout accorder
            </button>
            <button
              type="button"
              onClick={() => onSetMany(allPermissions.map((p) => p.code), false)}
              className="text-[10px] text-muted-foreground hover:text-foreground font-medium px-2 py-1"
            >
              Tout retirer
            </button>
          </>
        )}
      </div>

      {/* Matrix table */}
      <div className="border border-border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
        {matrix.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {search ? 'Aucune permission trouvée.' : 'Aucune permission disponible.'}
          </div>
        ) : (
          matrix.map((mod) => {
            const isCollapsed = collapsedModules.has(mod.module)
            const checkedCount = mod.allCodes.filter((c) => activePerms.has(c)).length

            return (
              <div key={mod.module} className="border-b border-border/50 last:border-b-0">
                {/* Module header */}
                <div className="flex items-center gap-2 px-3 py-2 bg-accent/30 hover:bg-accent/50 transition-colors">
                  <button
                    onClick={() => toggleModuleCollapse(mod.module)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                  >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <FolderTree size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider truncate">{mod.module}</span>
                  </button>
                  {!isProtected && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSetMany(mod.allCodes, true)}
                        className="text-[10px] text-primary hover:text-primary/80 font-medium px-1"
                      >
                        Tout
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetMany(mod.allCodes, false)}
                        className="text-[10px] text-muted-foreground hover:text-foreground font-medium px-1"
                      >
                        Aucun
                      </button>
                    </div>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {checkedCount}/{mod.allCodes.length}
                  </span>
                </div>

                {/* Matrix rows */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs table-fixed" style={{ minWidth: 600 }}>
                      {/* Column headers — percentages so columns scale with container */}
                      <colgroup>
                        <col style={{ width: '16%' }} />
                        {MATRIX_ACTIONS.map((a) => <col key={a.key} style={{ width: '11%' }} />)}
                        <col style={{ width: '18%' }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                            Ressource
                          </th>
                          {MATRIX_ACTIONS.map((a) => (
                            <th key={a.key} className="text-center px-0.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                              {a.label}
                            </th>
                          ))}
                          <th className="text-left px-1 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                            Autres
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {mod.rows.map((row) => {
                          const hasAnyAction = Object.keys(row.actions).length > 0 || row.extras.length > 0
                          if (!hasAnyAction) return null
                          return (
                            <tr key={row.entity} className="border-b border-border/20 hover:bg-accent/10 transition-colors">
                              <td className="px-3 py-1.5 font-medium text-foreground whitespace-nowrap">
                                {row.label}
                              </td>
                              {MATRIX_ACTIONS.map((a) => {
                                const code = row.actions[a.key]
                                if (!code) {
                                  return <td key={a.key} className="text-center px-1.5 py-1.5"><span className="text-muted-foreground/20">—</span></td>
                                }
                                const checked = activePerms.has(code)
                                const source = permSources?.get(code)
                                const badge = source ? SOURCE_BADGE[source] : null
                                return (
                                  <td key={a.key} className="text-center px-1.5 py-1.5">
                                    <Tooltip content={`${a.label}: ${code}${badge ? ` (${badge.label})` : ''}`}>
                                      <button
                                        type="button"
                                        disabled={isProtected}
                                        onClick={() => onToggle(code)}
                                        className={cn(
                                          'relative inline-flex items-center justify-center h-6 w-6 rounded transition-colors',
                                          checked
                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                            : 'bg-muted/50 text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground',
                                          isProtected && 'cursor-not-allowed opacity-60',
                                        )}
                                      >
                                        {checked ? <Check size={12} strokeWidth={3} /> : <X size={10} />}
                                        {badge && checked && (
                                          <badge.icon size={7} className={cn('absolute -top-0.5 -right-0.5', badge.color)} />
                                        )}
                                      </button>
                                    </Tooltip>
                                  </td>
                                )
                              })}
                              <td className="px-2 py-1.5">
                                {row.extras.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {row.extras.map((extra) => {
                                      const checked = activePerms.has(extra.code)
                                      return (
                                        <Tooltip key={extra.code} content={extra.name || extra.code}>
                                          <button
                                            type="button"
                                            disabled={isProtected}
                                            onClick={() => onToggle(extra.code)}
                                            className={cn(
                                              'px-1.5 py-0.5 rounded text-[9px] font-mono font-medium transition-colors',
                                              checked
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                : 'bg-muted text-muted-foreground hover:bg-muted/80',
                                              isProtected && 'cursor-not-allowed opacity-60',
                                            )}
                                          >
                                            {extra.code}
                                          </button>
                                        </Tooltip>
                                      )
                                    })}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span>{activePerms.size} permission(s) active(s) sur {allPermissions.length} disponible(s)</span>
      </div>
    </div>
  )
}


// ── Role Picker — searchable dropdown ────────────────────────

function RolePicker({ values, roles, onChange, disabled }: {
  values: string[]
  roles: RoleRead[]
  onChange: (codes: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(() => {
    if (!search) return roles
    const q = search.toLowerCase()
    return roles.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
  }, [roles, search])

  const selectedNames = values.map((code) => roles.find((r) => r.code === code)?.name || code)

  const toggleRole = (code: string) => {
    if (values.includes(code)) {
      onChange(values.filter((c) => c !== code))
    } else {
      onChange([...values, code])
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'gl-form-input text-xs min-h-[32px] w-full max-w-[300px] flex items-center justify-between text-left gap-2',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
          {values.length === 0 ? (
            <span className="text-muted-foreground">Aucun rôle</span>
          ) : (
            selectedNames.map((name, i) => (
              <span key={values[i]} className="gl-badge gl-badge-info text-[10px] shrink-0">{name}</span>
            ))
          )}
        </div>
        <ChevronDown size={12} className="text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-[300px] bg-background border border-border rounded-lg shadow-lg">
          <div className="p-1.5">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="gl-form-input text-xs w-full h-7 pl-7"
                placeholder="Rechercher un rôle..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Aucun rôle trouvé</p>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => toggleRole(r.code)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-accent transition-colors',
                    values.includes(r.code) && 'bg-primary/10 text-primary font-medium',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-3.5 h-3.5 border rounded flex items-center justify-center shrink-0',
                      values.includes(r.code) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30',
                    )}>
                      {values.includes(r.code) && <Check size={9} />}
                    </div>
                    <span className="font-medium truncate">{r.name}</span>
                    <span className="text-muted-foreground ml-auto text-[10px] shrink-0">{r.code}</span>
                  </div>
                  {r.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 ml-6 truncate">{r.description}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Group Detail Panel ───────────────────────────────────────
// Two tabs: Fiche (info + members) + Permissions (matrix editor)

type GroupSubTab = 'fiche' | 'permissions'

export function GroupDetailPanel({ groupId, onClose, inline = true }: { groupId: string; onClose: () => void; inline?: boolean }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: group, isLoading } = useGroup(groupId)
  const primaryRoleCode = group?.role_codes?.[0] || ''
  const { data: roleDetail } = useRole(primaryRoleCode)
  const { data: allPermissions } = usePermissions()
  const { data: roles } = useRoles()
  const updateMut = useUpdateGroup()
  const removeMemberMut = useRemoveGroupMember()
  const addMembersMut = useAddGroupMembers()
  const setGroupOverridesMut = useSetGroupPermissionOverrides()
  const deleteGroupMut = useDeleteGroup()
  const [activeTab, setActiveTab] = useState<GroupSubTab>('fiche')
  const [showAddUser, setShowAddUser] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const { data: usersData } = useUsers({ search: userSearch, page_size: 10 })

  // Permission editing state — 3-layer model
  // Role permissions = base layer (read-only from role)
  // Group overrides = editable layer (granted=true adds, granted=false revokes)
  const [permSearch, setPermSearch] = useState('')
  const [pendingOverrides, setPendingOverrides] = useState<Map<string, boolean> | null>(null)

  // Role base permissions (read-only)
  const rolePermCodes = useMemo(
    () => new Set((roleDetail?.permissions || []).map((p) => p.code)),
    [roleDetail?.permissions],
  )

  // Current group overrides from API
  const currentOverrides = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const o of group?.permission_overrides || []) {
      m.set(o.permission_code, o.granted)
    }
    return m
  }, [group?.permission_overrides])

  // Active overrides for editing
  const activeOverrides = pendingOverrides ?? currentOverrides

  // Merge: role + group overrides = effective permissions
  const activePerms = useMemo(() => {
    const effective = new Set(rolePermCodes)
    for (const [code, granted] of activeOverrides) {
      if (granted) effective.add(code)
      else effective.delete(code)
    }
    return effective
  }, [rolePermCodes, activeOverrides])

  // Source tracking for badge display
  const permSources = useMemo(() => {
    const sources = new Map<string, PermSource>()
    // Start with role permissions
    for (const code of rolePermCodes) sources.set(code, 'role')
    // Apply group overrides
    for (const [code, granted] of activeOverrides) {
      if (granted) sources.set(code, 'group')
      else sources.delete(code)
    }
    return sources
  }, [rolePermCodes, activeOverrides])

  const togglePermission = useCallback((permCode: string) => {
    setPendingOverrides((prev) => {
      const base = new Map(prev ?? currentOverrides)
      const isInRole = rolePermCodes.has(permCode)
      const currentOverride = base.get(permCode)

      if (isInRole) {
        // Permission from role: toggle group revoke
        if (currentOverride === false) {
          // Was revoked by group → remove override (restore role grant)
          base.delete(permCode)
        } else {
          // Active from role → revoke via group override
          base.set(permCode, false)
        }
      } else {
        // Permission NOT from role: toggle group grant
        if (currentOverride === true) {
          // Was added by group → remove override
          base.delete(permCode)
        } else {
          // Not active → add via group override
          base.set(permCode, true)
        }
      }
      return base
    })
  }, [currentOverrides, rolePermCodes])

  const toggleAllCodes = useCallback((codes: string[], granted: boolean) => {
    setPendingOverrides((prev) => {
      const base = new Map(prev ?? currentOverrides)
      for (const c of codes) {
        const isInRole = rolePermCodes.has(c)
        if (granted) {
          // Select all: grant non-role perms, remove role revokes.
          if (isInRole) base.delete(c)
          else base.set(c, true)
        } else {
          // Deselect all: revoke role perms, remove group grants.
          if (isInRole) base.set(c, false)
          else base.delete(c)
        }
      }
      return base
    })
  }, [currentOverrides, rolePermCodes])

  const hasPendingChanges = useMemo(() => {
    if (pendingOverrides === null) return false
    if (pendingOverrides.size !== currentOverrides.size) return true
    for (const [code, granted] of pendingOverrides) {
      if (currentOverrides.get(code) !== granted) return true
    }
    return false
  }, [pendingOverrides, currentOverrides])

  const savePermissions = () => {
    if (!pendingOverrides || !group) return
    const overrides: PermissionOverride[] = Array.from(pendingOverrides.entries()).map(
      ([permission_code, granted]) => ({ permission_code, granted })
    )
    setGroupOverridesMut.mutate(
      { groupId, overrides },
      {
        onSuccess: () => {
          toast({ title: t('settings.toast.rbac.group_permissions_updated'), variant: 'success' })
          setPendingOverrides(null)
        },
        onError: (err: Error) => {
          toast({ title: t('settings.toast.error'), description: err.message, variant: 'error' })
        },
      },
    )
  }

  const handleRemoveMember = (userId: string) => {
    removeMemberMut.mutate(
      { groupId, userId },
      {
        onSuccess: () => toast({ title: t('settings.toast.rbac.member_removed'), variant: 'success' }),
        onError: (err: Error) => toast({ title: t('settings.toast.error'), description: err.message, variant: 'error' }),
      },
    )
  }

  const handleAddUser = (userId: string) => {
    addMembersMut.mutate(
      { groupId, userIds: [userId] },
      {
        onSuccess: () => { toast({ title: t('settings.toast.rbac.member_added'), variant: 'success' }); setShowAddUser(false); setUserSearch('') },
        onError: (err: Error) => toast({ title: t('settings.toast.error'), description: err.message, variant: 'error' }),
      },
    )
  }

  // Compact permissions grouped by module for the Fiche tab
  const permsByModule = useMemo(() => {
    if (!allPermissions) return []
    const grouped: Record<string, { code: string; label: string; source?: PermSource }[]> = {}
    for (const code of activePerms) {
      const perm = allPermissions.find((p) => p.code === code)
      const mod = perm?.module || 'core'
      if (!grouped[mod]) grouped[mod] = []
      grouped[mod].push({ code, label: code, source: permSources.get(code) })
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  }, [allPermissions, activePerms, permSources])

  const toggleActive = () => {
    if (!group) return
    updateMut.mutate(
      { id: groupId, payload: { active: !group.active } },
      {
        onSuccess: () => toast({ title: group.active ? t('settings.toast.rbac.group_toggled_inactive') : t('settings.toast.rbac.group_toggled_active'), variant: 'success' }),
      },
    )
  }

  const handleDeleteGroup = () => {
    deleteGroupMut.mutate(groupId, {
      onSuccess: () => {
        toast({ title: t('settings.toast.rbac.group_deleted'), variant: 'success' })
        onClose()
      },
      onError: (err: Error) => {
        toast({ title: t('settings.toast.error'), description: err.message, variant: 'error' })
      },
    })
  }

  if (isLoading) {
    return inline ? (
      <div className="w-[360px] shrink-0 border-l border-border flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    ) : (
      <DynamicPanelShell title="Chargement..." icon={<Users size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  if (!group) return null

  const isProtected = group.role_codes.includes('SUPER_ADMIN')
  const existingUserIds = new Set(group.members.map((m) => m.user_id))
  const availableUsers = (usersData?.items || []).filter((u) => !existingUserIds.has(u.id))
  const permCount = activePerms.size
  const overrideCount = activeOverrides.size

  const panelActions = hasPendingChanges ? (
    <div className="flex items-center gap-2">
      <button onClick={() => setPendingOverrides(null)} className="gl-button-sm gl-button-default text-[11px]">
        Annuler
      </button>
      <button onClick={savePermissions} disabled={setGroupOverridesMut.isPending} className="gl-button-sm gl-button-confirm text-[11px]">
        {setGroupOverridesMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
        Sauvegarder
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleActive}
        disabled={updateMut.isPending}
        className={cn('gl-button-sm text-[11px]', group.active ? 'gl-button-default' : 'gl-button-confirm')}
      >
        {group.active ? 'Désactiver' : 'Activer'}
      </button>
      {!isProtected && (
        <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleDeleteGroup} confirmLabel="Supprimer ?">
          Supprimer
        </DangerConfirmButton>
      )}
    </div>
  )

  const tabBar = (
    <div className="flex items-center gap-0 border-b border-border mb-3 -mt-1">
      {(['fiche', 'permissions'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 transition-colors -mb-px',
            activeTab === tab
              ? 'border-primary text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {tab === 'fiche' ? <Users size={12} /> : <Lock size={12} />}
          {tab === 'fiche' ? 'Fiche' : 'Permissions'}
          {tab === 'permissions' && (
            <span className={cn(
              'ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold',
              activeTab === 'permissions' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
            )}>
              {permCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )

  const ficheContent = (
    <div className="grid grid-cols-1 @xl:grid-cols-[1fr_1fr] gap-4">
      {/* Left column — Info + Members */}
      <div className="space-y-1 min-w-0">
        <FormSection title="Informations" defaultExpanded storageKey="rbac.group.info">
          <div className="space-y-1">
            <InlineEditableRow
              label="Nom"
              value={group.name}
              onSave={(v) => updateMut.mutate({ id: groupId, payload: { name: v } })}
            />
            <DetailFieldGrid>
              <ReadOnlyRow
                label="Rôles"
                value={
                  isProtected ? (
                    <div className="flex flex-wrap gap-1">
                      {group.role_codes.map((code, i) => (
                        <button
                          key={code}
                          onClick={() => useUIStore.getState().openDynamicPanel({ type: 'detail', module: 'roles', id: code })}
                          className="gl-badge gl-badge-info cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
                        >
                          {group.role_names[i] || code}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <RolePicker
                      values={group.role_codes}
                      roles={roles || []}
                      onChange={(codes) => updateMut.mutate({ id: groupId, payload: { role_codes: codes } })}
                    />
                  )
                }
              />
              <ReadOnlyRow
                label="Entité"
                value={<CrossModuleLink module="entities" id={group.entity_id} label={group.entity_name || group.entity_id} showIcon={false} className="text-foreground" />}
              />
              <ReadOnlyRow
                label="Scope asset"
                value={group.asset_scope_name
                  ? <span className="gl-badge gl-badge-neutral">{group.asset_scope_name}</span>
                  : <span className="text-muted-foreground italic">Global (toute l'entité)</span>
                }
              />
              <ReadOnlyRow
                label="Statut"
                value={group.active
                  ? <span className="gl-badge gl-badge-success">Actif</span>
                  : <span className="gl-badge gl-badge-neutral">Inactif</span>
                }
              />
              <ReadOnlyRow
                label="Permissions"
                value={
                  <span className="text-foreground">
                    {permCount} effective(s)
                    {overrideCount > 0 && (
                      <span className="text-muted-foreground ml-1">({rolePermCodes.size} rôle + {overrideCount} surcharge(s))</span>
                    )}
                  </span>
                }
              />
            </DetailFieldGrid>
          </div>
        </FormSection>

        {/* Members */}
        <FormSection title={`Membres (${group.members.length})`} defaultExpanded storageKey="rbac.group.members">
          <div className="mb-3">
            <button
              onClick={() => setShowAddUser(!showAddUser)}
              className="gl-button-sm gl-button-confirm text-[11px]"
            >
              <UserPlus size={11} /> Ajouter un membre
            </button>
          </div>

          {showAddUser && (
            <div className="mb-3 p-2.5 border border-border rounded-lg bg-accent/20">
              <div className="relative mb-2">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="gl-form-input text-sm pl-8 w-full h-8"
                  placeholder="Rechercher un utilisateur..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {userSearch.length >= 2 && (
                <div className="max-h-[150px] overflow-y-auto space-y-0.5">
                  {availableUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">Aucun utilisateur trouvé</p>
                  ) : (
                    availableUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleAddUser(u.id)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent text-sm text-left transition-colors"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary shrink-0">
                          {u.first_name[0]}{u.last_name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground">{u.first_name} {u.last_name}</span>
                        </div>
                        <span className="text-muted-foreground text-xs truncate">{u.email}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {group.members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucun membre dans ce groupe.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {group.members.map((member) => (
                <div key={member.user_id} className="flex items-center gap-2.5 py-2">
                  <button
                    onClick={() => useUIStore.getState().openDynamicPanel({ type: 'detail', module: 'users', id: member.user_id })}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:bg-accent/50 rounded px-1.5 -mx-1.5 py-1 transition-colors cursor-pointer"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary shrink-0">
                      {member.first_name[0]}{member.last_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary">{member.first_name} {member.last_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                  </button>
                  <DangerConfirmButton
                    icon={<Trash2 size={11} />}
                    onConfirm={() => handleRemoveMember(member.user_id)}
                    confirmLabel="Retirer ?"
                  >
                    Retirer
                  </DangerConfirmButton>
                </div>
              ))}
            </div>
          )}
        </FormSection>
      </div>

      {/* Right column — Permissions summary */}
      <div className="min-w-0">
        <FormSection
          title={`Permissions effectives (${permCount})`}
          defaultExpanded
          storageKey="rbac.group.perms.summary"
        >
          {/* Legend */}
          <div className="flex items-center gap-3 mb-3">
            {(['role', 'group'] as const).map((src) => {
              const b = SOURCE_BADGE[src]
              return (
                <span key={src} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <b.icon size={10} className={b.color} />
                  {b.label}
                </span>
              )
            })}
          </div>

          {permsByModule.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Aucune permission.</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {permsByModule.map(([mod, perms]) => (
                <div key={mod}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{mod}</p>
                  <div className="flex flex-wrap gap-1">
                    {perms.sort((a, b) => a.code.localeCompare(b.code)).map(({ code, label, source }) => {
                      const badge = source ? SOURCE_BADGE[source] : null
                      return (
                        <Tooltip key={code} content={code}>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent text-[10px] text-foreground">
                            {badge && <badge.icon size={8} className={badge.color} />}
                            {label}
                          </span>
                        </Tooltip>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </FormSection>
      </div>
    </div>
  )

  const permissionsContent = (
    <div className="space-y-3">
      {/* Info banner — group-level overrides */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/30">
        <ShieldCheck size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <div className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
          <p>
            Base : {group.role_codes.length} rôle{group.role_codes.length !== 1 ? 's' : ''} (<strong>{group.role_names.join(', ') || group.role_codes.join(', ')}</strong>) — {rolePermCodes.size} perm.
            Vous éditez les <strong>surcharges du groupe</strong>.
          </p>
          {overrideCount > 0 && (
            <p className="mt-1">
              {overrideCount} surcharge(s) active(s) sur ce groupe.
            </p>
          )}
          {/* Legend */}
          <div className="flex items-center gap-3 mt-1.5">
            {(['role', 'group'] as const).map((src) => {
              const b = SOURCE_BADGE[src]
              return (
                <span key={src} className="inline-flex items-center gap-1">
                  <b.icon size={10} className={b.color} />
                  <span className="text-[10px]">{b.label}</span>
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {isProtected && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30">
          <Lock size={14} className="text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            SUPER_ADMIN dispose de toutes les permissions (non modifiable).
          </p>
        </div>
      )}

      {allPermissions && (
        <PermissionMatrix
          allPermissions={allPermissions}
          activePerms={activePerms}
          isProtected={isProtected}
          onToggle={togglePermission}
          onSetMany={toggleAllCodes}
          search={permSearch}
          onSearchChange={setPermSearch}
          permSources={permSources}
        />
      )}

      {hasPendingChanges && (
        <div className="text-center text-[11px] text-amber-600 dark:text-amber-400 font-medium">
          Modifications non sauvegardées
        </div>
      )}
    </div>
  )

  // DynamicPanelShell mode (from UsersPage)
  if (!inline) {
    return (
      <DynamicPanelShell
        title={group.name}
        subtitle={group.role_names.join(', ') || group.role_codes.join(', ') || 'Aucun rôle'}
        icon={<Users size={14} className="text-primary" />}
        actions={panelActions}
      >
        <div className="px-4 py-3 space-y-1">
          {tabBar}
          {activeTab === 'fiche' && ficheContent}
          {activeTab === 'permissions' && permissionsContent}
        </div>
      </DynamicPanelShell>
    )
  }

  // InlineDetailPanel mode (from Settings/RbacAdminTab)
  return (
    <InlineDetailPanel
      title={group.name}
      subtitle={group.role_names.join(', ') || group.role_codes.join(', ') || 'Aucun rôle'}
      icon={<Users size={16} className="text-primary" />}
      onClose={onClose}
      actions={panelActions}
    >
      {tabBar}
      {activeTab === 'fiche' && ficheContent}
      {activeTab === 'permissions' && permissionsContent}
    </InlineDetailPanel>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PERMISSIONS TAB — Read-only matrix with rich tooltips
// ══════════════════════════════════════════════════════════════════════════════

export function PermissionsTab({ externalSearch }: { externalSearch?: string } = {}) {
  const [internalSearch, setInternalSearch] = useState('')
  const search = externalSearch ?? internalSearch
  const isControlled = externalSearch !== undefined
  const { data: modules, isLoading } = useModules()

  // Build a filtered view from modules
  const filteredModules = useMemo(() => {
    if (!modules) return []
    if (!search) return modules

    const q = search.toLowerCase()
    return modules
      .map((mod) => ({
        ...mod,
        permissions: mod.permissions.filter(
          (p) =>
            p.code.toLowerCase().includes(q) ||
            (p.name || '').toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q),
        ),
      }))
      .filter((mod) => mod.permissions.length > 0)
  }, [modules, search])

  const totalPerms = filteredModules.reduce((acc, mod) => acc + mod.permissions.length, 0)

  return (
    <div>
      {/* Toolbar — hidden when parent provides search */}
      <div className="flex items-center gap-2 mb-4">
        {!isControlled && (
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="gl-form-input h-8 text-xs pl-8 w-full"
              placeholder="Rechercher une permission..."
              value={internalSearch}
              onChange={(e) => setInternalSearch(e.target.value)}
            />
          </div>
        )}
        <span className="text-xs text-muted-foreground shrink-0">{totalPerms} permission(s)</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : filteredModules.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {search ? 'Aucune permission trouvée.' : 'Aucune permission enregistrée.'}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredModules.map((mod) => (
            <PermissionModuleBlock key={mod.module} module={mod.module} permissions={mod.permissions} />
          ))}
        </div>
      )}
    </div>
  )
}

function PermissionModuleBlock({ module: mod, permissions }: { module: string; permissions: PermissionRead[] }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-accent/30 hover:bg-accent/50 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Lock size={13} className="text-primary" />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{mod}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{permissions.length} permission{permissions.length > 1 ? 's' : ''}</span>
      </button>

      {expanded && (
        <div className="divide-y divide-border/50">
          {permissions.map((p) => (
            <Tooltip
              key={p.code}
              side="right"
              content={
                <div className="max-w-sm">
                  <p className="font-medium">{p.name || p.code}</p>
                  {p.description && <p className="text-muted-foreground mt-1">{p.description}</p>}
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">Module: {p.module || 'core'}</p>
                </div>
              }
            >
              <div className="flex items-center gap-3 px-3 py-1.5 hover:bg-accent/20 transition-colors">
                <span className="font-mono text-xs text-foreground w-64 truncate shrink-0">{p.code}</span>
                <span className="text-xs text-muted-foreground truncate">{p.name || ''}</span>
                {p.description && (
                  <span className="text-[10px] text-muted-foreground/60 truncate ml-auto max-w-[200px]">{p.description}</span>
                )}
              </div>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  )
}
