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

const STATUS_BADGE: Record<DelegationStatus, { label: string; bg: string; text: string }> = {
  active: { label: 'Active', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  programmed: { label: 'Programmée', bg: 'bg-blue-100', text: 'text-blue-700' },
  expired: { label: 'Expirée', bg: 'bg-slate-100', text: 'text-slate-600' },
  revoked: { label: 'Révoquée', bg: 'bg-red-100', text: 'text-red-700' },
}

function StatusBadge({ status }: { status: DelegationStatus }) {
  const cfg = STATUS_BADGE[status]
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ════════════════════════════════════════════════════════════
// KPI cards
// ════════════════════════════════════════════════════════════

function KpiCards({ delegations }: { delegations: DelegationListItem[] }) {
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
      } else if (d.status === 'revoked') {
        revoked30d++
      }
    }
    return { active, expiringSoon, expired30d, revoked30d }
  }, [delegations])

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard label="Actives" value={stats.active} tone="blue" />
      <KpiCard label="Expirent dans 7j" value={stats.expiringSoon} tone="orange" />
      <KpiCard label="Expirées (30j)" value={stats.expired30d} tone="slate" />
      <KpiCard label="Révoquées (30j)" value={stats.revoked30d} tone="red" />
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
      toast({ title: 'Délégation révoquée', variant: 'success' })
      setRevokingId(null)
      setRevokeReason('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({ title: 'Erreur', description: msg, variant: 'error' })
    }
  }

  const columns: ColumnDef<DelegationListItem>[] = useMemo(() => [
    { accessorKey: 'delegator_name', header: 'Délégant' },
    { accessorKey: 'delegate_name', header: 'Délégué' },
    {
      accessorKey: 'start_date',
      header: 'Période',
      cell: ({ row }) => (
        <span className="text-xs text-slate-600">
          {formatDate(row.original.start_date)} → {formatDate(row.original.end_date)}
        </span>
      ),
    },
    {
      accessorKey: 'permissions_count',
      header: 'Perms',
      cell: ({ row }) => <span className="font-mono">{row.original.permissions_count}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
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
            title="Télécharger le certificat PDF"
          >
            <FileDown className="h-3.5 w-3.5" />
          </button>
          {row.original.status === 'active' && (
            <button
              type="button"
              onClick={() => setRevokingId(row.original.id)}
              className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              title="Révoquer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ], [])

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
            <option value="">Tous statuts</option>
            <option value="active">Actives</option>
            <option value="programmed">Programmées</option>
            <option value="expired">Expirées</option>
            <option value="revoked">Révoquées</option>
          </select>
          <button
            type="button"
            onClick={() => downloadPdf(exportDelegationRegistryUrl({ lang: 'fr' }, statusFilter || undefined))}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          >
            <FileDown className="h-4 w-4" />
            Export registre
          </button>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Créer une délégation
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
          emptyTitle="Aucune délégation"
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
              <h3 className="text-lg font-semibold">Révoquer cette délégation ?</h3>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              Le délégué perdra immédiatement ces permissions. Cette action est tracée dans l'audit ISO.
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Motif (obligatoire)</span>
              <textarea
                value={revokeReason}
                onChange={e => setRevokeReason(e.target.value)}
                rows={3}
                minLength={5}
                className="w-full rounded-md border border-slate-300 p-2 text-sm"
                placeholder="Ex: Demande du délégué, fin de mission, etc."
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRevokingId(null); setRevokeReason('') }}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revokeReason.trim().length < 5 || revokeMutation.isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {revokeMutation.isPending ? 'Révocation…' : 'Révoquer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
