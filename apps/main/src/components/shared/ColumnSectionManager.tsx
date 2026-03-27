import { Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useColumnSections, useCreateColumnSection, useUpdateColumnSection, useDeleteColumnSection } from '@/hooks/useAssetRegistry'
import type { ColumnSection, ColumnSectionCreate } from '@/types/assetRegistry'

export function ColumnSectionManager({ equipmentId, compact }: { equipmentId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const { data: items, isLoading } = useColumnSections(equipmentId)
  const create = useCreateColumnSection()
  const update = useUpdateColumnSection()
  const del = useDeleteColumnSection()

  const FIELDS: FieldDef<ColumnSectionCreate>[] = [
    { key: 'section_number', label: t('assets.sub.section_number'), required: true, placeholder: '1' },
    { key: 'section_name', label: t('assets.sub.section_name'), placeholder: 'Wash section' },
    { key: 'internals_type', label: t('assets.sub.internals_type'), required: true, placeholder: 'TRAYS' },
    { key: 'tray_count', label: t('assets.sub.tray_count'), placeholder: '20' },
    { key: 'packing_type', label: t('assets.sub.packing_type'), placeholder: 'Structured' },
    { key: 'packing_height_m', label: t('assets.sub.packing_height'), placeholder: '6.0' },
    { key: 'notes', label: t('common.notes') },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'section_number' as const, label: '#' },
    { key: 'section_name' as const, label: t('assets.sub.section_name') },
    { key: 'internals_type' as const, label: t('assets.sub.internals_type') },
    { key: 'tray_count' as const, label: t('assets.sub.tray_count') },
  ]

  return (
    <SubModelManager<ColumnSection, ColumnSectionCreate>
      items={items as ColumnSection[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel={t('assets.sub.no_sections')}
      emptyIcon={Layers}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
