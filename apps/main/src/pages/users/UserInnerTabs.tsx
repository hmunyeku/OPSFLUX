/**
 * Inner tabs of the user detail panel.
 *
 * Extracted from UsersPage.tsx to keep the main page file reviewable:
 *   - UserJournalTab: audit log per user
 *   - UserPermissionsTab: RBAC override matrix per user
 *
 * Both are purely view/state-local; they own their own data fetching.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@/components/ui/DataTable'
import { usePageSize } from '@/hooks/usePageSize'
import { usePermission } from '@/hooks/usePermission'
import { useUserPermissionOverrides, useSetUserPermissionOverrides } from '@/hooks/useRbac'
import { useToast } from '@/components/ui/Toast'
import { PermissionMatrix } from '@/components/shared/PermissionMatrix'

// ── Journal tab ─────────────────────────────────────────────

type AuditEntry = {
  id: string
  action: string
  resource_type: string
  resource_id: string | null
  ip_address: string | null
  details: Record<string, unknown> | null
  created_at: string
}

const ACTION_BADGE_VARIANT: Record<string, string> = {
  create: 'gl-badge-success',
  login: 'gl-badge-info',
  update: 'gl-badge-warning',
  delete: 'gl-badge-danger',
  logout: 'gl-badge-neutral',
}

const getJournalColumns = (t: (key: string) => string): ColumnDef<AuditEntry>[] => [
  {
    accessorKey: 'created_at',
    header: t('users.journal.date'),
    cell: ({ getValue }) => {
      const v = getValue<string>()
      return <span className="text-xs tabular-nums text-muted-foreground">{new Date(v).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    },
    size: 150,
  },
  {
    accessorKey: 'action',
    header: t('users.journal.action'),
    cell: ({ getValue }) => {
      const action = getValue<string>()
      const key = action.toLowerCase().split('.')[0]
      const variant = ACTION_BADGE_VARIANT[key] ?? 'gl-badge-neutral'
      return <span className={`gl-badge ${variant} text-[10px]`}>{action}</span>
    },
    size: 110,
  },
  {
    accessorKey: 'resource_type',
    header: t('users.journal.resource'),
    cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{getValue<string>()}</span>,
    size: 110,
  },
  {
    accessorKey: 'resource_id',
    header: t('users.journal.id'),
    cell: ({ getValue }) => {
      const v = getValue<string | null>()
      return v ? <span className="text-xs font-mono text-primary truncate max-w-[120px] inline-block">{v}</span> : <span className="text-muted-foreground/50">—</span>
    },
    size: 100,
  },
  {
    id: 'details_summary',
    header: t('users.journal.details'),
    cell: ({ row }) => {
      const d = row.original.details
      if (!d || Object.keys(d).length === 0) return <span className="text-muted-foreground/50">—</span>
      const keys = Object.keys(d).slice(0, 3)
      return <span className="text-xs text-muted-foreground truncate max-w-[200px] inline-block">{keys.map(k => `${k}: ${String(d[k])}`).join(', ')}</span>
    },
  },
  {
    accessorKey: 'ip_address',
    header: t('users.journal.ip'),
    cell: ({ getValue }) => <span className="text-xs font-mono text-muted-foreground">{getValue<string>() ?? '—'}</span>,
    size: 110,
  },
]

export function UserJournalTab({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const journalColumns = useMemo(() => getJournalColumns(t), [t])
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [data, setData] = useState<{ items: AuditEntry[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    import('@/lib/api').then(({ default: api }) => {
      api.get('/api/v1/audit-log', { params: { user_id: userId, page, page_size: pageSize } })
        .then(({ data: resp }) => {
          if (!cancelled) {
            setData({ items: resp.items ?? resp ?? [], total: resp.total ?? (resp.items ?? resp ?? []).length })
            setLoading(false)
          }
        })
        .catch(() => { if (!cancelled) setLoading(false) })
    })
    return () => { cancelled = true }
  }, [userId, page, pageSize])

  const total = data?.total ?? 0

  return (
    <DataTable
      data={data?.items ?? []}
      columns={journalColumns}
      pagination={{ page, pageSize, total, pages: Math.ceil(total / pageSize) || 1 }}
      onPaginationChange={(p, s) => { setPage(p); if (s && s !== pageSize) setPage(1) }}
      isLoading={loading}
      selectable={false}
      sortable
      columnVisibility
      defaultHiddenColumns={['resource_id', 'ip_address']}
      storageKey="user-journal"
    />
  )
}

// ── Permissions tab ─────────────────────────────────────────

export function UserPermissionsTab({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  // 'admin.rbac' was never registered — use core.rbac.manage which
  // is the perm actually enforced by the backend RBAC endpoints.
  const canEdit = hasPermission('core.rbac.manage')
  const { data: overridesData } = useUserPermissionOverrides(userId)
  const setOverrides = useSetUserPermissionOverrides()
  const { toast } = useToast()

  const userOverrideSet = useMemo(() => {
    return new Set((overridesData ?? []).map((o: { permission_code: string }) => o.permission_code))
  }, [overridesData])

  const handleToggle = useCallback((code: string, granted: boolean) => {
    const current = (overridesData ?? []) as { permission_code: string; granted: boolean }[]
    const existing = current.find(o => o.permission_code === code)

    let newOverrides: { permission_code: string; granted: boolean }[]
    if (existing) {
      if (existing.granted === granted) {
        // Remove override (revert to role/group default)
        newOverrides = current.filter(o => o.permission_code !== code)
      } else {
        newOverrides = current.map(o => o.permission_code === code ? { ...o, granted } : o)
      }
    } else {
      newOverrides = [...current, { permission_code: code, granted }]
    }

    setOverrides.mutate(
      { userId, overrides: newOverrides },
      {
        onSuccess: () => toast({ title: granted ? t('users.toast.permission_granted') : t('users.toast.permission_revoked'), variant: 'success' }),
        onError: () => toast({ title: t('users.toast.permission_error'), variant: 'error' }),
      },
    )
  }, [userId, overridesData, setOverrides, toast, t])

  return (
    <PermissionMatrix
      userId={userId}
      editable={canEdit}
      onToggle={handleToggle}
      userOverrides={userOverrideSet}
    />
  )
}
