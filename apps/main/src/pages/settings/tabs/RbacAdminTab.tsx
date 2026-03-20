/**
 * RBAC Admin tab — professional role/group/permission management.
 *
 * Three sub-tabs:
 * 1. Rôles — tree view grouped by module, with InlineDetailPanel detail
 * 2. Groupes — paginated table with InlineDetailPanel detail
 * 3. Permissions — read-only matrix with rich tooltips
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  ShieldCheck, Users, Lock, Plus, Loader2, Search,
  ChevronRight, ChevronDown, Check, X, UserPlus, Trash2,
  FolderTree,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable, BadgeCell } from '@/components/ui/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useToast } from '@/components/ui/Toast'
import { Tooltip } from '@/components/ui/Tooltip'
import { DynamicPanelShell, FormSection, InlineEditableRow, DangerConfirmButton } from '@/components/layout/DynamicPanel'
import {
  useRoles,
  useRole,
  useCreateRole,
  useUpdateRole,
  useSetRolePermissions,
  usePermissions,
  useModules,
  useGroups,
  useGroup,
  useCreateGroup,
  useUpdateGroup,
  useAddGroupMembers,
  useRemoveGroupMember,
} from '@/hooks/useRbac'
import { useUsers } from '@/hooks/useUsers'
import type { RoleRead, PermissionRead, GroupRead } from '@/services/rbacService'

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
  const [activeTab, setActiveTab] = useState<RbacSubTab>('roles')

  return (
    <div className="space-y-0">
      {/* Sub-tab bar */}
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
      </div>

      {activeTab === 'roles' && <RolesTab />}
      {activeTab === 'groups' && <GroupsTab />}
      {activeTab === 'permissions' && <PermissionsTab />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ROLES TAB — Tree view grouped by module + InlineDetailPanel detail
// ══════════════════════════════════════════════════════════════════════════════

export function RolesTab({ externalSearch, createTrigger }: { externalSearch?: string; createTrigger?: number } = {}) {
  const [internalSearch, setInternalSearch] = useState('')
  const search = externalSearch ?? internalSearch
  const { data: roles, isLoading } = useRoles({ search: search || undefined })
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const isControlled = externalSearch !== undefined

  // Open create form when parent triggers it
  useEffect(() => {
    if (createTrigger && createTrigger > 0) setShowCreate(true)
  }, [createTrigger])

  // Group roles by module for tree view
  const moduleTree = useMemo(() => {
    if (!roles) return []
    const grouped: Record<string, RoleRead[]> = {}
    for (const role of roles) {
      const mod = role.module || '_global'
      if (!grouped[mod]) grouped[mod] = []
      grouped[mod].push(role)
    }
    return Object.entries(grouped)
      .map(([mod, moduleRoles]) => ({ module: mod, roles: moduleRoles }))
      .sort((a, b) => {
        if (a.module === '_global') return -1
        if (b.module === '_global') return 1
        return a.module.localeCompare(b.module)
      })
  }, [roles])

  return (
    <div className="flex gap-0 h-full min-h-[500px]">
      {/* Master list */}
      <div className={cn('flex-1 min-w-0 flex flex-col', selectedRole && 'max-w-[calc(100%-360px)]')}>
        {/* Toolbar — hidden when parent provides search & create */}
        {!isControlled && (
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="gl-form-input h-8 text-xs pl-8 w-full"
                placeholder="Rechercher un rôle..."
                value={internalSearch}
                onChange={(e) => setInternalSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="gl-button-sm gl-button-confirm text-[11px] shrink-0"
            >
              <Plus size={12} /> Nouveau rôle
            </button>
          </div>
        )}

        {showCreate && <CreateRoleForm onClose={() => setShowCreate(false)} />}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : moduleTree.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {search ? 'Aucun rôle trouvé.' : 'Aucun rôle configuré.'}
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            {moduleTree.map((node) => (
              <ModuleTreeNode
                key={node.module}
                module={node.module}
                roles={node.roles}
                selectedRole={selectedRole}
                onSelectRole={setSelectedRole}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedRole && (
        <RoleDetailPanel code={selectedRole} onClose={() => setSelectedRole(null)} />
      )}
    </div>
  )
}

// ── Module tree node ─────────────────────────────────────────

function ModuleTreeNode({
  module: mod,
  roles,
  selectedRole,
  onSelectRole,
}: {
  module: string
  roles: RoleRead[]
  selectedRole: string | null
  onSelectRole: (code: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const displayName = mod === '_global' ? 'Rôles globaux' : mod

  return (
    <div>
      {/* Module header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-accent/30 border-b border-border hover:bg-accent/50 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <FolderTree size={13} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{displayName}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{roles.length} rôle{roles.length > 1 ? 's' : ''}</span>
      </button>

      {/* Role rows */}
      {expanded && (
        <div>
          {roles.map((role) => (
            <button
              key={role.code}
              onClick={() => onSelectRole(role.code)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 pl-9 text-left border-b border-border/50 transition-colors',
                'hover:bg-accent/20',
                selectedRole === role.code && 'bg-primary/[0.08] border-l-2 border-l-primary',
              )}
            >
              <ShieldCheck size={13} className={cn(
                'shrink-0',
                selectedRole === role.code ? 'text-primary' : 'text-muted-foreground',
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{role.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{role.code}</span>
                </div>
                {role.description && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{role.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Tooltip content={`${role.permission_count} permission(s)`}>
                  <span className="gl-badge gl-badge-neutral text-[10px]">
                    <Lock size={9} className="mr-0.5" />{role.permission_count}
                  </span>
                </Tooltip>
                <Tooltip content={`${role.group_count} groupe(s)`}>
                  <span className="gl-badge gl-badge-neutral text-[10px]">
                    <Users size={9} className="mr-0.5" />{role.group_count}
                  </span>
                </Tooltip>
              </div>
              <ChevronRight size={12} className="text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Create Role Form ─────────────────────────────────────────

function CreateRoleForm({ onClose }: { onClose: () => void }) {
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
          toast({ title: `Rôle "${code}" créé`, variant: 'success' })
          onClose()
        },
        onError: (err: Error) => {
          toast({ title: 'Erreur', description: err.message, variant: 'error' })
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

function RoleDetailPanel({ code, onClose }: { code: string; onClose: () => void }) {
  const { toast } = useToast()
  const { data: role, isLoading } = useRole(code)
  const { data: allPermissions } = usePermissions()
  const setPermsMut = useSetRolePermissions()
  const updateMut = useUpdateRole()
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

  const toggleModule = useCallback((_moduleName: string, perms: PermissionRead[]) => {
    setPendingPerms((prev) => {
      const base = prev ?? new Set(currentPermCodes)
      const updated = new Set(base)
      const allChecked = perms.every((p) => updated.has(p.code))
      for (const p of perms) {
        if (allChecked) updated.delete(p.code)
        else updated.add(p.code)
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
          toast({ title: 'Permissions mises à jour', variant: 'success' })
          setPendingPerms(null)
        },
        onError: (err: Error) => {
          toast({ title: 'Erreur', description: err.message, variant: 'error' })
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

  if (isLoading) {
    return (
      <div className="w-[360px] shrink-0 border-l border-border flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!role) return null

  const isProtected = role.code === 'SUPER_ADMIN'

  return (
    <InlineDetailPanel
      title={role.name}
      subtitle={role.code}
      icon={<ShieldCheck size={16} className="text-primary" />}
      onClose={onClose}
      actions={
        hasPendingChanges ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setPendingPerms(null)} className="gl-button-sm gl-button-default text-[11px]">
              Annuler
            </button>
            <button onClick={savePermissions} disabled={setPermsMut.isPending} className="gl-button-sm gl-button-confirm text-[11px]">
              {setPermsMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Sauvegarder
            </button>
          </div>
        ) : undefined
      }
    >
      {/* General info */}
      <FormSection title="Informations" defaultExpanded storageKey="rbac.role.info">
        <div className="space-y-0">
          {!isProtected ? (
            <>
              <InlineEditableRow
                label="Nom"
                value={role.name}
                onSave={(v) => updateMut.mutate({ code, payload: { name: v } })}
              />
              <InlineEditableRow
                label="Description"
                value={role.description || ''}
                onSave={(v) => updateMut.mutate({ code, payload: { description: v || null } })}
              />
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 py-1.5 text-xs">
                <span className="w-28 text-muted-foreground shrink-0">Nom</span>
                <span className="text-foreground">{role.name}</span>
              </div>
              <div className="flex items-center gap-3 py-1.5 text-xs">
                <span className="w-28 text-muted-foreground shrink-0">Description</span>
                <span className="text-foreground">{role.description || '—'}</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-3 py-1.5 text-xs">
            <span className="w-28 text-muted-foreground shrink-0">Module</span>
            <span className="gl-badge gl-badge-neutral">{role.module || 'core'}</span>
          </div>
          <div className="flex items-center gap-3 py-1.5 text-xs">
            <span className="w-28 text-muted-foreground shrink-0">Statistiques</span>
            <div className="flex items-center gap-3">
              <span className="text-foreground">{activePerms.size} permissions</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">{role.group_count} groupes</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">{role.user_count} utilisateurs</span>
            </div>
          </div>
        </div>
      </FormSection>

      {/* Permissions editor */}
      <FormSection title="Permissions" defaultExpanded storageKey="rbac.role.perms">
        <div className="mb-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="gl-form-input text-xs pl-7 w-full h-7"
              placeholder="Filtrer les permissions..."
              value={permSearch}
              onChange={(e) => setPermSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {groupedPerms.map(([mod, perms]) => {
            const allChecked = perms.every((p) => activePerms.has(p.code))
            const someChecked = perms.some((p) => activePerms.has(p.code))

            return (
              <div key={mod}>
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => !isProtected && toggleModule(mod, perms)}
                    disabled={isProtected}
                    className="flex items-center gap-1.5 group"
                  >
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked }}
                      readOnly
                      disabled={isProtected}
                      className="rounded border-border text-primary focus:ring-primary/20 h-3 w-3"
                    />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                      {mod}
                    </span>
                  </button>
                  <span className="text-[9px] text-muted-foreground">
                    ({perms.filter((p) => activePerms.has(p.code)).length}/{perms.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-0.5 ml-1">
                  {perms.map((p) => {
                    const checked = activePerms.has(p.code)
                    return (
                      <Tooltip
                        key={p.code}
                        side="left"
                        content={
                          <div>
                            <p className="font-medium">{p.name || p.code}</p>
                            {p.description && <p className="text-muted-foreground mt-1">{p.description}</p>}
                            <p className="text-[10px] text-muted-foreground mt-1 font-mono">{p.code}</p>
                          </div>
                        }
                      >
                        <label
                          className={cn(
                            'flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors text-xs',
                            checked ? 'bg-primary/[0.08]' : 'hover:bg-accent/50',
                            isProtected && 'cursor-default',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => !isProtected && togglePermission(p.code)}
                            disabled={isProtected}
                            className="rounded border-border text-primary focus:ring-primary/20 h-3 w-3"
                          />
                          <span className={cn('font-mono text-[11px] truncate', checked ? 'text-primary font-medium' : 'text-foreground')}>
                            {p.code}
                          </span>
                          {p.name && p.name !== p.code && (
                            <span className="text-[10px] text-muted-foreground truncate ml-auto">{p.name}</span>
                          )}
                        </label>
                      </Tooltip>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </FormSection>

      {/* Groups using this role */}
      {role.groups && role.groups.length > 0 && (
        <FormSection title={`Groupes (${role.groups.length})`} storageKey="rbac.role.groups">
          <div className="space-y-1">
            {role.groups.map((g) => (
              <div key={g.id} className="flex items-center gap-2 py-1.5 text-xs">
                <Users size={12} className="text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground truncate">{g.name}</span>
                {g.asset_scope_name && (
                  <span className="gl-badge gl-badge-neutral text-[9px] shrink-0">{g.asset_scope_name}</span>
                )}
                <span className="text-muted-foreground ml-auto shrink-0">{g.member_count} mbr</span>
                {!g.active && <span className="gl-badge gl-badge-neutral text-[9px]">Inactif</span>}
              </div>
            ))}
          </div>
        </FormSection>
      )}
    </InlineDetailPanel>
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
  const [internalSearch, setInternalSearch] = useState('')
  const search = externalSearch ?? internalSearch
  const [page, setPage] = useState(1)
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined)
  const { data: groupsData, isLoading } = useGroups({
    search: search || undefined,
    active: filterActive,
    page,
    page_size: 50,
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

  const groupColumns = useMemo<ColumnDef<GroupRead, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Nom',
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
      header: 'Rôle',
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-info text-[10px]">{row.original.role_name || row.original.role_code}</span>
      ),
    },
    {
      accessorKey: 'member_count',
      header: 'Membres',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.member_count}</span>,
      size: 70,
    },
    {
      id: 'scope',
      header: 'Scope',
      cell: ({ row }) => row.original.asset_scope_name ? (
        <span className="gl-badge gl-badge-neutral text-[10px]">{row.original.asset_scope_name}</span>
      ) : (
        <span className="text-[10px] text-muted-foreground italic">Global</span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Statut',
      cell: ({ getValue }) => {
        const active = getValue() as boolean
        return <BadgeCell value={active ? 'Actif' : 'Inactif'} variant={active ? 'success' : 'neutral'} />
      },
      size: 90,
    },
  ], [])

  const statusFilterDefs = useMemo(() => [{
    id: 'status',
    label: 'Statut',
    type: 'select' as const,
    options: [
      { value: 'all', label: 'Tous', count: total },
      { value: 'active', label: 'Actifs' },
      { value: 'inactive', label: 'Inactifs' },
    ],
  }], [total])

  const handleFilterChange = useCallback((id: string, value: unknown) => {
    if (id === 'status') {
      if (value === 'active') setFilterActive(true)
      else if (value === 'inactive') setFilterActive(false)
      else setFilterActive(undefined)
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
          pagination={{ page, pageSize: 50, total, pages }}
          onPaginationChange={(newPage, _pageSize) => setPage(newPage)}
          filters={statusFilterDefs}
          activeFilters={{ status: activeFilterValue }}
          onFilterChange={handleFilterChange}

          sortable
          columnVisibility
          selectable
          columnResizing
          columnPinning
          defaultPinnedColumns={{ left: ['name'] }}

          importExport={{
            exportFormats: ['csv', 'xlsx'],
            advancedExport: true,
            filenamePrefix: 'groupes',
            importWizardTarget: 'group',
            exportHeaders: {
              name: 'Nom',
              role: 'Rôle',
              member_count: 'Membres',
              scope: 'Scope',
              active: 'Statut',
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
          pagination={{ page, pageSize: 50, total, pages }}
          onPaginationChange={(newPage, _pageSize) => setPage(newPage)}
          filters={statusFilterDefs}
          activeFilters={{ status: activeFilterValue }}
          onFilterChange={handleFilterChange}

          sortable
          columnVisibility
          selectable
          columnResizing
          columnPinning
          defaultPinnedColumns={{ left: ['name'] }}

          importExport={{
            exportFormats: ['csv', 'xlsx'],
            advancedExport: true,
            filenamePrefix: 'groupes',
            exportHeaders: {
              name: 'Nom',
              role: 'Rôle',
              member_count: 'Membres',
              scope: 'Scope',
              active: 'Statut',
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
  const { toast } = useToast()
  const createMut = useCreateGroup()
  const { data: roles } = useRoles()
  const [name, setName] = useState('')
  const [roleCode, setRoleCode] = useState('')

  const handleSubmit = () => {
    if (!name.trim() || !roleCode) return
    createMut.mutate(
      { name: name.trim(), role_code: roleCode },
      {
        onSuccess: () => {
          toast({ title: `Groupe "${name}" créé`, variant: 'success' })
          onClose()
        },
        onError: (err: Error) => {
          toast({ title: 'Erreur', description: err.message, variant: 'error' })
        },
      },
    )
  }

  return (
    <div className="mb-4 p-3 border border-border rounded-lg bg-accent/20">
      <h4 className="text-xs font-semibold text-foreground mb-2">Nouveau groupe</h4>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Nom</label>
          <input className="gl-form-input text-xs w-full" placeholder="Équipe CDS — ALEN" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Rôle</label>
          <select className="gl-form-input text-xs w-full" value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
            <option value="">Sélectionner un rôle...</option>
            {(roles || []).map((r) => (
              <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={handleSubmit} disabled={createMut.isPending || !name || !roleCode} className="gl-button-sm gl-button-confirm text-[11px]">
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

// ── Group Detail Panel ───────────────────────────────────────

export function GroupDetailPanel({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { toast } = useToast()
  const { data: group, isLoading } = useGroup(groupId)
  const { data: roleDetail } = useRole(group?.role_code || '')
  const updateMut = useUpdateGroup()
  const removeMemberMut = useRemoveGroupMember()
  const addMembersMut = useAddGroupMembers()
  const [showAddUser, setShowAddUser] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const { data: usersData } = useUsers({ search: userSearch, page_size: 10 })

  const handleRemoveMember = (userId: string) => {
    removeMemberMut.mutate(
      { groupId, userId },
      {
        onSuccess: () => toast({ title: 'Membre retiré', variant: 'success' }),
        onError: (err: Error) => toast({ title: 'Erreur', description: err.message, variant: 'error' }),
      },
    )
  }

  const handleAddUser = (userId: string) => {
    addMembersMut.mutate(
      { groupId, userIds: [userId] },
      {
        onSuccess: () => { toast({ title: 'Membre ajouté', variant: 'success' }); setShowAddUser(false); setUserSearch('') },
        onError: (err: Error) => toast({ title: 'Erreur', description: err.message, variant: 'error' }),
      },
    )
  }

  const toggleActive = () => {
    if (!group) return
    updateMut.mutate(
      { id: groupId, payload: { active: !group.active } },
      {
        onSuccess: () => toast({ title: group.active ? 'Groupe désactivé' : 'Groupe activé', variant: 'success' }),
      },
    )
  }

  if (isLoading) {
    return (
      <div className="w-[360px] shrink-0 border-l border-border flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!group) return null

  const existingUserIds = new Set(group.members.map((m) => m.user_id))
  const availableUsers = (usersData?.items || []).filter((u) => !existingUserIds.has(u.id))

  return (
    <InlineDetailPanel
      title={group.name}
      subtitle={group.role_name || group.role_code}
      icon={<Users size={16} className="text-primary" />}
      onClose={onClose}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={toggleActive}
            disabled={updateMut.isPending}
            className={cn('gl-button-sm text-[11px]', group.active ? 'gl-button-default' : 'gl-button-confirm')}
          >
            {group.active ? 'Désactiver' : 'Activer'}
          </button>
        </div>
      }
    >
      {/* Info */}
      <FormSection title="Informations" defaultExpanded storageKey="rbac.group.info">
        <div className="space-y-0">
          <InlineEditableRow
            label="Nom"
            value={group.name}
            onSave={(v) => updateMut.mutate({ id: groupId, payload: { name: v } })}
          />
          <div className="flex items-center gap-3 py-1.5 text-xs">
            <span className="w-28 text-muted-foreground shrink-0">Rôle</span>
            <span className="gl-badge gl-badge-info">{group.role_name || group.role_code}</span>
          </div>
          <div className="flex items-center gap-3 py-1.5 text-xs">
            <span className="w-28 text-muted-foreground shrink-0">Scope asset</span>
            <span className="text-foreground">{group.asset_scope_name || 'Global (toute l\'entité)'}</span>
          </div>
          <div className="flex items-center gap-3 py-1.5 text-xs">
            <span className="w-28 text-muted-foreground shrink-0">Statut</span>
            {group.active ? (
              <span className="gl-badge gl-badge-success">Actif</span>
            ) : (
              <span className="gl-badge gl-badge-neutral">Inactif</span>
            )}
          </div>
        </div>
      </FormSection>

      {/* Members */}
      <FormSection title={`Membres (${group.members.length})`} defaultExpanded storageKey="rbac.group.members">
        <div className="mb-2">
          <button
            onClick={() => setShowAddUser(!showAddUser)}
            className="gl-button-sm gl-button-confirm text-[11px]"
          >
            <UserPlus size={11} /> Ajouter un membre
          </button>
        </div>

        {showAddUser && (
          <div className="mb-3 p-2 border border-border rounded-lg bg-accent/20">
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="gl-form-input text-xs pl-7 w-full h-7"
                placeholder="Rechercher un utilisateur..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                autoFocus
              />
            </div>
            {userSearch.length >= 2 && (
              <div className="max-h-[120px] overflow-y-auto space-y-0.5">
                {availableUsers.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-2 text-center">Aucun utilisateur trouvé</p>
                ) : (
                  availableUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleAddUser(u.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-xs text-left"
                    >
                      <UserPlus size={11} className="text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground">{u.first_name} {u.last_name}</span>
                      <span className="text-muted-foreground ml-auto text-[10px]">{u.email}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {group.members.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Aucun membre.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {group.members.map((member) => (
              <div key={member.user_id} className="flex items-center gap-2 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary shrink-0">
                  {member.first_name[0]}{member.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{member.first_name} {member.last_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{member.email}</p>
                </div>
                <DangerConfirmButton
                  icon={<Trash2 size={10} />}
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

      {/* Inherited permissions */}
      {roleDetail && roleDetail.permissions.length > 0 && (
        <FormSection title={`Permissions héritées (${roleDetail.permissions.length})`} storageKey="rbac.group.perms">
          <div className="space-y-2">
            {(() => {
              const grouped: Record<string, PermissionRead[]> = {}
              for (const p of roleDetail.permissions) {
                const mod = p.module || 'core'
                if (!grouped[mod]) grouped[mod] = []
                grouped[mod].push(p)
              }
              return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([mod, perms]) => (
                <div key={mod}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{mod}</p>
                  <div className="flex flex-wrap gap-1">
                    {perms.map((p) => (
                      <Tooltip key={p.code} content={p.description || p.name || p.code}>
                        <span className="gl-badge gl-badge-neutral text-[9px] font-mono">{p.code}</span>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ))
            })()}
          </div>
        </FormSection>
      )}
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
