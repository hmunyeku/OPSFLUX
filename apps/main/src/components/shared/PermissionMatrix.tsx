/**
 * PermissionMatrix — Reusable permission grid component.
 *
 * Displays permissions grouped by module in a matrix format with
 * color-coded source indicators (role, group, user override, denied).
 *
 * Supports read-only view and edit mode with override toggling.
 *
 * Used in: user detail panel (Comptes), profile settings, RBAC admin.
 */
import { useState, useMemo, useCallback } from 'react'
import { Loader2, Pencil, Save, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import { useModules, useUserEffectivePermissions, useUserPermissionOverrides, useSetUserPermissionOverrides } from '@/hooks/useRbac'

// ── Source color mapping ──
const SOURCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  user: { bg: 'bg-amber-500', text: 'text-amber-500', label: 'Override' },
  role: { bg: 'bg-blue-500', text: 'text-blue-500', label: 'Rôle' },
  group: { bg: 'bg-violet-500', text: 'text-violet-500', label: 'Groupe' },
}

interface PermissionOverride {
  permission_code: string
  granted: boolean
}

export interface PermissionMatrixProps {
  /** User ID to show permissions for */
  userId: string
  /** Allow editing (override toggling). Requires core.rbac.manage permission. Default: false */
  editable?: boolean
  /** Maximum height of the scrollable matrix area */
  maxHeight?: string
  /** Compact mode — smaller text, tighter spacing */
  compact?: boolean
}

export function PermissionMatrix({ userId, editable = false, maxHeight = '450px', compact = false }: PermissionMatrixProps) {
  const { hasPermission } = usePermission()
  const canManage = editable && hasPermission('core.rbac.manage')

  const { data: effectivePerms, isLoading: permsLoading } = useUserEffectivePermissions(userId)
  const { data: modules, isLoading: modulesLoading } = useModules()
  const { data: overrides } = useUserPermissionOverrides(userId)
  const setOverrides = useSetUserPermissionOverrides()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Map<string, boolean>>(new Map())

  // Build effective permission lookup: code → source
  const effectiveMap = useMemo(() => {
    const map = new Map<string, string>()
    if (effectivePerms) {
      for (const p of effectivePerms as { permission_code: string; source: string }[]) {
        map.set(p.permission_code, p.source)
      }
    }
    return map
  }, [effectivePerms])

  const handleStartEdit = useCallback(() => {
    const map = new Map<string, boolean>()
    if (overrides) {
      for (const o of overrides) map.set(o.permission_code, o.granted)
    }
    setDraft(map)
    setEditing(true)
  }, [overrides])

  const handleCancel = useCallback(() => {
    setEditing(false)
    setDraft(new Map())
  }, [])

  const handleSave = useCallback(() => {
    const newOverrides: PermissionOverride[] = []
    draft.forEach((granted, code) => {
      newOverrides.push({ permission_code: code, granted })
    })
    setOverrides.mutate({ userId, overrides: newOverrides }, {
      onSuccess: () => setEditing(false),
    })
  }, [draft, userId, setOverrides])

  const handleToggle = useCallback((code: string) => {
    setDraft(prev => {
      const next = new Map(prev)
      if (next.has(code)) {
        if (next.get(code)) next.set(code, false)
        else next.delete(code)
      } else {
        next.set(code, true)
      }
      return next
    })
  }, [])

  const isLoading = permsLoading || modulesLoading
  const textSize = compact ? 'text-[9px]' : 'text-[11px]'
  const dotSize = compact ? 'h-2 w-2' : 'h-2.5 w-2.5'
  const editDotSize = compact ? 'h-3 w-3' : 'h-3.5 w-3.5'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!modules?.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">Aucun module configure</p>
  }

  return (
    <div className="space-y-2">
      {/* Header: legend + edit button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> Role</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500 inline-block" /> Groupe</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Override</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400 inline-block" /> Refuse</span>
        </div>
        {canManage && !editing && (
          <button onClick={handleStartEdit} className="gl-button-sm gl-button-default flex items-center gap-1 text-xs">
            <Pencil size={11} /> Modifier
          </button>
        )}
        {editing && (
          <div className="flex items-center gap-1.5">
            <button onClick={handleCancel} className="gl-button-sm gl-button-default flex items-center gap-1 text-xs">
              <X size={11} /> Annuler
            </button>
            <button onClick={handleSave} disabled={setOverrides.isPending} className="gl-button-sm gl-button-confirm flex items-center gap-1 text-xs">
              {setOverrides.isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Enregistrer
            </button>
          </div>
        )}
      </div>

      {/* Matrix grid */}
      <div className="overflow-y-auto border border-border rounded-lg divide-y divide-border/50" style={{ maxHeight }}>
        {modules.map((mod) => (
          <div key={mod.module} className={cn('px-3', compact ? 'py-1.5' : 'py-2')}>
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{mod.module}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
              {mod.permissions.map((perm) => {
                const code = perm.code
                const source = effectiveMap.get(code)
                const isGranted = !!source
                const style = source ? SOURCE_STYLES[source] : null
                const hasDraftOverride = editing && draft.has(code)
                const draftGranted = hasDraftOverride ? draft.get(code) : undefined

                return (
                  <div
                    key={code}
                    className={cn(
                      'flex items-center gap-1.5 py-0.5 rounded-sm',
                      editing && 'cursor-pointer hover:bg-accent/40 px-1 -mx-1',
                    )}
                    onClick={editing ? () => handleToggle(code) : undefined}
                    title={`${code} — ${source ?? 'non accorde'}`}
                  >
                    {editing ? (
                      hasDraftOverride ? (
                        draftGranted ? (
                          <span className={cn(editDotSize, 'rounded-sm bg-amber-500/20 border border-amber-500 flex items-center justify-center')}>
                            <Check size={8} className="text-amber-500" />
                          </span>
                        ) : (
                          <span className={cn(editDotSize, 'rounded-sm bg-red-500/20 border border-red-400 flex items-center justify-center')}>
                            <X size={8} className="text-red-400" />
                          </span>
                        )
                      ) : isGranted ? (
                        <span className={cn(editDotSize, 'rounded-sm border flex items-center justify-center', style?.bg + '/20', 'border-' + (source === 'user' ? 'amber-500' : source === 'role' ? 'blue-500' : 'violet-500'))}>
                          <Check size={8} className={style?.text} />
                        </span>
                      ) : (
                        <span className={cn(editDotSize, 'rounded-sm border border-border bg-muted')} />
                      )
                    ) : (
                      isGranted ? (
                        <span className={cn(dotSize, 'rounded-full shrink-0', style?.bg)} />
                      ) : (
                        <span className={cn(dotSize, 'rounded-full shrink-0 bg-muted border border-border')} />
                      )
                    )}
                    <span className={cn(
                      textSize, 'truncate',
                      isGranted ? 'text-foreground' : 'text-muted-foreground',
                      hasDraftOverride && draftGranted === false && 'line-through text-red-400',
                    )}>
                      {perm.name || code.split('.').pop()}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
