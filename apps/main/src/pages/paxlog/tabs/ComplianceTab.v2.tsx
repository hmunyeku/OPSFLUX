/**
 * ComplianceTab.v2.tsx — Pajamas++ refonte. Mêmes hooks que ComplianceTab.tsx :
 *   useComplianceStats, useExpiringCredentials(90), useComplianceMatrix, useCredentialTypes.
 * Le DataTable existant garde sa logique de tri/recherche/pagination.
 */
import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { useComplianceStats, useExpiringCredentials, useComplianceMatrix, useCredentialTypes } from '@/hooks/usePaxlog'
import { CheckCircle2, Shield, XCircle, Clock, FileCheck2, Download } from 'lucide-react'
import type { CredentialType, ExpiringCredential, ComplianceMatrixEntry } from '@/services/paxlogService'
import type { ColumnDef } from '@tanstack/react-table'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { formatDate, CountdownBadge, StatusBadge } from '../shared'
import { PaxlogPageHeader, PaxlogStatRail } from '../components/PaxlogShell'

export function ComplianceTabV2() {
  const { t } = useTranslation()
  const { data: stats } = useComplianceStats()
  const { data: expiringCreds, isLoading: expiringLoading } = useExpiringCredentials(90)
  const { data: matrix, isLoading: matrixLoading } = useComplianceMatrix()
  const { data: credentialTypes } = useCredentialTypes()
  const [search, setSearch] = useState('')

  const credTypeMap = useMemo(() => {
    const m: Record<string, CredentialType> = {}
    credentialTypes?.forEach((ct) => { m[ct.id] = ct })
    return m
  }, [credentialTypes])

  const filtered = useMemo(() => {
    if (!expiringCreds) return []
    if (!search) return expiringCreds
    const q = search.toLowerCase()
    return expiringCreds.filter((c) =>
      c.pax_last_name.toLowerCase().includes(q) ||
      c.pax_first_name.toLowerCase().includes(q) ||
      c.credential_type_name.toLowerCase().includes(q) ||
      (c.pax_company_name || '').toLowerCase().includes(q),
    )
  }, [expiringCreds, search])

  const expiringColumns = useMemo<ColumnDef<ExpiringCredential, unknown>[]>(() => [
    { id: 'pax', header: t('paxlog.columns.pax'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground block">{row.original.pax_last_name} {row.original.pax_first_name}</span>
          {row.original.pax_company_name && <span className="text-[10px] text-muted-foreground block truncate">{row.original.pax_company_name}</span>}
        </div>
      ) },
    { accessorKey: 'credential_type_name', header: t('paxlog.credentials'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="text-foreground text-xs">{row.original.credential_type_name}</span>
          <span className="text-[10px] text-muted-foreground block">{row.original.credential_type_category}</span>
        </div>
      ) },
    { accessorKey: 'expiry_date', header: t('paxlog.compliance_tab.expiry'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDate(row.original.expiry_date)}</span>, size: 100 },
    { id: 'countdown', header: t('paxlog.compliance_tab.delay'),
      cell: ({ row }) => <CountdownBadge days={row.original.days_remaining} />, size: 70 },
    { accessorKey: 'status', header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />, size: 90 },
  ], [t])

  const matrixColumns = useMemo<ColumnDef<ComplianceMatrixEntry, unknown>[]>(() => [
    { accessorKey: 'asset_id', header: t('assets.title'),
      cell: ({ row }) => <span className="text-xs font-mono text-foreground truncate block max-w-[180px]">{row.original.asset_id}</span> },
    { accessorKey: 'credential_type_id', header: t('paxlog.compliance_tab.required_credential'),
      cell: ({ row }) => {
        const ct = credTypeMap[row.original.credential_type_id]
        return <span className="text-xs text-foreground">{ct?.name || row.original.credential_type_id}</span>
      } },
    { accessorKey: 'scope', header: t('paxlog.compliance_tab.scope'),
      cell: ({ row }) => <span className="chip">{row.original.scope}</span>, size: 140 },
    { accessorKey: 'mandatory', header: t('paxlog.compliance_tab.mandatory'),
      cell: ({ row }) => row.original.mandatory
        ? <CheckCircle2 size={14} className="text-green-600" />
        : <span className="text-muted-foreground text-xs">{t('common.no')}</span>, size: 80 },
    { accessorKey: 'defined_by', header: t('paxlog.compliance_tab.defined_by'),
      cell: ({ row }) => <span className="chip">{row.original.defined_by}</span>, size: 100 },
  ], [credTypeMap, t])

  return (
    <>
      <PaxlogPageHeader
        title={t('paxlog.tabs.compliance', 'Conformité')}
        subtitle={t('paxlog.compliance.subtitle', 'Habilitations, matrices de conformité par site')}
        actions={<button className="btn-sm btn-secondary"><Download size={12} /> {t('common.export')}</button>}
      />

      <PaxlogStatRail items={[
        { id: 'rate', label: t('paxlog.compliance_tab.kpis.rate'),
          value: typeof stats?.compliance_rate === 'number' ? `${stats.compliance_rate}%` : '—',
          icon: Shield,
          tone: (stats?.compliance_rate ?? 0) >= 90 ? 'success' : (stats?.compliance_rate ?? 0) >= 70 ? 'warning' : 'danger' },
        { id: 'compliant', label: t('paxlog.compliance_tab.kpis.compliant'),
          value: stats?.compliant_pax ?? 0, icon: CheckCircle2, tone: 'success' },
        { id: 'non_compliant', label: t('paxlog.compliance_tab.kpis.non_compliant'),
          value: stats?.non_compliant_pax ?? 0, icon: XCircle,
          tone: (stats?.non_compliant_pax ?? 0) > 0 ? 'danger' : undefined },
        { id: 'expiring', label: t('paxlog.compliance_tab.kpis.expiring_soon'),
          value: stats?.expiring_soon ?? 0, icon: Clock,
          tone: (stats?.expiring_soon ?? 0) > 0 ? 'warning' : undefined },
        { id: 'expired', label: t('paxlog.compliance_tab.kpis.expired', 'Expirées'),
          value: stats?.expired ?? 0, icon: XCircle,
          tone: (stats?.expired ?? 0) > 0 ? 'danger' : undefined },
      ]} />

      <PanelContent scroll>
        <div className="p-4 space-y-5">
          <section>
            <header className="paxlog-section-head">
              <h3>{t('paxlog.compliance_tab.sections.expiring', { count: filtered.length })}</h3>
            </header>
            <DataTable<ExpiringCredential>
              columns={expiringColumns}
              data={filtered}
              isLoading={expiringLoading}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('paxlog.search_certification')}
              emptyIcon={FileCheck2}
              emptyTitle={t('paxlog.no_certification_expiring_soon')}
              storageKey="paxlog-expiring-v2"
            />
          </section>

          <section>
            <header className="paxlog-section-head">
              <h3>{t('paxlog.compliance_tab.sections.matrix', { count: matrix?.length ?? 0 })}</h3>
            </header>
            <DataTable<ComplianceMatrixEntry>
              columns={matrixColumns}
              data={matrix ?? []}
              isLoading={matrixLoading}
              emptyIcon={Shield}
              emptyTitle={t('paxlog.no_compliance_entry')}
              storageKey="paxlog-compliance-matrix-v2"
            />
          </section>
        </div>
      </PanelContent>
    </>
  )
}
