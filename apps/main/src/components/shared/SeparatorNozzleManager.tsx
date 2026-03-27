import { CircleDot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useSeparatorNozzles, useCreateSeparatorNozzle, useUpdateSeparatorNozzle, useDeleteSeparatorNozzle } from '@/hooks/useAssetRegistry'
import type { SeparatorNozzle, SeparatorNozzleCreate } from '@/types/assetRegistry'

export function SeparatorNozzleManager({ equipmentId, compact }: { equipmentId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const { data: items, isLoading } = useSeparatorNozzles(equipmentId)
  const create = useCreateSeparatorNozzle()
  const update = useUpdateSeparatorNozzle()
  const del = useDeleteSeparatorNozzle()

  const FIELDS: FieldDef<SeparatorNozzleCreate>[] = [
    { key: 'nozzle_mark', label: t('assets.sub.nozzle_mark'), required: true, placeholder: 'N1' },
    { key: 'nozzle_service', label: t('assets.sub.nozzle_service'), required: true, placeholder: 'Inlet' },
    { key: 'description', label: t('common.description') },
    { key: 'nominal_size_in', label: t('assets.sub.nominal_size_in'), required: true, placeholder: '8' },
    { key: 'schedule', label: t('assets.sub.schedule'), placeholder: '40' },
    { key: 'connection_type', label: t('assets.sub.connection_type'), placeholder: 'Flanged' },
    { key: 'flange_rating', label: t('assets.sub.flange_rating'), placeholder: '300#' },
    { key: 'nozzle_material', label: t('assets.sub.nozzle_material'), placeholder: 'CS' },
    { key: 'connected_to_tag', label: t('assets.sub.connected_to_tag'), placeholder: 'P-1001' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'nozzle_mark' as const, label: t('assets.sub.nozzle_mark') },
    { key: 'nozzle_service' as const, label: t('assets.sub.nozzle_service') },
    { key: 'nominal_size_in' as const, label: t('assets.sub.nominal_size_in'), format: (v: unknown) => v != null ? `${v}"` : '—' },
    { key: 'flange_rating' as const, label: t('assets.sub.flange_rating') },
  ]

  return (
    <SubModelManager<SeparatorNozzle, SeparatorNozzleCreate>
      items={items as SeparatorNozzle[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel={t('assets.sub.no_nozzles')}
      emptyIcon={CircleDot}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
