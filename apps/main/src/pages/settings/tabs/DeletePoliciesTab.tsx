/**
 * DeletePoliciesTab — Admin configuration for delete behavior per entity type.
 *
 * Allows admin to configure:
 * - Soft Delete (archive only)
 * - Soft + Auto Purge (archive + auto-delete after N days)
 * - Physical Delete (immediate)
 *
 * Also provides manual purge trigger and archived record counts.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Archive, Clock, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useConfirm } from '@/components/ui/ConfirmDialog'

interface DeletePolicy {
  entity_type: string
  label: string
  category: 'main' | 'child'
  table: string
  mode: 'soft' | 'soft_purge' | 'hard'
  retention_days: number
  default_mode: string
  archived_count: number
}

export function DeletePoliciesTab() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [editingType, setEditingType] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<string>('soft')
  const [editRetention, setEditRetention] = useState<number>(90)

  const { data: policies = [], isLoading } = useQuery<DeletePolicy[]>({
    queryKey: ['admin', 'delete-policies'],
    queryFn: () => api.get('/api/v1/admin/delete-policies').then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: ({ entityType, mode, retentionDays }: { entityType: string; mode: string; retentionDays: number }) =>
      api.put(`/api/v1/admin/delete-policies/${entityType}`, { mode, retention_days: retentionDays }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'delete-policies'] })
      setEditingType(null)
    },
  })

  const purgeMutation = useMutation({
    mutationFn: (entityType: string) =>
      api.post(`/api/v1/admin/purge/${entityType}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'delete-policies'] })
    },
  })

  const mainPolicies = policies.filter(p => p.category === 'main')
  const childPolicies = policies.filter(p => p.category === 'child')

  const totalArchived = policies.reduce((sum, p) => sum + p.archived_count, 0)

  const startEdit = (p: DeletePolicy) => {
    setEditingType(p.entity_type)
    setEditMode(p.mode)
    setEditRetention(p.retention_days || 90)
  }

  const saveEdit = (entityType: string) => {
    updateMutation.mutate({
      entityType,
      mode: editMode,
      retentionDays: editMode === 'soft_purge' ? editRetention : 0,
    })
  }

  const modeLabel = (mode: string) => {
    switch (mode) {
      case 'soft': return t('delete_policies.mode_soft')
      case 'soft_purge': return t('delete_policies.mode_soft_purge')
      case 'hard': return t('delete_policies.mode_hard')
      default: return mode
    }
  }

  const modeIcon = (mode: string) => {
    switch (mode) {
      case 'soft': return <Archive size={14} className="text-blue-500" />
      case 'soft_purge': return <Clock size={14} className="text-orange-500" />
      case 'hard': return <Trash2 size={14} className="text-red-500" />
      default: return null
    }
  }

  const renderPolicyRow = (p: DeletePolicy) => {
    const isEditing = editingType === p.entity_type

    return (
      <tr key={p.entity_type} className="border-b border-border last:border-0 hover:bg-muted/30">
        <td className="py-2 px-3 text-sm font-medium">{p.label}</td>
        <td className="py-2 px-3 text-sm">
          {isEditing ? (
            <select
              value={editMode}
              onChange={e => setEditMode(e.target.value)}
              className="h-7 rounded border border-border bg-background px-2 text-xs"
            >
              <option value="soft">{t('delete_policies.mode_soft')}</option>
              <option value="soft_purge">{t('delete_policies.mode_soft_purge')}</option>
              <option value="hard">{t('delete_policies.mode_hard')}</option>
            </select>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {modeIcon(p.mode)}
              <span className="text-xs">{modeLabel(p.mode)}</span>
            </span>
          )}
        </td>
        <td className="py-2 px-3 text-sm text-center">
          {isEditing && editMode === 'soft_purge' ? (
            <input
              type="number"
              min={1}
              value={editRetention}
              onChange={e => setEditRetention(Number(e.target.value))}
              className="h-7 w-20 rounded border border-border bg-background px-2 text-xs text-center"
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {p.mode === 'soft_purge' ? `${p.retention_days}j` : '—'}
            </span>
          )}
        </td>
        <td className="py-2 px-3 text-sm text-center">
          {p.archived_count > 0 ? (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-100 text-orange-700 text-[10px] font-medium px-1.5 dark:bg-orange-900/30 dark:text-orange-400">
              {p.archived_count}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">0</span>
          )}
        </td>
        <td className="py-2 px-3 text-right">
          <div className="flex items-center justify-end gap-1">
            {isEditing ? (
              <>
                <button
                  onClick={() => saveEdit(p.entity_type)}
                  disabled={updateMutation.isPending}
                  className="h-6 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {updateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.save')}
                </button>
                <button
                  onClick={() => setEditingType(null)}
                  className="h-6 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => startEdit(p)}
                  className="h-6 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  {t('common.edit')}
                </button>
                {p.archived_count > 0 && (
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('delete_policies.purge_now'),
                        message: t('delete_policies.purge_confirm', { count: p.archived_count }),
                        confirmLabel: t('delete_policies.purge_now'),
                        variant: 'danger',
                      })
                      if (ok) purgeMutation.mutate(p.entity_type)
                    }}
                    disabled={purgeMutation.isPending}
                    className="h-6 rounded bg-destructive/10 px-2 text-[11px] font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
                  >
                    {purgeMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('delete_policies.purge_now')}
                  </button>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[15px] font-semibold">{t('delete_policies.title')}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{t('delete_policies.description')}</p>
      </div>

      {totalArchived > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-800 dark:bg-orange-950/30">
          <AlertTriangle size={14} className="text-orange-500 shrink-0" />
          <span className="text-xs text-orange-700 dark:text-orange-400">
            {totalArchived} {t('delete_policies.archived_count').toLowerCase()}
          </span>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['admin', 'delete-policies'] })}
            className="ml-auto text-orange-600 hover:text-orange-700"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      <CollapsibleSection id="delete-policies-main" title={t('delete_policies.category_main')} defaultExpanded>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="py-1.5 px-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('delete_policies.entity_type')}</th>
                <th className="py-1.5 px-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('delete_policies.mode')}</th>
                <th className="py-1.5 px-3 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('delete_policies.retention_days')}</th>
                <th className="py-1.5 px-3 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('delete_policies.archived_count')}</th>
                <th className="py-1.5 px-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {mainPolicies.map(renderPolicyRow)}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="delete-policies-child" title={t('delete_policies.category_child')} defaultExpanded={false}>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="py-1.5 px-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('delete_policies.entity_type')}</th>
                <th className="py-1.5 px-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('delete_policies.mode')}</th>
                <th className="py-1.5 px-3 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('delete_policies.retention_days')}</th>
                <th className="py-1.5 px-3 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('delete_policies.archived_count')}</th>
                <th className="py-1.5 px-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {childPolicies.map(renderPolicyRow)}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </div>
  )
}
