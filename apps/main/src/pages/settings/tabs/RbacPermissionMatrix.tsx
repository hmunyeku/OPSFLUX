/**
 * PermissionMatrix + RolePicker + buildPermissionMatrix helper.
 *
 * Shared building blocks for the RBAC admin UI. Used by the group
 * and role detail panels inside RbacAdminTab to render an editable
 * grid of permission codes and a checkbox-list role picker.
 *
 * Extracted from RbacAdminTab.tsx to keep the main file reviewable.
 * Not exported through the PermissionMatrix shared component in
 * `@/components/shared` — that one is read-only and consumes this
 * data via a different interface.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, Check, X, Search, FolderTree,
  Shield, Users as UsersRound, User as UserIcon,
} from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import type { PermissionRead, RoleRead } from '@/services/rbacService'

// ── Permission Matrix helpers ─────────────────────────────────

/** Standard action columns for the matrix view */
export const MATRIX_ACTIONS = [
  { key: 'read', label: 'Lire', short: 'L' },
  { key: 'create', label: 'Créer', short: 'C' },
  { key: 'update', label: 'Modifier', short: 'M' },
  { key: 'delete', label: 'Supprimer', short: 'S' },
  { key: 'import', label: 'Importer', short: 'I' },
  { key: 'export', label: 'Exporter', short: 'E' },
] as const

export type MatrixAction = typeof MATRIX_ACTIONS[number]['key']

export interface MatrixRow {
  /** Display label, e.g. "Tiers", "ADS", "Profils" */
  label: string
  /** Full entity path, e.g. "tier", "paxlog.ads" */
  entity: string
  /** Map action → permission code (only for standard actions) */
  actions: Partial<Record<MatrixAction, string>>
  /** Extra permissions that don't fit standard actions */
  extras: PermissionRead[]
}

export interface MatrixModule {
  module: string
  rows: MatrixRow[]
  /** All permission codes in this module */
  allCodes: string[]
}

/** Parse permission codes into a matrix structure grouped by module */
export function buildPermissionMatrix(permissions: PermissionRead[]): MatrixModule[] {
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

export type PermSource = 'user' | 'role' | 'group'

export const SOURCE_BADGE: Record<PermSource, { icon: React.ElementType; color: string; label: string }> = {
  user:  { icon: UserIcon,   color: 'text-violet-500', label: 'Utilisateur' },
  role:  { icon: Shield,     color: 'text-blue-500',   label: 'Rôle' },
  group: { icon: UsersRound, color: 'text-emerald-500', label: 'Groupe' },
}

/** Reusable Permission Matrix component */
export function PermissionMatrix({
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

export function RolePicker({ values, roles, onChange, disabled }: {
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
