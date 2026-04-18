import { useTranslation } from 'react-i18next'
import { useComplianceStats, useExpiringCredentials, useComplianceMatrix, useCredentialTypes } from '@/hooks/usePaxlog'
import { useState, useMemo } from 'react'
import type { CredentialType, ExpiringCredential, ComplianceMatrixEntry } from '@/services/paxlogService'
import type { ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, Shield, XCircle, Clock, FileCheck2 } from 'lucide-react'
import { PanelContent } from '@/components/layout/PanelHeader'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { formatDate, CountdownBadge, StatusBadge, StatCard } from '../shared'

export function ComplianceTab() {
  const { t } = useTranslation()
  const { data: complianceStats } = useComplianceStats()
  const { data: expiringCreds, isLoading: expiringLoading } = useExpiringCredentials(90)
  const { data: matrix, isLoading: matrixLoading } = useComplianceMatrix()
  const { data: credentialTypes } = useCredentialTypes()
  const [search, setSearch] = useState('')

  // Build credential type lookup
  const credTypeMap = useMemo(() => {
    const m: Record<string, CredentialType> = {}
    credentialTypes?.forEach((ct) => { m[ct.id] = ct })
    return m
  }, [credentialTypes])

  // Filter expiring creds
  const filteredExpiring = useMemo(() => {
    if (!expiringCreds) return []
    if (!search) return expiringCreds
    const q = search.toLowerCase()
    return expiringCreds.filter((c) =>
      c.pax_last_name.toLowerCase().includes(q) ||
      c.pax_first_name.toLowerCase().includes(q) ||
      c.credential_type_name.toLowerCase().includes(q) ||
      (c.pax_company_name || '').toLowerCase().includes(q)
    )
  }, [expiringCreds, search])

  const expiringColumns = useMemo<ColumnDef<ExpiringCredential, unknown>[]>(() => [
    {
      id: 'pax',
      header: t('paxlog.columns.pax'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground block">{row.original.pax_last_name} {row.original.pax_first_name}</span>
          {row.original.pax_company_name && (
            <span className="text-[10px] text-muted-foreground block truncate">{row.original.pax_company_name}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'credential_type_name',
      header: t('paxlog.credentials'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="text-foreground text-xs">{row.original.credential_type_name}</span>
          <span className="text-[10px] text-muted-foreground block">{row.original.credential_type_category}</span>
        </div>
      ),
    },
    {
      accessorKey: 'expiry_date',
      header: t('paxlog.compliance_tab.expiry'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDate(row.original.expiry_date)}</span>,
      size: 100,
    },
    {
      id: 'countdown',
      header: t('paxlog.compliance_tab.delay'),
      cell: ({ row }) => <CountdownBadge days={row.original.days_remaining} />,
      size: 70,
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      size: 90,
    },
  ], [t])

  const matrixColumns = useMemo<ColumnDef<ComplianceMatrixEntry, unknown>[]>(() => [
    {
      accessorKey: 'asset_id',
      header: t('assets.title'),
      cell: ({ row }) => <span className="text-xs font-mono text-foreground truncate block max-w-[180px]">{row.original.asset_id}</span>,
    },
    {
      accessorKey: 'credential_type_id',
      header: t('paxlog.compliance_tab.required_credential'),
      cell: ({ row }) => {
        const ct = credTypeMap[row.original.credential_type_id]
        return <span className="text-xs text-foreground">{ct?.name || row.original.credential_type_id}</span>
      },
    },
    {
      accessorKey: 'scope',
      header: t('paxlog.compliance_tab.scope'),
      cell: ({ row }) => {
        const labels: Record<string, string> = {
          all_visitors: t('paxlog.compliance_tab.scope_values.all_visitors'),
          contractors_only: t('paxlog.compliance_tab.scope_values.contractors_only'),
          permanent_staff_only: t('paxlog.compliance_tab.scope_values.permanent_staff_only'),
        }
        return <span className="gl-badge gl-badge-neutral">{labels[row.original.scope] || row.original.scope}</span>
      },
      size: 120,
    },
    {
      accessorKey: 'mandatory',
      header: t('paxlog.compliance_tab.mandatory'),
      cell: ({ row }) => row.original.mandatory
        ? <CheckCircle2 size={14} className="text-green-600" />
        : <span className="text-muted-foreground text-xs">{t('common.no')}</span>,
      size: 80,
    },
    {
      accessorKey: 'defined_by',
      header: t('paxlog.compliance_tab.defined_by'),
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.defined_by === 'hse_central' ? t('paxlog.compliance_tab.defined_by_values.hse_central') : t('paxlog.compliance_tab.defined_by_values.site')}</span>,
      size: 100,
    },
  ], [credTypeMap, t])

  return (
    <PanelContent>
      <div className="p-4 space-y-5">
        {/* Stats */}
        {complianceStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label={t('paxlog.compliance_tab.kpis.rate')} value={`${complianceStats.compliance_rate}%`} icon={Shield} accent={complianceStats.compliance_rate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} />
            <StatCard label={t('paxlog.compliance_tab.kpis.compliant')} value={complianceStats.compliant_pax} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
            <StatCard label={t('paxlog.compliance_tab.kpis.non_compliant')} value={complianceStats.non_compliant_pax} icon={XCircle} accent={complianceStats.non_compliant_pax > 0 ? 'text-destructive' : undefined} />
            <StatCard label={t('paxlog.compliance_tab.kpis.expiring_soon')} value={complianceStats.expiring_soon} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
          </div>
        )}

        {/* Expiring credentials table */}
        <CollapsibleSection id="comp-expiring" title={t('paxlog.compliance_tab.sections.expiring', { count: filteredExpiring.length })} defaultExpanded>
          <DataTable<ExpiringCredential>
            columns={expiringColumns}
            data={filteredExpiring}
            isLoading={expiringLoading}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('paxlog.search_certification')}
            emptyIcon={FileCheck2}
            emptyTitle={t('paxlog.no_certification_expiring_soon')}
            storageKey="paxlog-expiring"
          />
        </CollapsibleSection>

        {/* Compliance matrix */}
        <CollapsibleSection id="comp-matrix" title={t('paxlog.compliance_tab.sections.matrix', { count: matrix?.length ?? 0 })}>
          <DataTable<ComplianceMatrixEntry>
            columns={matrixColumns}
            data={matrix ?? []}
            isLoading={matrixLoading}
            emptyIcon={Shield}
            emptyTitle={t('paxlog.no_compliance_entry')}
            storageKey="paxlog-compliance-matrix"
          />
        </CollapsibleSection>
      </div>
    </PanelContent>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 5: SIGNALEMENTS
// ═══════════════════════════════════════════════════════════════

