/**
 * RbacDelegationsTab — 4th sub-tab of the RBAC admin page.
 *
 * Sections (from top to bottom):
 * 1. KPI cards (active / expiring-7d / expired-30d / revoked-30d)
 * 2. Filterable list of all delegations in the tenant
 * 3. "Create delegation" modal wizard (3 steps)
 * 4. Revoke confirmation modal
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, FileDown, Loader2, X, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { DataTable } from '@/components/ui/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import {
  useDelegations,
  useRevokeDelegation,
} from '@/hooks/useRbac'
import { delegationCertificateUrl, exportDelegationRegistryUrl } from '@/services/rbacService'
import type { DelegationListItem, DelegationStatus } from '@/services/rbacService'
import { DelegationCreateWizard } from './rbac/DelegationCreateWizard'
import { formatDate } from '@/lib/i18n'
import { downloadPdf } from '@/lib/downloadPdf'

// ════════════════════════════════════════════════════════════
// Status badge helper
// ════════════════════════════════════════════════════════════

const STATUS_BADGE_TONES: Record<DelegationStatus, { bg: string; text: string; labelKey: string; fallback: string }> = {
  active: { bg: 'bg-emerald-100', text: 'text-emerald-700', labelKey: 'rbac.delegations.status.active', fallback: 'Active' },
  programmed: { bg: 'bg-blue-100', text: 'text-blue-700', labelKey: 'rbac.delegations.status.programmed', fallback: 'Programmée' },
  expired: { bg: 'bg-slate-100', text: 'text-slate-600', labelKey: 'rbac.delegations.status.expired', fallback: 'Expirée' },
  revoked: { bg: 'bg-red-100', text: 'text-red-700', labelKey: 'rbac.delegations.status.revoked', fallback: 'Révoquée' },
}

function StatusBadge({ status }: { status: DelegationStatus }) {
  const { t } = useTranslation()
  const cfg = STATUS_BADGE_TONES[status]
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {t(cfg.labelKey, cfg.fallback)}
    </span>
  )
}

// ════════════════════════════════════════════════════════════
// KPI cards
// ════════════════════════════════════════════════════════════

function KpiCards({ delegations }: { delegations: DelegationListItem[] }) {
  const { t } = useTranslation()
  const stats = useMemo(() => {
    const now = new Date()
    const in7days = new Date(now.getTime() + 7 * 86400000)
    const thirty_ago = new Date(now.getTime() - 30 * 86400000)
    let active = 0, expiringSoon = 0, expired30d = 0, revoked30d = 0
    for (const d of delegations) {
      const endDate = new Date(d.end_date)
      if (d.status === 'active') {
        active++
        if (endDate <= in7days) expiringSoon++
      } else if (d.status === 'expired' && endDate >= thirty_ago) {
        expired30d++
      } else if (d.status === 'revoked' && endDate >= thirty_ago) {
        // end_date is used as a proxy for "recently revoked" since
        // revoked_at is not exposed on DelegationListItem. A revoked
        // delegation whose end_date is older than 30 days is not counted.
        revoked30d++
      }
    }
    return { active, expiringSoon, expired30d, revoked30d }
  }, [delegations])

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard label={t('rbac.delegations.kpi.active', 'Actives')} value={stats.active} tone="blue" />
      <KpiCard label={t('rbac.delegations.kpi.expiring_soon', 'Expirent dans 7j')} value={stats.expiringSoon} tone="orange" />
      <KpiCard label={t('rbac.delegations.kpi.expired_30d', 'Expirées (30j)')} value={stats.expired30d} tone="slate" />
      <KpiCard label={t('rbac.delegations.kpi.revoked_30d', 'Révoquées (30j)')} value={stats.revoked30d} tone="red" />
    </div>
  )
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'orange' | 'slate' | 'red' }) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-900/30 dark:border-orange-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-900 dark:bg-slate-900/30 dark:border-slate-700',
    red: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-900/30 dark:border-red-700',
  }
  return (
    <div className={`rounded-lg border p-3 ${colorMap[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════

export function RbacDelegationsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [statusFilter, setStatusFilter] = useState<DelegationStatus | ''>('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')

  const { data: delegations = [], isLoading, refetch } = useDelegations(
    statusFilter ? { status: statusFilter } : {}
  )
  const revokeMutation = useRevokeDelegation()

  const handleRevoke = async () => {
    if (!revokingId) return
    try {
      await revokeMutation.mutateAsync({ id: revokingId, reason: revokeReason })
      toast({ title: t('rbac.delegations.toast.revoked', 'Délégation révoquée'), variant: 'success' })
      setRevokingId(null)
      setRevokeReason('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({ title: t('rbac.delegations.toast.error', 'Erreur'), description: msg, variant: 'error' })
    }
  }

  const columns: ColumnDef<DelegationListItem>[] = useMemo(() => [
    { accessorKey: 'delegator_name', header: t('rbac.delegations.columns.delegator', 'Délégant') },
    { accessorKey: 'delegate_name', header: t('rbac.delegations.columns.delegate', 'Délégué') },
    {
      accessorKey: 'start_date',
      header: t('rbac.delegations.columns.period', 'Période'),
      cell: ({ row }) => (
        <span className="text-xs text-slate-600">
          {formatDate(row.original.start_date)} → {formatDate(row.original.end_date)}
        </span>
      ),
    },
    {
      accessorKey: 'permissions_count',
      header: t('rbac.delegations.columns.perms', 'Perms'),
      cell: ({ row }) => <span className="font-mono">{row.original.permissions_count}</span>,
    },
    {
      accessorKey: 'status',
      header: t('rbac.delegations.columns.status', 'Statut'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => downloadPdf(delegationCertificateUrl(row.original.id))}
            className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            title={t('rbac.delegations.actions.download_certificate', 'Télécharger le certificat PDF')}
          >
            <FileDown className="h-3.5 w-3.5" />
          </button>
          {row.original.status === 'active' && (
            <button
              type="button"
              onClick={() => setRevokingId(row.original.id)}
              className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              title={t('rbac.delegations.actions.revoke', 'Révoquer')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ], [t])

  return (
    <div className="space-y-4 p-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('rbac.delegations.title', 'Délégations')}</h2>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as DelegationStatus | '')}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">{t('rbac.delegations.filter.all', 'Tous statuts')}</option>
            <option value="active">{t('rbac.delegations.filter.active', 'Actives')}</option>
            <option value="programmed">{t('rbac.delegations.filter.programmed', 'Programmées')}</option>
            <option value="expired">{t('rbac.delegations.filter.expired', 'Expirées')}</option>
            <option value="revoked">{t('rbac.delegations.filter.revoked', 'Révoquées')}</option>
          </select>
          <button
            type="button"
            onClick={() => downloadPdf(exportDelegationRegistryUrl({ lang: 'fr' }, statusFilter || undefined))}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          >
            <FileDown className="h-4 w-4" />
            {t('rbac.delegations.toolbar.export_registry', 'Export registre')}
          </button>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            {t('rbac.delegations.toolbar.create', 'Créer une délégation')}
          </button>
        </div>
      </div>

      <KpiCards delegations={delegations} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={delegations}
          getRowId={(row) => row.id}
          emptyTitle={t('rbac.delegations.empty', 'Aucune délégation')}
        />
      )}

      {/* Create wizard */}
      {wizardOpen && (
        <DelegationCreateWizard
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false)
            refetch()
          }}
        />
      )}

      {/* Revoke confirmation modal */}
      {revokingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-lg bg-white p-4 dark:bg-slate-800">
            <div className="mb-3 flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <h3 className="text-lg font-semibold">{t('rbac.delegations.revoke.title', 'Révoquer cette délégation ?')}</h3>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              {t('rbac.delegations.revoke.warning', "Le délégué perdra immédiatement ces permissions. Cette action est tracée dans l'audit ISO.")}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">{t('rbac.delegations.revoke.reason_label', 'Motif (obligatoire, minimum 10 caractères — exigence ISO 27001 §A.9.2.6)')}</span>
              <textarea
                value={revokeReason}
                onChange={e => setRevokeReason(e.target.value)}
                rows={3}
                minLength={10}
                className="w-full rounded-md border border-slate-300 p-2 text-sm"
                placeholder={t('rbac.delegations.revoke.reason_placeholder', 'Ex: Demande explicite du délégué, fin de mission, etc.')}
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRevokingId(null); setRevokeReason('') }}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                {t('rbac.delegations.revoke.cancel', 'Annuler')}
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revokeReason.trim().length < 10 || revokeMutation.isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {revokeMutation.isPending ? t('rbac.delegations.revoke.in_progress', 'Révocation…') : t('rbac.delegations.revoke.confirm', 'Révoquer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
