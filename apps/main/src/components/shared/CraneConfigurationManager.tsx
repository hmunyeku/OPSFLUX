import { Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useCraneConfigurations, useCreateCraneConfiguration, useUpdateCraneConfiguration, useDeleteCraneConfiguration } from '@/hooks/useAssetRegistry'
import type { CraneConfiguration, CraneConfigurationCreate } from '@/types/assetRegistry'

export function CraneConfigurationManager({ equipmentId, compact }: { equipmentId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const { data: items, isLoading } = useCraneConfigurations(equipmentId)
  const create = useCreateCraneConfiguration()
  const update = useUpdateCraneConfiguration()
  const del = useDeleteCraneConfiguration()

  const FIELDS: FieldDef<CraneConfigurationCreate>[] = [
    { key: 'config_code', label: t('assets.sub.config_code'), required: true, placeholder: 'MAIN-30m' },
    { key: 'config_name', label: t('assets.sub.config_name'), placeholder: 'Main boom 30m' },
    { key: 'boom_length_m', label: t('assets.sub.boom_length_m'), placeholder: '30.0' },
    { key: 'counterweight_tonnes', label: t('assets.sub.counterweight_tonnes'), placeholder: '5.0' },
    { key: 'reeving_parts', label: t('assets.sub.reeving_parts'), placeholder: '4' },
    { key: 'config_max_capacity_tonnes', label: t('assets.sub.config_max_capacity'), placeholder: '25.0' },
    { key: 'config_max_radius_m', label: t('assets.sub.config_max_radius'), placeholder: '18.0' },
    { key: 'notes', label: t('common.notes') },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'config_code' as const, label: t('assets.sub.config_code') },
    { key: 'boom_length_m' as const, label: t('assets.sub.boom_length_m'), format: (v: unknown) => v != null ? `${v} m` : '—' },
    { key: 'config_max_capacity_tonnes' as const, label: t('assets.sub.config_max_capacity'), format: (v: unknown) => v != null ? `${v} t` : '—' },
  ]

  return (
    <SubModelManager<CraneConfiguration, CraneConfigurationCreate>
      items={items as CraneConfiguration[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel={t('assets.sub.no_configurations')}
      emptyIcon={Settings2}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
