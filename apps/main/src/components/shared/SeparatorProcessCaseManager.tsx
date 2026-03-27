import { FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useSeparatorProcessCases, useCreateSeparatorProcessCase, useUpdateSeparatorProcessCase, useDeleteSeparatorProcessCase } from '@/hooks/useAssetRegistry'
import type { SeparatorProcessCase, SeparatorProcessCaseCreate } from '@/types/assetRegistry'

export function SeparatorProcessCaseManager({ equipmentId, compact }: { equipmentId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const { data: items, isLoading } = useSeparatorProcessCases(equipmentId)
  const create = useCreateSeparatorProcessCase()
  const update = useUpdateSeparatorProcessCase()
  const del = useDeleteSeparatorProcessCase()

  const FIELDS: FieldDef<SeparatorProcessCaseCreate>[] = [
    { key: 'case_name', label: t('assets.sub.case_name'), required: true, placeholder: 'Design' },
    { key: 'case_description', label: t('common.description') },
    { key: 'inlet_pressure_barg', label: t('assets.sub.inlet_pressure'), placeholder: '35.0' },
    { key: 'inlet_temp_c', label: t('assets.sub.inlet_temp'), placeholder: '65' },
    { key: 'inlet_gas_flow_mmscfd', label: t('assets.sub.inlet_gas_flow'), placeholder: '50.0' },
    { key: 'inlet_oil_flow_sm3d', label: t('assets.sub.inlet_oil_flow'), placeholder: '1500' },
    { key: 'inlet_water_flow_sm3d', label: t('assets.sub.inlet_water_flow'), placeholder: '500' },
    { key: 'op_pressure_barg', label: t('assets.sub.op_pressure'), placeholder: '30.0' },
    { key: 'op_temp_c', label: t('assets.sub.op_temp'), placeholder: '60' },
    { key: 'simulation_tool', label: t('assets.sub.simulation_tool'), placeholder: 'HYSYS' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'case_name' as const, label: t('assets.sub.case_name') },
    { key: 'inlet_pressure_barg' as const, label: t('assets.sub.inlet_pressure'), format: (v: unknown) => v != null ? `${v} barg` : '—' },
    { key: 'op_pressure_barg' as const, label: t('assets.sub.op_pressure'), format: (v: unknown) => v != null ? `${v} barg` : '—' },
  ]

  return (
    <SubModelManager<SeparatorProcessCase, SeparatorProcessCaseCreate>
      items={items as SeparatorProcessCase[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel={t('assets.sub.no_process_cases')}
      emptyIcon={FlaskConical}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
