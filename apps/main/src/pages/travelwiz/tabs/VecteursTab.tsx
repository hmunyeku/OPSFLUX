import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plane, Ship, Anchor, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelContent } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useVectors, useDeleteVector } from '@/hooks/useTravelWiz'
import { usePermission } from '@/hooks/usePermission'
import { VECTOR_TYPE_MAP, type AnyRow } from '../shared'
import { StatCard } from '../components'

export function VecteursTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const confirmDialog = useConfirm()
  const deleteVector = useDeleteVector()
  const { hasPermission } = usePermission()
  const canDelete = hasPermission('travelwiz.voyage.delete')

  const { data, isLoading } = useVectors({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
  })

  const items: AnyRow[] = data?.items ?? []

  const stats = useMemo(() => {
    const byType: Record<string, number> = {}
    items.forEach((v: AnyRow) => { byType[v.type] = (byType[v.type] || 0) + 1 })
    const totalCapacity = items.reduce((sum: number, v: AnyRow) => sum + (v.pax_capacity ?? 0), 0)
    return { byType, totalCapacity, count: items.length }
  }, [items])

  const columns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: t('travelwiz.columns.name'),
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: 'registration',
      header: t('travelwiz.columns.registration'),
      size: 120,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.registration || '—'}</span>,
    },
    {
      accessorKey: 'type',
      header: t('travelwiz.columns.type'),
      size: 130,
      cell: ({ row }) => {
        const vt = VECTOR_TYPE_MAP[row.original.type]
        const VIcon = vt?.icon || Ship
        return (
          <span className={cn('gl-badge inline-flex items-center gap-1', vt?.badge || 'gl-badge-neutral')}>
            <VIcon size={10} />
            {vt?.label || row.original.type}
          </span>
        )
      },
    },
    {
      accessorKey: 'pax_capacity',
      header: t('travelwiz.columns.pax_capacity'),
      size: 100,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <Users size={11} className="text-muted-foreground" />
          {row.original.pax_capacity ?? '—'}
        </span>
      ),
    },
    {
      id: 'home_base',
      header: t('travelwiz.columns.base'),
      size: 110,
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate">{row.original.home_base_name || '—'}</span>,
    },
    ...(canDelete ? [{
      id: 'actions',
      header: '',
      size: 40,
      cell: ({ row }: { row: { original: { id: string } } }) => (
        <button
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={async (e: React.MouseEvent) => { e.stopPropagation(); const ok = await confirmDialog({ title: t('travelwiz.actions.delete_confirm_title'), message: t('travelwiz.actions.delete_vector_confirm'), confirmLabel: t('travelwiz.actions.delete'), variant: 'danger' }); if (ok) deleteVector.mutate(row.original.id) }}
          title={t('travelwiz.actions.delete')}
        >
          <span className="text-xs">&times;</span>
        </button>
      ),
    }] : []),
  ], [deleteVector, canDelete, t, confirmDialog])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={t('travelwiz.vectors')} value={stats.count} icon={Ship} />
        <StatCard label={t('travelwiz.columns.pax_capacity')} value={stats.totalCapacity} icon={Users} />
        <StatCard label={t('travelwiz.vector_types.helicopter')} value={stats.byType['helicopter'] ?? 0} icon={Plane} />
        <StatCard label={t('travelwiz.vector_types.ship')} value={(stats.byType['boat'] ?? 0) + (stats.byType['ship'] ?? 0)} icon={Anchor} />
      </div>

      <PanelContent scroll={false}>
        <DataTable<AnyRow>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par nom, immatriculation..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: row.id, meta: { subtype: 'vector' } })}
          emptyIcon={Ship}
          emptyTitle="Aucun vecteur"
          storageKey="travelwiz-vectors"
        />
      </PanelContent>
    </>
  )
}
