import { useState, useMemo } from 'react'
import { Repeat, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelContent } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { useRotations, useVectors } from '@/hooks/useTravelWiz'
import type { AnyRow } from '../shared'
import { StatCard } from '../components'

export function RotationsTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const { data, isLoading } = useRotations({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
  })

  const items: AnyRow[] = data?.items ?? []
  const { data: vectorsData } = useVectors({ page: 1, page_size: 200 })
  const vectorMap = useMemo(() => {
    const map: Record<string, string> = {}
    ;(vectorsData?.items ?? []).forEach((v: AnyRow) => { map[v.id] = v.name })
    return map
  }, [vectorsData])

  const stats = useMemo(() => {
    const active = items.filter((r: AnyRow) => r.active).length
    const inactive = items.filter((r: AnyRow) => !r.active).length
    return { active, inactive, count: items.length }
  }, [items])

  const columns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Libellé',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name || '—'}</span>,
    },
    {
      id: 'vector_name',
      header: 'Vecteur',
      size: 140,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{vectorMap[row.original.vector_id] || '—'}</span>,
    },
    {
      id: 'departure_base',
      header: 'Base départ',
      size: 130,
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate">{row.original.departure_base_name || '—'}</span>,
    },
    {
      accessorKey: 'schedule_description',
      header: 'Planification',
      size: 180,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate">
          {row.original.schedule_description || row.original.schedule_cron || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Statut',
      size: 90,
      cell: ({ row }) => (
        <span className={cn('gl-badge', row.original.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
          {row.original.active ? 'Actif' : 'Inactif'}
        </span>
      ),
    },
  ], [vectorMap])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Rotations" value={stats.count} icon={Repeat} />
        <StatCard label="Actives" value={stats.active} icon={CheckCircle2} accent="text-green-500" />
        <StatCard label="Inactives" value={stats.inactive} icon={XCircle} accent="text-muted-foreground" />
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
          searchPlaceholder="Rechercher une rotation..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: row.id, meta: { subtype: 'rotation' } })}
          emptyIcon={Repeat}
          emptyTitle="Aucune rotation"
          storageKey="travelwiz-rotations"
        />
      </PanelContent>
    </>
  )
}
