import { TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { usePumpCurvePoints, useCreatePumpCurvePoint, useUpdatePumpCurvePoint, useDeletePumpCurvePoint } from '@/hooks/useAssetRegistry'
import type { PumpCurvePoint, PumpCurvePointCreate } from '@/types/assetRegistry'

export function PumpCurvePointManager({ equipmentId, compact }: { equipmentId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const { data: items, isLoading } = usePumpCurvePoints(equipmentId)
  const create = useCreatePumpCurvePoint()
  const update = useUpdatePumpCurvePoint()
  const del = useDeletePumpCurvePoint()

  const FIELDS: FieldDef<PumpCurvePointCreate>[] = [
    { key: 'flow_m3h', label: t('assets.sub.flow_m3h'), required: true, placeholder: '120' },
    { key: 'head_m', label: t('assets.sub.head_m'), placeholder: '85' },
    { key: 'efficiency_pct', label: t('assets.sub.efficiency_pct'), placeholder: '78' },
    { key: 'power_kw', label: t('assets.sub.power_kw'), placeholder: '45' },
    { key: 'npshr_m', label: t('assets.sub.npshr_m'), placeholder: '3.2' },
    { key: 'speed_rpm', label: t('assets.sub.speed_rpm'), placeholder: '2950' },
    { key: 'source', label: t('assets.sub.source'), placeholder: 'MANUFACTURER' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'flow_m3h' as const, label: t('assets.sub.flow_m3h'), format: (v: unknown) => v != null ? `${v} m³/h` : '—' },
    { key: 'head_m' as const, label: t('assets.sub.head_m'), format: (v: unknown) => v != null ? `${v} m` : '—' },
    { key: 'efficiency_pct' as const, label: t('assets.sub.efficiency_pct'), format: (v: unknown) => v != null ? `${v}%` : '—' },
    { key: 'power_kw' as const, label: t('assets.sub.power_kw'), format: (v: unknown) => v != null ? `${v} kW` : '—' },
  ]

  return (
    <SubModelManager<PumpCurvePoint, PumpCurvePointCreate>
      items={items as PumpCurvePoint[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel={t('assets.sub.no_curve_points')}
      emptyIcon={TrendingUp}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
