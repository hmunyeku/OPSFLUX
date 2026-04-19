/**
 * PermissionMatrix — Reusable table-based permission matrix.
 *
 * Displays permissions grouped by module in a RESSOURCE × ACTIONS table
 * with columns: Lire, Créer, Modifier, Supprimer, Importer, Exporter, Autres.
 *
 * Supports read-only view (profile, user detail) and edit mode (RBAC admin).
 * Source badges show whether each permission comes from role, group, or user override.
 *
 * Used in: user detail panel (Comptes), profile settings, RBAC admin.
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Loader2, Search, Check, X, ChevronRight, ChevronDown, FolderTree,
  Shield, Users as UsersRound, User as UserIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { usePermissions, useUserEffectivePermissions } from '@/hooks/useRbac'
import type { PermissionRead } from '@/services/rbacService'

// ── Matrix action columns ────────────────────────────────────
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
  label: string
  entity: string
  actions: Partial<Record<MatrixAction, string>>
  extras: PermissionRead[]
}

interface MatrixModule {
  module: string
  rows: MatrixRow[]
  allCodes: string[]
}

type PermSource = 'user' | 'role' | 'group'

const SOURCE_BADGE: Record<PermSource, { icon: React.ElementType; color: string; label: string }> = {
  user:  { icon: UserIcon,   color: 'text-violet-500', label: 'Utilisateur' },
  role:  { icon: Shield,     color: 'text-blue-500',   label: 'Rôle' },
  group: { icon: UsersRound, color: 'text-emerald-500', label: 'Groupe' },
}

// ── Matrix builder ───────────────────────────────────────────
function buildPermissionMatrix(permissions: PermissionRead[]): MatrixModule[] {
  const actionAliases: Record<string, MatrixAction> = {
    read: 'read', create: 'create', update: 'update', edit: 'update',
    delete: 'delete', import: 'import', export: 'export',
  }

  const byModule: Record<string, PermissionRead[]> = {}
  for (const p of permissions) {
    const mod = p.module || 'core'
    if (!byModule[mod]) byModule[mod] = []
    byModule[mod].push(p)
  }

  return Object.entries(byModule)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mod, perms]) => {
      const entityMap: Record<string, { actions: Partial<Record<MatrixAction, string>>; extras: PermissionRead[] }> = {}

      for (const p of perms) {
        const parts = p.code.split('.')
        const lastPart = parts[parts.length - 1]
        const action = actionAliases[lastPart]

        if (action) {
          const entity = parts.slice(0, -1).join('.')
          if (!entityMap[entity]) entityMap[entity] = { actions: {}, extras: [] }
          entityMap[entity].actions[action] = p.code
        } else {
          const entity = parts.length > 1 ? parts.slice(0, -1).join('.') : p.code
          if (!entityMap[entity]) entityMap[entity] = { actions: {}, extras: [] }
          entityMap[entity].extras.push(p)
        }
      }

      const rows: MatrixRow[] = Object.entries(entityMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([entity, data]) => {
          const parts = entity.split('.')
          const lastPart = parts[parts.length - 1]
          const label = lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/_/g, ' ')
          return { label, entity, actions: data.actions, extras: data.extras }
        })

      return { module: mod, rows, allCodes: perms.map((p) => p.code) }
    })
}

// ── Public API ────────────────────────────────────────────────

export interface PermissionMatrixProps {
  /** User ID to show permissions for */
  userId: string
  /** Maximum height of the scrollable matrix area */
  maxHeight?: string
  /** Compact mode — hide search bar */
  compact?: boolean
  /** Enable editing — cells become clickable to toggle user permission overrides */
  editable?: boolean
  /** Called when a permission is toggled in edit mode */
  onToggle?: (code: string, granted: boolean) => void
  /** Set of permission codes that have user-level overrides (to show override indicator) */
  userOverrides?: Set<string>
}

export function PermissionMatrix({ userId, maxHeight = '500px', compact = false, editable = false, onToggle, userOverrides }: PermissionMatrixProps) {
  const { t } = useTranslation()
  const { data: allPermissions, isLoading: permsLoading } = usePermissions()
  const { data: effectivePerms, isLoading: effectiveLoading } = useUserEffectivePermissions(userId)

  const [search, setSearch] = useState('')
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set())

  // Build active perms set + source map
  const { activePerms, permSources } = useMemo(() => {
    const active = new Set<string>()
    const sources = new Map<string, PermSource>()
    if (effectivePerms) {
      for (const p of effectivePerms as { permission_code: string; source: PermSource }[]) {
        active.add(p.permission_code)
        sources.set(p.permission_code, p.source)
      }
    }
    return { activePerms: active, permSources: sources }
  }, [effectivePerms])

  // Build matrix from all available permissions
  const matrix = useMemo(() => {
    if (!allPermissions?.length) return []
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

  const applyBulkState = (codes: string[], granted: boolean) => {
    if (!editable || !onToggle) return
    for (const code of codes) {
      const checked = activePerms.has(code)
      if (checked !== granted) onToggle(code, granted)
    }
  }

  const isLoading = permsLoading || effectiveLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allPermissions?.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">Aucune permission disponible</p>
  }

  return (
    <div className="space-y-3">
      {/* Search + legend */}
      {!compact && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="gl-form-input text-xs pl-7 w-full h-7"
              placeholder={t('settings.filtrer_les_permissions')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setCollapsedModules(new Set())}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-1"
            title={t('settings.tout_derouler')}
          >
            <ChevronDown size={12} />
          </button>
          <button
            onClick={() => setCollapsedModules(new Set(matrix.map((m) => m.module)))}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-1"
            title={t('settings.tout_replier')}
          >
            <ChevronRight size={12} />
          </button>
          {editable && (
            <>
              <button
                type="button"
                onClick={() => applyBulkState(allPermissions.map((p) => p.code), true)}
                className="text-[10px] text-primary hover:text-primary/80 font-medium px-2 py-1"
                title={t('shared.accorder_toutes_les_permissions')}
              >
                Tout accorder
              </button>
              <button
                type="button"
                onClick={() => applyBulkState(allPermissions.map((p) => p.code), false)}
                className="text-[10px] text-muted-foreground hover:text-foreground font-medium px-2 py-1"
                title={t('shared.retirer_toutes_les_permissions')}
              >
                Tout retirer
              </button>
            </>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground px-1">
        <span className="flex items-center gap-1"><Shield size={8} className="text-blue-500" /> {t('common.role')}</span>
        <span className="flex items-center gap-1"><UsersRound size={8} className="text-emerald-500" /> Groupe</span>
      </div>

      {/* Matrix table */}
      <div className="border border-border rounded-lg overflow-hidden overflow-y-auto" style={{ maxHeight }}>
        {matrix.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {search ? 'Aucune permission trouvée.' : 'Aucune permission disponible.'}
          </div>
        ) : (
          matrix.map((mod) => {
            const isCollapsed = collapsedModules.has(mod.module)
            const checkedCount = mod.allCodes.filter((c) => activePerms.has(c)).length
            const allChecked = checkedCount === mod.allCodes.length && mod.allCodes.length > 0

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
                  {editable && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => applyBulkState(mod.allCodes, true)}
                        className="text-[10px] text-primary hover:text-primary/80 font-medium px-1"
                        title={`Accorder toutes les permissions du module ${mod.module}`}
                      >
                        Tout
                      </button>
                      <button
                        type="button"
                        onClick={() => applyBulkState(mod.allCodes, false)}
                        className="text-[10px] text-muted-foreground hover:text-foreground font-medium px-1"
                        title={`Retirer toutes les permissions du module ${mod.module}`}
                      >
                        Aucun
                      </button>
                    </div>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {allChecked ? mod.allCodes.length : checkedCount}/{mod.allCodes.length}
                  </span>
                </div>

                {/* Matrix rows */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs table-fixed" style={{ minWidth: 600 }}>
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
                                const source = permSources.get(code)
                                const badge = source ? SOURCE_BADGE[source] : null
                                const isUserOverride = userOverrides?.has(code)
                                const tooltipText = `${a.label}: ${code}${badge ? ` (${badge.label})` : ''}${isUserOverride ? ' [override utilisateur]' : ''}`
                                const cellContent = (
                                  <span
                                    className={cn(
                                      'relative inline-flex items-center justify-center h-6 w-6 rounded',
                                      checked
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                        : 'bg-muted/50 text-muted-foreground/30',
                                      editable && 'cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all',
                                      isUserOverride && 'ring-1 ring-violet-400/50',
                                    )}
                                  >
                                    {checked ? <Check size={12} strokeWidth={3} /> : <X size={10} />}
                                    {badge && checked && (
                                      <badge.icon size={7} className={cn('absolute -top-0.5 -right-0.5', badge.color)} />
                                    )}
                                    {isUserOverride && (
                                      <UserIcon size={6} className="absolute -bottom-0.5 -right-0.5 text-violet-500" />
                                    )}
                                  </span>
                                )
                                return (
                                  <td key={a.key} className="text-center px-1.5 py-1.5">
                                    <Tooltip content={tooltipText}>
                                      {editable ? (
                                        <button
                                          type="button"
                                          onClick={() => onToggle?.(code, !checked)}
                                          className="inline-flex"
                                        >
                                          {cellContent}
                                        </button>
                                      ) : cellContent}
                                    </Tooltip>
                                  </td>
                                )
                              })}
                              <td className="px-2 py-1.5">
                                {row.extras.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {row.extras.map((extra) => {
                                      const checked = activePerms.has(extra.code)
                                      const actionLabel = extra.code.split('.').pop() || extra.code
                                      const Tag = editable ? 'button' as const : 'span' as const
                                      return (
                                        <Tooltip key={extra.code} content={extra.name || extra.code}>
                                          <Tag
                                            {...(editable ? { type: 'button' as const, onClick: () => onToggle?.(extra.code, !checked) } : {})}
                                            className={cn(
                                              'px-1.5 py-0.5 rounded text-[9px] font-medium',
                                              checked
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                : 'bg-muted text-muted-foreground',
                                              editable && 'cursor-pointer hover:ring-2 hover:ring-primary/40',
                                            )}
                                          >
                                            {actionLabel}
                                          </Tag>
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
      <div className="text-[11px] text-muted-foreground px-1">
        {activePerms.size} permission(s) active(s) sur {allPermissions.length} disponible(s)
      </div>
    </div>
  )
}
